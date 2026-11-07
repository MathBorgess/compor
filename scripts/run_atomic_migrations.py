#!/usr/bin/env python3
"""Apply checked-in Supabase migrations and their history in one transaction.

The native Supabase history must already exist and match a prefix of these
exact files. The runner never bootstraps or repairs history. Credentials and
verified TLS settings come from libpq's environment, not command arguments.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys

import psycopg2
from pglast import ast, parse_sql, split
from pglast.visitors import Visitor

FILENAME = re.compile(r'^(\d{14})_([a-z0-9_]+)\.sql$')
# These statements cannot safely be embedded in the transaction or use a
# separate protocol/connection. PostgreSQL rejects additional unsupported DDL.
DISALLOWED = frozenset({
    'TransactionStmt', 'CopyStmt', 'VacuumStmt', 'ClusterStmt',
    'AlterSystemStmt', 'ReindexStmt', 'CreatedbStmt', 'DropdbStmt',
    'CreateTableSpaceStmt', 'DropTableSpaceStmt', 'CreateSubscriptionStmt',
    'AlterSubscriptionStmt', 'DropSubscriptionStmt', 'VariableSetStmt',
})
REQUIRED_BASELINE = '20261105000016'


@dataclass(frozen=True)
class Migration:
    version: str
    name: str
    statements: tuple[str, ...]


class MigrationError(Exception):
    pass


class ReservedRelations(Visitor):
    def visit_RangeVar(self, ancestors, node):
        del ancestors
        if node.schemaname in {'supabase_migrations', 'compor_migration_control'}:
            raise MigrationError('migration cannot access migration control relations')


def load_migrations(directory: Path) -> tuple[Migration, ...]:
    if not directory.is_dir() or directory.is_symlink():
        raise MigrationError('migration directory unavailable or symbolic')
    files = sorted(directory.iterdir(), key=lambda file: file.name)
    if not files:
        raise MigrationError('no migration files')
    migrations = []
    for file in files:
        match = FILENAME.fullmatch(file.name)
        if not match or file.is_symlink() or not file.is_file():
            raise MigrationError(f'unexpected migration file: {file.name}')
        raw = file.read_bytes()
        if len(raw) > 4 * 1024 * 1024:
            raise MigrationError(f'migration exceeds size limit: {file.name}')
        source = raw.decode('utf-8')
        if source.lstrip('\ufeff').splitlines()[:1] == ['-- pg-delta: transaction=false']:
            raise MigrationError(f'nontransactional migration: {file.name}')
        # Parse the entire file before opening the database connection. The
        # scanner preserves comments and matches Supabase CLI 3 history tokens.
        statements = tuple(split(source, with_parser=False))
        nodes = parse_sql(source)
        if not statements or len(nodes) != len(statements):
            raise MigrationError(f'unsupported SQL structure: {file.name}')
        for text in statements:
            parsed = parse_sql(text)
            if len(parsed) != 1:
                raise MigrationError(f'unsupported statement boundary: {file.name}')
            statement = parsed[0].stmt
            kind = type(statement).__name__
            if kind in DISALLOWED or (isinstance(statement, (ast.IndexStmt, ast.DropStmt)) and statement.concurrent):
                raise MigrationError(f'nontransactional SQL in {file.name}: {kind}')
            ReservedRelations()(statement)
        migrations.append(Migration(match.group(1), match.group(2), statements))
    versions = [item.version for item in migrations]
    if len(set(versions)) != len(versions) or versions != sorted(versions):
        raise MigrationError('duplicate or unordered migration versions')
    if REQUIRED_BASELINE not in versions:
        raise MigrationError('reviewed baseline is absent from local migrations')
    return tuple(migrations)


def apply(conn, migrations: tuple[Migration, ...]) -> int:
    """Return applied count only after COMMIT has been acknowledged."""
    if conn.autocommit:
        raise MigrationError('autocommit is not permitted')
    with conn.cursor() as cur:
        cur.execute("SET LOCAL lock_timeout = '10s'")
        cur.execute('SET LOCAL search_path = pg_catalog, public')
        cur.execute('SELECT pg_catalog.pg_try_advisory_xact_lock(%s,%s)', (1129270610, 1296648001))
        if not cur.fetchone()[0]:
            raise MigrationError('another migration transaction is active')
        cur.execute("SELECT pg_catalog.to_regclass('supabase_migrations.schema_migrations')")
        if cur.fetchone()[0] is None:
            raise MigrationError('Supabase migration history must be reconciled before execution')
        cur.execute('LOCK TABLE ONLY supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE')
        cur.execute("""
          SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition
             AND NOT c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid)
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class=c.oid)
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=c.oid)
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef WHERE adrelid=c.oid)
             AND (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid=c.oid)=1
             AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=c.oid)=1
             AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=c.oid AND contype='p'
                         AND convalidated AND pg_catalog.pg_get_constraintdef(oid)='PRIMARY KEY (version)')
             AND (SELECT pg_catalog.array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                              || ':' || a.attnotnull::text ORDER BY a.attnum)
                  FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
                 = ARRAY['version:text:true','statements:text[]:false','name:text:false']::text[]
          FROM pg_catalog.pg_class c WHERE c.oid='supabase_migrations.schema_migrations'::regclass
        """)
        if cur.fetchone() != (True,):
            raise MigrationError('Supabase migration history has unexpected structure')
        cur.execute('SELECT version, name, statements FROM ONLY supabase_migrations.schema_migrations ORDER BY version')
        actual = cur.fetchall()
        expected = [(item.version, item.name, list(item.statements)) for item in migrations]
        if actual != expected[:len(actual)] or not any(row[0] == REQUIRED_BASELINE for row in actual):
            raise MigrationError('migration history does not match the reviewed local baseline')
        pending = migrations[len(actual):]
        for item in pending:
            for statement in item.statements:
                # Keep PostgreSQL's lexer consistent with libpg_query even if
                # a previous statement changed a session setting indirectly.
                cur.execute('SET LOCAL standard_conforming_strings = on')
                cur.execute('SET LOCAL backslash_quote = safe_encoding')
                cur.execute(statement)
            cur.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s)',
                        (item.version, item.name, list(item.statements)))
        cur.execute('SELECT version, name, statements FROM ONLY supabase_migrations.schema_migrations ORDER BY version')
        if cur.fetchall() != expected:
            raise MigrationError('history changed while applying migrations')
    conn.commit()
    return len(pending)


def main() -> int:
    check_only = len(sys.argv) == 3 and sys.argv[1] == '--check'
    if not (len(sys.argv) == 2 or check_only):
        print('usage: run_atomic_migrations.py [--check] MIGRATIONS_DIRECTORY', file=sys.stderr)
        return 2
    try:
        migrations = load_migrations(Path(sys.argv[-1]))
    except MigrationError as exc:
        print(f'migration input rejected: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:
        print(f'migration input rejected: {type(exc).__name__}', file=sys.stderr)
        return 1
    if check_only:
        print(f'migration inputs validated; {len(migrations)} migration(s)')
        return 0
    conn = None
    try:
        conn = psycopg2.connect(connect_timeout=10, application_name='compor-atomic-migrations')
        count = apply(conn, migrations)
    except Exception as exc:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        code = getattr(exc, 'pgcode', None)
        # A lost COMMIT response is uncertain: the durable latch remains held.
        # Do not print SQL, remote data or connection credentials in logs.
        print(f'migration transaction failed or outcome unconfirmed ({type(exc).__name__}, SQLSTATE={code or "unknown"})', file=sys.stderr)
        return 1
    finally:
        if conn is not None:
            conn.close()
    print(f'migration transaction committed; {count} migration(s) applied')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Offline checks for the reviewed, one-transaction baseline generator."""
import subprocess
import sys
from pathlib import Path

from pglast import ast, parse_sql, split

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_migration_baseline import TUPLE, audit_guard, prepare, quote_text  # noqa: E402

commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
sql = prepare(commit)
assert sql.startswith(f'-- Generated from commit {commit}\n')
assert sql.count('CREATE SCHEMA supabase_migrations;') == 1
assert sql.count('CREATE SCHEMA compor_migration_control;') == 1
assert sql.count('LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;') == 1
assert "pg_catalog.current_database() <> 'postgres'" in sql
assert "pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL" in sql
assert "pg_catalog.to_regnamespace('compor_migration_control') IS NOT NULL" in sql
nodes = parse_sql('\n'.join(line for line in sql.splitlines() if not line.startswith('\\')))
transactions = [node.stmt.kind.name for node in nodes if isinstance(node.stmt, ast.TransactionStmt)]
assert transactions == ['TRANS_STMT_BEGIN', 'TRANS_STMT_COMMIT']
manifest = TUPLE.findall(audit_guard())[:17]
assert len(manifest) == 17
for version, filename, _source, digest in manifest:
    raw = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{commit}:supabase/migrations/{filename}'])
    assert quote_text(version) in sql
    assert all(quote_text(statement) in sql for statement in split(raw.decode(), with_parser=False))
    assert digest in sql
for invalid in ('HEAD', '', '0' * 39, '../invalid'):
    try:
        prepare(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError(f'accepted invalid commit {invalid!r}')
print('PASS: immutable legacy blobs, exact CLI statement tokens, transactional native history and latch, strict target guards')

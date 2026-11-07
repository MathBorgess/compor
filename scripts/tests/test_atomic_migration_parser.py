#!/usr/bin/env python3
"""Validate migration inputs without connecting to a database."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_atomic_migrations import MigrationError, load_migrations


class AtomicMigrationParserTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        (self.path / '20261105000016_baseline.sql').write_text('CREATE TABLE public.legacy (id integer);\n')

    def write(self, text):
        (self.path / '20261106000017_new.sql').write_text(text)

    def test_accepts_procedural_body_and_preserves_cli_tokens(self):
        self.write("-- a comment\nCREATE FUNCTION public.sample() RETURNS text LANGUAGE sql AS $$ SELECT 'COMMIT; ROLLBACK' $$;\nCREATE TABLE public.new_table (id integer);\n")
        migrations = load_migrations(self.path)
        self.assertEqual(len(migrations), 2)
        self.assertEqual(len(migrations[-1].statements), 2)
        self.assertTrue(migrations[-1].statements[0].startswith('-- a comment'))

    def test_rejects_top_level_transaction_control_and_psql_commands(self):
        for text in ['COMMIT;', 'ROLLBACK;', 'BEGIN; SELECT 1;', "PREPARE TRANSACTION 'x';", '\\echo unsafe\nSELECT 1;']:
            with self.subTest(text=text):
                self.write(text)
                with self.assertRaises(Exception):
                    load_migrations(self.path)

    def test_rejects_nontransactional_statements_and_directive(self):
        for text in ['CREATE INDEX CONCURRENTLY i ON public.legacy(id);', 'VACUUM public.legacy;', "COPY public.legacy TO PROGRAM 'true';", '-- pg-delta: transaction=false\nSELECT 1;']:
            with self.subTest(text=text):
                self.write(text)
                with self.assertRaises(MigrationError):
                    load_migrations(self.path)

    def test_rejects_direct_access_to_migration_control_relations(self):
        for text in ['DELETE FROM supabase_migrations.schema_migrations;', 'TRUNCATE compor_migration_control.latch;']:
            with self.subTest(text=text):
                self.write(text)
                with self.assertRaises(MigrationError):
                    load_migrations(self.path)

    def test_rejects_duplicate_versions_and_symlinks(self):
        self.write('SELECT 1;')
        (self.path / '20261106000017_other.sql').write_text('SELECT 2;')
        with self.assertRaises(MigrationError):
            load_migrations(self.path)
        (self.path / '20261106000017_other.sql').unlink()
        (self.path / '20261106000018_link.sql').symlink_to(self.path / '20261106000017_new.sql')
        with self.assertRaises(MigrationError):
            load_migrations(self.path)

    def test_requires_reviewed_baseline(self):
        (self.path / '20261105000016_baseline.sql').unlink()
        self.write('SELECT 1;')
        with self.assertRaises(MigrationError):
            load_migrations(self.path)


if __name__ == '__main__':
    unittest.main()

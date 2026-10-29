"""Synthetic package integrity tests; no real cases, model calls or image generator."""
import json
from pathlib import Path
import tempfile
import unittest

import advance
import artifacts
import blind_pack


class BlindPackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.base = self.root / 'repo/prototypes/compor-mcp/evals/model-efficiency'
        self.run = self.base / 'runs/synthetic-run'
        self.run.mkdir(parents=True)
        (self.base / 'cases').mkdir()
        (self.base / 'cases/synthetic-case.json').write_text(json.dumps({'turns': []}))
        (self.base / 'schedule.json').write_text(json.dumps([
            {'order': 1, 'run_id': 'synthetic-run', 'case_id': 'synthetic-case'}]))
        rubric = self.base.parents[3] / 'docs/evals/model-efficiency/rubric.md'
        rubric.parent.mkdir(parents=True)
        rubric.write_text('Synthetic fixture only.')
        self.out, self.mapping = self.root / 'out', self.root / 'mapping.json'

    def tearDown(self):
        self.temp.cleanup()

    def extraction(self, turn, previous=None, suffix='', color='#DDEEFF'):
        source = self.run / f't{turn}-artifacts{suffix}'
        source.mkdir()
        items, entries = [], []
        for index in range(1 if turn == 5 else 2):
            name = f'item-{index}'
            payload = {'piece': {'piece_id': f'piece-{turn}-{index}', 'version': 'v1',
                'width_px': 16, 'height_px': 16, 'layers': [
                    {'id': 'background', 'kind': 'shape', 'name': 'Synthetic shape', 'z_index': 0,
                     'rect': {'x': 0, 'y': 0, 'width': 1, 'height': 1},
                     'shape': 'rectangle', 'fill_hex': color}]}, 'assets': {}}
            item = {'id': name, 'render_input': f'render-inputs/{name}.json',
                    'render_input_sha256': artifacts.sha(artifacts.canonical(payload)),
                    'mapped_piece_sha256': artifacts.sha(artifacts.canonical(payload['piece']))}
            artifacts.save(source / item['render_input'], payload)
            png, report = advance.renderer.compose(payload)
            artifacts.save(source / 'renders' / f'{name}.png', png, raw=True)
            artifacts.save(source / 'renders' / f'{name}.json', report)
            items.append(item)
            entries.append({'id': name, 'caption': f'Synthetic T{turn}{suffix}'})
        report = {'status': 'ready_for_render', 'turn': turn, 'run_dir': str(self.run),
                  'artifacts': items, 'assets': {}}
        if previous:
            report['previous'] = {'path': str(previous / 'report.json'),
                                  'sha256': advance.file_hash(previous / 'report.json')}
        artifacts.save(source / 'report.json', report)
        key = {3: 'directions', 4: 'variations', 5: 'revision'}[turn]
        artifacts.save(source / 'envelope.original.json', {key: entries[0] if turn == 5 else entries})
        return source

    def chain(self):
        t3 = self.extraction(3)
        t4 = self.extraction(4, t3)
        t5 = self.extraction(5, t4)
        return t3, t4, t5

    def build(self):
        return blind_pack.build_package(self.base, 1, 1, self.out, self.mapping)

    def test_valid_chain_preserves_png_bytes_and_does_not_overwrite_package(self):
        t3, _, _ = self.chain()
        self.assertEqual(self.build()['packages'], 1)
        png = self.out / 'P01/D1.png'
        expected = (t3 / 'renders/item-0.png').read_bytes()
        self.assertEqual(png.read_bytes(), expected)
        with self.assertRaisesRegex(ValueError, 'new output paths'):
            self.build()
        self.assertEqual(png.read_bytes(), expected)

    def test_mixed_lineage_fails_before_creating_output(self):
        self.chain()
        self.extraction(3, suffix='-a2', color='#FF0000')
        with self.assertRaisesRegex(ValueError, 'previous path/hash differs'):
            self.build()
        self.assertFalse(self.out.exists())
        self.assertFalse(self.mapping.exists())

    def test_previous_report_hash_is_verified_even_when_path_matches(self):
        t3, _, _ = self.chain()
        path = t3 / 'report.json'
        path.write_bytes(path.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'previous path/hash differs'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_missing_parent_does_not_silently_break_chain(self):
        self.extraction(4)
        with self.assertRaisesRegex(ValueError, 'no selected preceding extraction'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_modified_png_with_unchanged_report_is_rejected(self):
        t3, _, _ = self.chain()
        path = t3 / 'renders/item-0.png'
        path.write_bytes(path.read_bytes() + b'modified')
        with self.assertRaisesRegex(ValueError, 'PNG checksum differs'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_png_without_renderer_report_is_rejected(self):
        t3 = self.extraction(3)
        (t3 / 'renders/item-0.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Partial existing render'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_changed_render_input_is_rejected(self):
        t3 = self.extraction(3)
        path = t3 / 'render-inputs/item-0.json'
        payload = json.loads(path.read_text())
        payload['piece']['version'] = 'unrecorded'
        path.write_text(json.dumps(payload))
        with self.assertRaisesRegex(ValueError, 'Render input checksum differs'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_absent_stages_remain_explicitly_missing(self):
        self.build()
        package = json.loads((self.out / 'P01/package.json').read_text())
        self.assertTrue(all(stage['missing'] for stage in package['stages']))


if __name__ == '__main__':
    unittest.main()

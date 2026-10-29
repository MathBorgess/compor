"""Synthetic plumbing smoke tests; no case judgments, model or image generator."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image
import advance
from test_artifacts import envelope, event, piece, wire


class AdvanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.run = self.root / 'run'
        self.run.mkdir()
        self.source = self.root / 'case.json'
        self.case = {'id': 'advance-synthetic', 'synthetic': True,
                     'turns': [{'id': f't{i}', 'prompt': f'Synthetic turn {i}'} for i in range(1, 6)]}
        self.source.write_text(json.dumps(self.case))
        mapping = {}
        for index, color in enumerate(('#FF0000', '#0000FF')):
            image = self.root / f'asset-{index}.png'
            Image.new('RGB', (16, 16), color).save(image)
            mapping[f'asset-{index}'] = str(image)
        self.assets = self.run / 'assets.json'
        self.assets.write_text(json.dumps(mapping))
        for turn in (1, 2):
            (self.run / f'turn-{turn:02d}.json').write_text(json.dumps({'prompt': self.case['turns'][turn - 1]['prompt']}))

    def tearDown(self):
        self.temp.cleanup()

    def pieces(self, names, ref=None):
        result = [piece(name, ref) for name in names]
        for value in result:
            value['width_px'] = value['height_px'] = 80
            value['layers'][1]['font_size_px'] = 12
        return result

    def record_turn(self, turn, pieces, source=None):
        case = json.loads((source or self.source).read_text())
        data = {'prompt': case['turns'][turn - 1]['prompt'],
                'assistant_messages': [json.dumps(envelope(turn, pieces))],
                'events': [event(value, index) for index, value in enumerate(pieces)]}
        (self.run / f'turn-{turn:02d}.json').write_text(json.dumps(data))
        with (self.run / 'mcp.jsonl').open('a') as stream:
            for index, value in enumerate(pieces):
                for row in wire(value, process=turn * 100 + index, rpc_id=turn):
                    stream.write(json.dumps(row) + '\n')

    def t3(self):
        self.record_turn(3, self.pieces(['a', 'b']))
        result = advance.advance(self.run, 3, self.source, self.assets)
        self.assertEqual(result['status'], 'ready_to_resume', result['errors'])
        return result

    def test_full_t3_t4_t5_preserves_submitted_prompts_and_attachment_order(self):
        first = self.t3()
        prepared3 = self.run / 'resume-after-t3.json'
        case3 = json.loads(prepared3.read_text())
        self.assertEqual(case3['turns'][:3], self.case['turns'][:3])
        self.assertEqual([Path(p).name for p in case3['turns'][3]['images']], ['item-0.png', 'item-1.png'])
        self.assertIn('"id":"a-image","kind":"image","asset_ref":"asset-0"', case3['turns'][3]['prompt'])
        self.assertFalse(first['model_execution_started'])
        variations = self.pieces(['v-a', 'v-b'], 'asset-0')
        self.record_turn(4, variations, prepared3)
        second = advance.advance(self.run, 4, prepared3, self.assets)
        self.assertEqual(second['status'], 'ready_to_resume', second['errors'])
        prepared4 = self.run / 'resume-after-t4.json'
        case4 = json.loads(prepared4.read_text())
        self.assertEqual(case4['turns'][:4], case3['turns'][:4])
        self.assertEqual(case4['turns'][4]['images'], [r['png'] for r in second['outputs']['renders']])
        revision = deepcopy(variations[0])
        revision['version'] = 'v2'
        self.record_turn(5, [revision], prepared4)
        third = advance.advance(self.run, 5, prepared4, self.assets)
        self.assertEqual(third['status'], 'completed', third['errors'])
        self.assertIsNone(third['outputs']['resume_case'])
        self.assertFalse((self.run / 'resume-after-t5.json').exists())

    def test_existing_render_and_extraction_are_verified_after_wire_append(self):
        first = self.t3()
        original = {Path(row['png']): Path(row['png']).read_bytes() for row in first['outputs']['renders']}
        self.record_turn(4, self.pieces(['v-a', 'v-b'], 'asset-0'), self.run / 'resume-after-t3.json')
        again = advance.advance(self.run, 3, self.source, self.assets)
        self.assertTrue(again['reused_and_verified_now'])
        for path, content in original.items():
            self.assertEqual(path.read_bytes(), content)

    def test_modified_existing_png_blocks_reuse(self):
        first = self.t3()
        path = Path(first['outputs']['renders'][0]['png'])
        path.write_bytes(path.read_bytes() + b'tampered')
        with self.assertRaisesRegex(ValueError, 'no longer validates'):
            advance.advance(self.run, 3, self.source, self.assets)

    def test_render_failure_blocks_continuation_and_is_never_overwritten(self):
        values = self.pieces(['a', 'b'])
        values[1]['layers'][1]['text'] = 'Overflow ' * 100
        self.record_turn(3, values)
        result = advance.advance(self.run, 3, self.source, self.assets)
        self.assertEqual(result['status'], 'failed')
        self.assertFalse((self.run / 'resume-after-t3.json').exists())
        saved = (self.run / 'advance-t3.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'explicit repair'):
            advance.advance(self.run, 3, self.source, self.assets)
        self.assertEqual((self.run / 'advance-t3.json').read_bytes(), saved)

    def test_changed_submitted_prompt_blocks_before_render(self):
        self.record_turn(3, self.pieces(['a', 'b']))
        changed = deepcopy(self.case)
        changed['turns'][1]['prompt'] = 'Changed sent prompt'
        self.source.write_text(json.dumps(changed))
        result = advance.advance(self.run, 3, self.source, self.assets)
        self.assertEqual(result['status'], 'failed')
        self.assertFalse((self.run / 't3-artifacts').exists())
        self.assertFalse((self.run / 'resume-after-t3.json').exists())

    def test_changed_asset_bytes_block_t4(self):
        self.t3()
        prepared = self.run / 'resume-after-t3.json'
        self.record_turn(4, self.pieces(['v-a', 'v-b'], 'asset-0'), prepared)
        asset = self.root / 'asset-0.png'
        Image.new('RGB', (16, 16), '#00FF00').save(asset)
        result = advance.advance(self.run, 4, prepared, self.assets)
        self.assertEqual(result['status'], 'failed')
        self.assertFalse((self.run / 'resume-after-t4.json').exists())

    def test_recovery_destinations_preserve_failed_attempt_and_feed_t5(self):
        self.t3()
        prepared3 = self.run / 'resume-after-t3.json'
        variations = self.pieces(['v-a', 'v-b'], 'asset-0')
        self.record_turn(4, variations, prepared3)
        failed_artifacts = self.run / 't4-artifacts'
        failed_artifacts.mkdir()
        failed_report = failed_artifacts / 'report.json'
        failed_report.write_text('{"status":"failed","errors":["synthetic previous tool failure"]}')
        old_advance = self.run / 'advance-t4.json'
        old_advance.write_text('{"status":"failed","errors":["synthetic prior attempt"]}')
        old_resume = self.run / 'resume-after-t4.json'
        old_resume.write_text('{"retained":"previous attempt evidence"}')
        preserved = {path: path.read_bytes() for path in (failed_report, old_advance, old_resume)}
        corrected = self.run / 't4-artifacts-a2'
        prepared4 = self.run / 'resume-after-t4-a2.json'
        report4 = self.run / 'advance-t4-a2.json'
        recovered = advance.advance(self.run, 4, prepared3, self.assets,
                                    artifact_dir=corrected, report_path=report4, resume_path=prepared4)
        self.assertEqual(recovered['status'], 'ready_to_resume', recovered['errors'])
        self.assertEqual(recovered['outputs']['artifact_directory'], str(corrected))
        self.assertEqual(recovered['outputs']['resume_case']['path'], str(prepared4))
        self.assertTrue(report4.is_file())
        revision = deepcopy(variations[0])
        revision['version'] = 'v2'
        self.record_turn(5, [revision], prepared4)
        completed = advance.advance(self.run, 5, prepared4, self.assets, previous_artifacts=corrected)
        self.assertEqual(completed['status'], 'completed', completed['errors'])
        self.assertEqual(completed['inputs']['previous_artifacts']['path'], str(corrected))
        previous = json.loads((self.run / 't5-artifacts' / 'report.json').read_text())['previous']
        self.assertEqual(previous['path'], str(corrected / 'report.json'))
        for path, original in preserved.items():
            self.assertEqual(path.read_bytes(), original)


if __name__ == '__main__':
    unittest.main(verbosity=2)

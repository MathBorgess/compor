"""Real frozen-renderer fixtures; no model, network or generative image calls."""
from copy import deepcopy
from concurrent.futures import ProcessPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

import preview_worker as worker


def concurrent_preview(arguments):
    request, context = arguments
    return worker.preview(request, context)


class PreviewWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.context = {'assets': {}, 'output_root': str(self.root / 'outputs'),
                        'renderer_sha256': worker.digest(worker.RENDERER.read_bytes())}
        self.piece = {'piece_id': 'draft', 'version': 'v1', 'width_px': 1080,
                      'height_px': 1080, 'layers': [
            {'id': 'background', 'kind': 'shape', 'name': 'Background', 'z_index': 0,
             'rect': {'x': 0, 'y': 0, 'width': 1, 'height': 1},
             'shape': 'rectangle', 'fill_hex': '#F4EBDD'},
            {'id': 'headline', 'kind': 'text', 'name': 'Headline', 'z_index': 1,
             'rect': {'x': 0.1, 'y': 0.1, 'width': 0.8, 'height': 0.3},
             'text': 'A clear headline', 'font_ref': 'arial', 'font_size_px': 48,
             'font_weight': 400},
        ]}

    def tearDown(self):
        self.temp.cleanup()

    def call(self, piece=None, slot='D1', context=None):
        return worker.preview({'slot': slot, 'piece': self.piece if piece is None else piece},
                              context or self.context)

    def test_real_png_and_immutable_evidence_no_host_paths_in_diagnostic(self):
        result = self.call()
        self.assertEqual(result['status'], 'rendered')
        self.assertEqual(result['attempt'], 1)
        output = Path(result['preview_path'])
        with Image.open(output) as image:
            self.assertEqual(image.size, (1080, 1080))
        report = json.loads((output.parent / 'report.json').read_text())
        self.assertEqual(report['result'], result)
        self.assertTrue((output.parent / 'input.json').is_file())
        self.assertNotIn(str(self.root), json.dumps(result['diagnostic']))
        original = output.read_bytes()
        self.call()
        self.assertEqual(output.read_bytes(), original)

    def test_overflow_consumes_attempt_and_never_produces_png(self):
        piece = deepcopy(self.piece)
        piece['layers'][1]['rect']['width'] = 0.01
        result = self.call(piece)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['diagnostic']['code'], 'text_overflow')
        self.assertNotIn('preview_path', result)
        self.assertFalse((self.root / 'outputs/D1-attempt1/preview.png').exists())
        self.assertEqual(self.call()['attempt'], 2)
        result = self.call()
        self.assertEqual(result['status'], 'budget_exhausted')
        self.assertIsNone(result['attempt'])

    def test_budget_survives_new_process(self):
        context_path = self.root / 'context.json'
        context_path.write_text(json.dumps(self.context))
        request = json.dumps({'slot': 'D1', 'piece': self.piece})
        def launch():
            result = subprocess.run([sys.executable, str(Path(worker.__file__)), '--context',
                                     str(context_path)], input=request, text=True,
                                    capture_output=True, timeout=30, check=True)
            return json.loads(result.stdout)
        self.assertEqual(launch()['attempt'], 1)
        self.assertEqual(launch()['attempt'], 2)
        self.assertEqual(launch()['status'], 'budget_exhausted')

    def test_concurrent_processes_reserve_at_most_two_attempts(self):
        with ProcessPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(concurrent_preview,
                [({'slot': 'D1', 'piece': self.piece}, self.context)] * 4))
        self.assertEqual(sorted(r['attempt'] for r in results if r['attempt'] is not None), [1, 2])
        self.assertEqual(sum(r['status'] == 'rendered' for r in results), 2)
        self.assertEqual(sum(r['status'] == 'budget_exhausted' for r in results), 2)

    def test_host_asset_allowlist_and_hash_are_required(self):
        asset = self.root / 'asset.png'
        Image.new('RGB', (20, 20), '#C76B4B').save(asset)
        context = deepcopy(self.context)
        context['assets']['known_asset'] = {'path': str(asset),
                                           'sha256': worker.digest(asset.read_bytes())}
        piece = deepcopy(self.piece)
        piece['layers'].append({'id': 'image', 'kind': 'image', 'name': 'Image', 'z_index': 2,
                                'asset_ref': 'known_asset',
                                'rect': {'x': 0.1, 'y': 0.5, 'width': 0.3, 'height': 0.3}})
        self.assertEqual(self.call(piece, context=context)['status'], 'rendered')
        Image.new('RGB', (20, 20), '#532B54').save(asset)
        result = self.call(piece, context=context)
        self.assertEqual(result['diagnostic']['code'], 'asset_hash_mismatch')
        self.assertNotIn(str(asset), json.dumps(result))
        self.assertFalse((self.root / 'outputs/D1-attempt2/preview.png').exists())

    def test_model_cannot_supply_paths_or_unknown_assets(self):
        piece = deepcopy(self.piece)
        piece['layers'][1]['font_path'] = '/private/not-permitted.ttf'
        result = self.call(piece)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['diagnostic']['code'], 'unknown_field')
        self.assertNotIn('/private/', json.dumps(result))
        piece = deepcopy(self.piece)
        piece['layers'].append({'id': 'image', 'kind': 'image', 'name': 'Image', 'z_index': 2,
                                'asset_ref': 'unknown_asset',
                                'rect': {'x': 0.1, 'y': 0.5, 'width': 0.3, 'height': 0.3}})
        self.assertEqual(self.call(piece)['diagnostic']['code'], 'unapproved_asset')

    def test_revision_rejects_geometry_words_other_layers_and_missing_base(self):
        self.assertEqual(self.call(slot='R1')['diagnostic']['code'], 'revision_base_required')
        context = deepcopy(self.context)
        context['revision_base'] = deepcopy(self.piece)
        context['revision_layer_id'] = 'headline'
        for change in ('geometry', 'words', 'other_layer'):
            context['output_root'] = str(self.root / ('revision-' + change))
            piece = deepcopy(self.piece)
            piece['version'] = 'v2'
            if change == 'geometry':
                piece['layers'][1]['rect']['height'] = 0.4
            elif change == 'words':
                piece['layers'][1]['text'] = 'Changed headline'
            else:
                piece['layers'][0]['fill_hex'] = '#000000'
            result = self.call(piece, slot='R1', context=context)
            self.assertEqual(result['status'], 'failed')
            self.assertNotIn('preview_path', result)

    def test_revision_allows_single_text_size_and_linebreak_only(self):
        context = deepcopy(self.context)
        context['revision_base'] = deepcopy(self.piece)
        context['revision_layer_id'] = 'headline'
        piece = deepcopy(self.piece)
        piece['version'] = 'v2'
        piece['layers'][1]['font_size_px'] = 42
        piece['layers'][1]['text'] = 'A clear\nheadline'
        result = self.call(piece, slot='R1', context=context)
        self.assertEqual(result['status'], 'rendered')
        self.assertEqual(result['version'], 'v2')


    def test_revision_requires_host_target_and_rejects_other_text_layer(self):
        context = deepcopy(self.context)
        base = deepcopy(self.piece)
        base['layers'].append({**deepcopy(base['layers'][1]), 'id': 'cta', 'z_index': 2,
                               'text': 'Call to action',
                               'rect': {'x': 0.1, 'y': 0.7, 'width': 0.8, 'height': 0.2}})
        context['revision_base'] = base
        revised = deepcopy(base)
        revised['version'] = 'v2'
        revised['layers'][2]['font_size_px'] = 42
        result = self.call(revised, slot='R1', context=context)
        self.assertEqual(result['diagnostic']['code'], 'revision_layer_required')
        context['revision_layer_id'] = 'headline'
        result = self.call(revised, slot='R1', context=context)
        self.assertEqual(result['diagnostic']['code'], 'revision_scope_violation')
        self.assertFalse((self.root / 'outputs/R1-attempt2/preview.png').exists())

    def test_renderer_hash_and_invalid_slot_are_refused_without_attempt(self):
        context = deepcopy(self.context)
        context['renderer_sha256'] = '0' * 64
        result = self.call(context=context)
        self.assertEqual(result['diagnostic']['code'], 'renderer_hash_mismatch')
        self.assertIsNone(result['attempt'])
        result = self.call(slot='../../escape')
        self.assertEqual(result['diagnostic']['code'], 'invalid_slot')
        self.assertFalse((self.root / 'outputs').exists())


if __name__ == '__main__':
    unittest.main()

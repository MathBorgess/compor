"""Synthetic contract tests only; no task cases, model output or creative judging."""
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image
from renderer import HERE, POLICY, RenderError, canonical, compose, digest


def fixture():
    return {'piece': {'piece_id': 'synthetic_1', 'version': 'v1', 'width_px': 300, 'height_px': 200, 'layers': [
        {'id': 'background', 'kind': 'shape', 'name': 'Synthetic background', 'z_index': 0,
         'rect': {'x': 0, 'y': 0, 'width': 1, 'height': 1}, 'shape': 'rectangle', 'fill_hex': '#DDEEFF'},
        {'id': 'title', 'kind': 'text', 'name': 'Synthetic title', 'z_index': 1,
         'rect': {'x': 0.1, 'y': 0.1, 'width': 0.8, 'height': 0.5}, 'text': 'Texto\nLiteral', 'font_size_px': 24},
    ]}, 'assets': {}}


class RendererContract(unittest.TestCase):
    def assert_code(self, payload, code):
        with self.assertRaises(RenderError) as caught:
            compose(payload)
        self.assertEqual(caught.exception.code, code)

    def test_text_shape_preserve_input_and_log_all_defaults(self):
        payload = fixture()
        original = copy.deepcopy(payload)
        png, report = compose(payload)
        self.assertEqual(payload, original)
        self.assertEqual(report['size_px'], [300, 200])
        self.assertTrue(report['source_plan_unchanged'])
        text = report['layers'][1]
        self.assertEqual(text['text_preserved'], 'Texto\nLiteral')
        self.assertEqual(text['effective_font_size_px'], 24)
        self.assertEqual(text['defaults_applied']['font_ref'], 'arial')
        self.assertNotIn('font_size_px', text['defaults_applied'])
        self.assertFalse(text['text_clipped'])
        self.assertFalse(text['font_fallback'])
        image = Image.open(io.BytesIO(png))
        self.assertEqual(image.getpixel((0, 0)), (221, 238, 255))
        self.assertNotEqual(image.crop((30, 20, 270, 120)).getextrema(), ((221, 221), (238, 238), (255, 255)))

    def test_width_and_height_overflow_fail_without_shrinking(self):
        payload = fixture()
        payload['piece']['layers'][1]['text'] = 'THIS LINE CANNOT FIT AT THIS SIZE ' * 10
        self.assert_code(payload, 'text_overflow')
        payload = fixture()
        payload['piece']['layers'][1]['rect']['height'] = 0.01
        self.assert_code(payload, 'text_overflow')

    def test_unresolved_fonts_and_exact_weights_do_not_fallback(self):
        for settings, code in [({'font_ref': 'unlisted'}, 'unresolved_font'),
                               ({'font_weight': 500}, 'unresolved_font_weight')]:
            payload = fixture()
            payload['piece']['layers'][1].update(settings)
            self.assert_code(payload, code)

    def test_fractional_size_is_preserved_and_font_weight_is_exact(self):
        payload = fixture()
        payload['piece']['layers'][1].update({'font_ref': 'georgia', 'font_weight': 700, 'font_size_px': 24.5, 'text_align': 'center'})
        _, report = compose(payload)
        self.assertEqual(report['layers'][1]['effective_font_size_px'], 24.5)
        self.assertEqual(report['layers'][1]['settings']['font_weight'], 700)
        self.assertEqual(report['layers'][1]['font_family'], 'Georgia')
        self.assertFalse(report['layers'][1]['font_fallback'])

    def test_unresolved_asset_and_duplicate_ids_are_failures(self):
        payload = fixture()
        payload['piece']['layers'][1] = {'id': 'image', 'kind': 'image', 'name': 'Synthetic missing image', 'z_index': 1,
                                        'rect': {'x': 0, 'y': 0, 'width': 1, 'height': 1}, 'asset_ref': 'not_supplied'}
        self.assert_code(payload, 'unresolved_asset')
        payload = fixture()
        payload['piece']['layers'][1]['id'] = 'background'
        self.assert_code(payload, 'duplicate_layer_id')
        payload = fixture()
        payload['piece']['layers'][1]['z_index'] = 0
        self.assert_code(payload, 'duplicate_z_index')

    def test_asset_reuse_is_byte_identical_and_contain_does_not_crop(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'source.png'
            # A deterministic test fixture, not a generated campaign asset.
            Image.new('RGB', (100, 50), '#FF0000').save(path)
            asset_before = path.read_bytes()
            payload = fixture()
            payload['piece']['width_px'], payload['piece']['height_px'] = 200, 100
            payload['piece']['layers'] = [
                {'id': f'image_{i}', 'kind': 'image', 'name': 'Same synthetic source', 'z_index': i,
                 'rect': {'x': i * 0.5, 'y': 0, 'width': 0.5, 'height': 1}, 'asset_ref': 'shared'} for i in range(2)]
            payload['assets'] = {'shared': str(path)}
            png, report = compose(payload)
            self.assertEqual(path.read_bytes(), asset_before)
            self.assertEqual(report['unique_assets_read'], 1)
            self.assertFalse(report['layers'][0]['reused_asset_ref'])
            self.assertTrue(report['layers'][1]['reused_asset_ref'])
            self.assertEqual(report['layers'][0]['asset_sha256'], report['layers'][1]['asset_sha256'])
            self.assertEqual(report['layers'][0]['letterbox_px'], [0, 25, 0, 25])
            image = Image.open(io.BytesIO(png))
            self.assertEqual(image.crop((0, 0, 100, 100)).tobytes(), image.crop((100, 0, 200, 100)).tobytes())
            self.assertEqual(image.getpixel((50, 0)), (255, 255, 255))
            self.assertEqual(image.getpixel((50, 25)), (255, 0, 0))
            self.assertFalse(report['layers'][0]['crop'])

    def test_png_and_report_hashes_are_reproducible_and_linked(self):
        payload = fixture()
        png, report = compose(payload)
        png2, report2 = compose(payload)
        self.assertEqual(png, png2)
        self.assertEqual(report, report2)
        self.assertEqual(report['png_sha256'], digest(png))
        checksum = report['report_payload_sha256']
        self.assertEqual(checksum, digest(canonical({k: v for k, v in report.items() if k != 'report_payload_sha256'})))
        core = {k: v for k, v in report.items() if k not in ['render_core_sha256', 'png_sha256', 'png_bytes', 'report_payload_sha256']}
        self.assertEqual(digest(canonical(core)), report['render_core_sha256'])
        image = Image.open(io.BytesIO(png))
        self.assertEqual(image.info['compor_render_core_sha256'], report['render_core_sha256'])
        self.assertEqual(image.info['compor_input_sha256'], digest(canonical(payload)))

    def test_ellipse_and_default_shape_fill_are_explicit(self):
        payload = fixture()
        shape = payload['piece']['layers'][0]
        shape['shape'] = 'ellipse'
        del shape['fill_hex']
        _, report = compose(payload)
        self.assertEqual(report['layers'][0]['defaults_applied'], {'fill_hex': '#D9D9D9'})
        self.assertEqual(report['policy'], POLICY)

    def test_cli_writes_failure_report_but_no_png_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            payload = fixture()
            payload['piece']['layers'][1]['text'] = 'Overflow ' * 100
            source, output, report = folder / 'input.json', folder / 'out.png', folder / 'report.json'
            source.write_text(json.dumps(payload))
            args = [sys.executable, str(HERE / 'renderer.py'), '--input', str(source), '--output', str(output), '--report', str(report)]
            result = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertFalse(output.exists())
            self.assertEqual(json.loads(report.read_text())['error']['code'], 'text_overflow')
            previous = report.read_bytes()
            retry = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(retry.returncode, 2)
            self.assertEqual(report.read_bytes(), previous)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)

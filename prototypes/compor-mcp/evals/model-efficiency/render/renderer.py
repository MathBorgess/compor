#!/usr/bin/env python3
"""Deterministic local compositor for C2 snapshots; no model, network or repair."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import platform
import re
from copy import deepcopy
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont, ImageOps, PngImagePlugin

HERE = Path(__file__).resolve().parent
POLICY = {
    'version': 'c2-common-render-v1',
    'canvas_background': '#FFFFFF',
    'image_fit': 'contain',
    'image_position': 'center_integer_floor',
    'image_box_background': '#FFFFFF',
    'image_crop': False,
    'image_exif_orientation': 'transpose_before_fit',
    'image_color_management': 'Pillow_convert_RGBA_no_ICC_transform',
    'image_resampling': 'LANCZOS',
    'pixel_rectangle': 'round_half_even_normalized_edges',
    'text_wrap': 'explicit_newlines_only',
    'text_alignment_basis': 'glyph_metric_box',
    'text_vertical_position': 'top_of_each_line_metric_box',
    'text_resize': False,
    'text_overflow': 'fail_no_png',
    'font_fallback': False,
    'defaults': {'font_ref': 'arial', 'font_weight': 400, 'font_size_px': 48,
                 'color_hex': '#111111', 'line_height': 1.2, 'text_align': 'left',
                 'fill_hex': '#D9D9D9'},
}
ID = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')


class RenderError(ValueError):
    def __init__(self, code: str, detail: str, layer_id: str | None = None):
        super().__init__(detail)
        self.code, self.detail, self.layer_id = code, detail, layer_id

    def as_dict(self):
        return {'code': self.code, 'detail': self.detail, 'layer_id': self.layer_id}


def canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition, code, detail, layer_id=None):
    if not condition:
        raise RenderError(code, detail, layer_id)


def number(value, minimum, maximum, *, integer=False):
    return (type(value) in (int, float) and math.isfinite(value)
            and minimum <= value <= maximum and (not integer or type(value) is int))


def opaque(value):
    return isinstance(value, str) and ID.fullmatch(value) is not None


def keys(value, required, optional, where):
    require(isinstance(value, dict), 'invalid_input', f'{where} must be an object')
    require(set(required) <= value.keys(), 'missing_field', f'{where} requires {sorted(set(required) - value.keys())}')
    require(value.keys() <= set(required) | set(optional), 'unknown_field', f'{where} contains unsupported fields')


def rectangle(layer, size):
    r = layer['rect']
    keys(r, ['x', 'y', 'width', 'height'], [], f'{layer["id"]}.rect')
    require(all(number(r[key], 0, 1) for key in r) and r['width'] > 0 and r['height'] > 0
            and r['x'] + r['width'] <= 1 and r['y'] + r['height'] <= 1,
            'invalid_rectangle', 'Normalized rectangle must fit the canvas', layer['id'])
    x, y = round(r['x'] * size[0]), round(r['y'] * size[1])
    right, bottom = round((r['x'] + r['width']) * size[0]), round((r['y'] + r['height']) * size[1])
    require(right > x and bottom > y, 'subpixel_rectangle', 'Rectangle rounds to zero pixels', layer['id'])
    return x, y, right - x, bottom - y


def validate(payload):
    keys(payload, ['piece', 'assets'], [], 'input')
    piece, assets = payload['piece'], payload['assets']
    keys(piece, ['piece_id', 'version', 'width_px', 'height_px', 'layers'],
         ['product_ref', 'campaign_ref', 'variation_ref'], 'piece')
    require(opaque(piece['piece_id']) and opaque(piece['version']), 'invalid_id', 'Piece ID/version must be opaque identifiers')
    for key in ['product_ref', 'campaign_ref', 'variation_ref']:
        require(piece.get(key) is None or opaque(piece[key]), 'invalid_id', f'Invalid {key}')
    size = piece['width_px'], piece['height_px']
    require(all(number(v, 1, 16384, integer=True) for v in size), 'invalid_canvas', 'Canvas dimensions must be C2 positive integers')
    # Bound local memory independently of the transport envelope; record the limit.
    require(size[0] * size[1] <= 16_777_216, 'canvas_budget', 'Renderer limit is 16,777,216 pixels')
    layers = piece['layers']
    require(isinstance(layers, list) and 1 <= len(layers) <= 64, 'invalid_layers', 'Expected 1–64 layers')
    require(isinstance(assets, dict) and all(opaque(k) and isinstance(v, str) and v for k, v in assets.items()),
            'invalid_assets', 'assets must map opaque IDs to explicit file paths')
    ids, indexes = set(), set()
    for layer in layers:
        require(isinstance(layer, dict), 'invalid_layer', 'Layer must be an object')
        kind = layer.get('kind')
        extra = {'text': (['text'], ['font_ref', 'font_weight', 'font_size_px', 'color_hex', 'line_height', 'text_align']),
                 'shape': (['shape'], ['fill_hex']), 'image': ([], ['asset_ref'])}
        require(isinstance(kind, str) and kind in extra, 'unsupported_kind', f'Unsupported layer kind: {kind}')
        required, optional = extra[kind]
        keys(layer, ['id', 'kind', 'name', 'z_index', 'rect'] + required, optional, 'layer')
        layer_id = layer['id']
        require(opaque(layer_id), 'invalid_id', 'Invalid layer ID')
        require(layer_id not in ids, 'duplicate_layer_id', 'Layer IDs must be unique', layer_id)
        require(number(layer['z_index'], 0, 1000, integer=True), 'invalid_z_index', 'z_index must be an integer from 0–1000', layer_id)
        require(layer['z_index'] not in indexes, 'duplicate_z_index', 'z_index must be unique', layer_id)
        require(isinstance(layer['name'], str) and len(layer['name']) <= 100, 'invalid_name', 'Invalid layer name', layer_id)
        ids.add(layer_id)
        indexes.add(layer['z_index'])
        rectangle(layer, size)
        if kind == 'text':
            require(isinstance(layer['text'], str) and len(layer['text']) <= 2000, 'invalid_text', 'Text must contain at most 2,000 characters', layer_id)
            settings = {key: layer.get(key, value) for key, value in POLICY['defaults'].items() if key != 'fill_hex'}
            require(opaque(settings['font_ref']), 'invalid_font_ref', 'Font reference must be an opaque ID', layer_id)
            require(number(settings['font_size_px'], 0, 2000) and settings['font_size_px'] > 0, 'invalid_font_size', 'Font size must be positive and at most 2,000', layer_id)
            require(number(settings['font_weight'], 100, 900, integer=True), 'invalid_font_weight', 'Invalid font weight', layer_id)
            require(number(settings['line_height'], 0.8, 3), 'invalid_line_height', 'line_height must be from 0.8–3', layer_id)
            require(settings['text_align'] in ['left', 'center', 'right'], 'invalid_text_align', 'Unsupported alignment', layer_id)
            require(isinstance(settings['color_hex'], str) and COLOR.fullmatch(settings['color_hex']), 'invalid_color', 'Text color must use #RRGGBB', layer_id)
        elif kind == 'shape':
            require(layer['shape'] in ['rectangle', 'ellipse'], 'unsupported_shape', 'Unsupported shape', layer_id)
            fill = layer.get('fill_hex', POLICY['defaults']['fill_hex'])
            require(isinstance(fill, str) and COLOR.fullmatch(fill), 'invalid_color', 'Shape fill must use #RRGGBB', layer_id)
        else:
            require(opaque(layer.get('asset_ref')), 'unresolved_asset', 'An image layer requires a supplied asset_ref', layer_id)
    return piece, assets, size


def text_overlay(layer, size, catalog):
    x, y, w, h = rectangle(layer, size)
    settings = {key: layer.get(key, value) for key, value in POLICY['defaults'].items() if key != 'fill_hex'}
    layer_id = layer['id']
    entry = catalog['fonts'].get(settings['font_ref'])
    require(entry is not None, 'unresolved_font', f'Unknown font_ref: {settings["font_ref"]}', layer_id)
    path_string = entry['weights'].get(str(settings['font_weight']))
    require(path_string is not None, 'unresolved_font_weight', f'No exact font weight {settings["font_weight"]}; no fallback', layer_id)
    path = Path(path_string)
    require(path.is_file(), 'font_file_missing', f'Explicit catalog font is missing: {path}', layer_id)
    font_bytes = path.read_bytes()
    # Font bytes used for drawing and hashing are the same, even if a file changes later.
    font = ImageFont.truetype(io.BytesIO(font_bytes), size=settings['font_size_px'])
    overlay = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    advance = settings['font_size_px'] * settings['line_height']
    logs = []
    lines = layer['text'].split('\n')
    for index, line in enumerate(lines):
        bounds = font.getbbox(line, anchor='lt')
        ink_width, ink_height = bounds[2] - bounds[0], bounds[3] - bounds[1]
        line_top = y + round(index * advance)
        left = x if settings['text_align'] == 'left' else x + round((w - ink_width) / (2 if settings['text_align'] == 'center' else 1))
        require(ink_width <= w and line_top + ink_height <= y + h and line_top < y + h,
                'text_overflow', 'Text does not fit at the requested size; no resizing or wrapping applied', layer_id)
        origin = left - bounds[0], line_top - bounds[1]
        draw.text(origin, line, font=font, fill=settings['color_hex'], anchor='lt')
        logs.append({'text': line, 'origin_px': list(origin), 'metric_bounds_xyxy_px': [left, line_top, left + ink_width, line_top + ink_height]})
    alpha = overlay.getchannel('A')
    outside = alpha.copy()
    ImageDraw.Draw(outside).rectangle((x, y, x + w - 1, y + h - 1), fill=0)
    require(outside.getbbox() is None, 'text_pixel_overflow', 'Text ink escapes its box; no clipping allowed', layer_id)
    return overlay, {
        'settings': settings, 'defaults_applied': {key: value for key, value in settings.items() if key not in layer},
        'font_family': entry['family'], 'font_path': str(path), 'font_sha256': digest(font_bytes),
        'requested_font_size_px': layer.get('font_size_px'), 'effective_font_size_px': settings['font_size_px'],
        'font_fallback': False, 'text_preserved': layer['text'], 'text_clipped': False,
        'line_advance_px': advance, 'lines': logs, 'pixel_bbox_xyxy_px': alpha.getbbox(),
    }


def compose(payload, catalog=None):
    catalog = deepcopy(catalog) if catalog is not None else json.loads((HERE / 'fonts.json').read_text())
    piece, assets, size = validate(payload)
    input_digest = digest(canonical(payload))
    canvas = Image.new('RGBA', size, POLICY['canvas_background'])
    logs, loaded_assets = [], {}
    for layer in sorted(piece['layers'], key=lambda item: item['z_index']):
        x, y, w, h = rectangle(layer, size)
        log = {'id': layer['id'], 'kind': layer['kind'], 'z_index': layer['z_index'], 'rect_px': [x, y, w, h]}
        if layer['kind'] == 'shape':
            fill = layer.get('fill_hex', POLICY['defaults']['fill_hex'])
            method = ImageDraw.Draw(canvas).rectangle if layer['shape'] == 'rectangle' else ImageDraw.Draw(canvas).ellipse
            method((x, y, x + w - 1, y + h - 1), fill=fill)
            log.update({'shape': layer['shape'], 'fill_hex': fill, 'defaults_applied': {} if 'fill_hex' in layer else {'fill_hex': fill}})
        elif layer['kind'] == 'text':
            overlay, details = text_overlay(layer, size, catalog)
            canvas = Image.alpha_composite(canvas, overlay)
            log.update(details)
        else:
            asset_ref = layer['asset_ref']
            require(asset_ref in assets, 'unresolved_asset', f'asset_ref not in supplied map: {asset_ref}', layer['id'])
            reused = asset_ref in loaded_assets
            if not reused:
                path = Path(assets[asset_ref])
                require(path.is_absolute() and path.is_file(), 'asset_file_missing', 'Asset path must be an existing absolute file path', layer['id'])
                asset_bytes = path.read_bytes()
                try:
                    with Image.open(io.BytesIO(asset_bytes)) as raw:
                        require(getattr(raw, 'n_frames', 1) == 1, 'animated_asset', 'Only single-frame assets are supported', layer['id'])
                        require(raw.width * raw.height <= 16_777_216, 'asset_pixel_budget', 'Renderer source-image limit is 16,777,216 pixels', layer['id'])
                        source = ImageOps.exif_transpose(raw).convert('RGBA')
                        details = {'asset_ref': asset_ref, 'asset_path': str(path), 'asset_sha256': digest(asset_bytes),
                                   'source_raw_size_px': list(raw.size), 'source_oriented_size_px': list(source.size), 'source_mode': raw.mode}
                except (OSError, ValueError) as error:
                    if isinstance(error, RenderError):
                        raise
                    raise RenderError('invalid_asset_file', 'Asset could not be decoded as an image', layer['id']) from error
                loaded_assets[asset_ref] = source, details
            source, details = loaded_assets[asset_ref]
            fitted = ImageOps.contain(source, (w, h), method=Image.Resampling.LANCZOS)
            dx, dy = (w - fitted.width) // 2, (h - fitted.height) // 2
            ImageDraw.Draw(canvas).rectangle((x, y, x + w - 1, y + h - 1), fill=POLICY['image_box_background'])
            canvas.alpha_composite(fitted, (x + dx, y + dy))
            log.update(details)
            log.update({'reused_asset_ref': reused, 'placed_rect_px': [x + dx, y + dy, fitted.width, fitted.height],
                        'letterbox_px': [dx, dy, w - fitted.width - dx, h - fitted.height - dy],
                        'crop': False, 'fit': 'contain', 'box_background': POLICY['image_box_background']})
        logs.append(log)
    require(digest(canonical(payload)) == input_digest, 'input_mutation', 'Renderer modified its input')
    report = {'status': 'rendered', 'policy': deepcopy(POLICY), 'canvas_budget_pixels': 16_777_216, 'asset_budget_pixels': 16_777_216,
              'runtime': {'python': platform.python_version(), 'pillow': PIL.__version__, 'platform': platform.platform()},
              'input_sha256': input_digest, 'piece_sha256': digest(canonical(piece)),
              'renderer_sha256': digest(Path(__file__).read_bytes()), 'font_catalog_sha256': digest(canonical(catalog)),
              'piece_id': piece['piece_id'], 'piece_version': piece['version'], 'size_px': list(size),
              'source_plan_unchanged': True, 'layers': logs, 'unique_assets_read': len(loaded_assets)}
    core_digest = digest(canonical(report))
    metadata = PngImagePlugin.PngInfo()
    for key, value in {'compor_render_policy': POLICY['version'], 'compor_input_sha256': input_digest,
                       'compor_render_core_sha256': core_digest, 'compor_renderer_sha256': report['renderer_sha256'],
                       'compor_font_catalog_sha256': report['font_catalog_sha256']}.items():
        metadata.add_text(key, value)
    output = io.BytesIO()
    canvas.convert('RGB').save(output, format='PNG', pnginfo=metadata, optimize=False, compress_level=9)
    png_bytes = output.getvalue()
    report.update({'render_core_sha256': core_digest, 'png_sha256': digest(png_bytes), 'png_bytes': len(png_bytes)})
    report['report_payload_sha256'] = digest(canonical(report))
    return png_bytes, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='JSON {piece, assets}; explicit absolute asset paths')
    parser.add_argument('--output', required=True, type=Path, help='New PNG path; existing files are refused')
    parser.add_argument('--report', required=True, type=Path, help='New JSON report path; also written for render failures')
    args = parser.parse_args()
    if args.output.exists() or args.report.exists() or args.output.resolve() == args.report.resolve():
        parser.error('Output and report must be distinct, unused paths')
    input_bytes = None
    try:
        input_bytes = args.input.read_bytes()
        payload = json.loads(input_bytes)
        png_bytes, report = compose(payload)
    except (RenderError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        report = {'status': 'failed', 'error': error.as_dict() if isinstance(error, RenderError) else {'code': 'input_or_io_error', 'detail': str(error)},
                  'policy': POLICY, 'renderer_sha256': digest(Path(__file__).read_bytes()),
                  'input_file_sha256': digest(input_bytes) if input_bytes is not None else None, 'png_written': False}
        with args.report.open('x', encoding='utf-8') as handle:
            handle.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'status': 'failed', 'report': str(args.report), 'report_sha256': digest(args.report.read_bytes()), 'error': report['error']}, ensure_ascii=False))
        return 2
    with args.output.open('xb') as handle:
        handle.write(png_bytes)
    with args.report.open('x', encoding='utf-8') as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'rendered', 'png': str(args.output), 'png_sha256': report['png_sha256'],
                      'report': str(args.report), 'report_sha256': digest(args.report.read_bytes())}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

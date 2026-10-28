#!/usr/bin/env python3
"""Render the H2 image-only experiment without rewriting any H0/H1 evidence."""
from __future__ import annotations

import copy
import importlib.util
import json
import shutil
from pathlib import Path

import PIL
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SESSIONS = ROOT / 'sessions'
spec = importlib.util.spec_from_file_location('candidate_renderer', ROOT / 'render-candidates.py')
renderer = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(renderer)


def signature(layer: dict, font_refs: dict[str, str]) -> dict:
    """Compare rendering inputs; names and other non-rendered metadata may differ."""
    keys = ['id', 'kind', 'z_index', 'rect']
    if layer['kind'] == 'shape':
        keys += ['shape', 'fill_hex']
    elif layer['kind'] == 'text':
        keys += ['text', 'font_size_px', 'font_weight', 'line_height', 'text_align', 'color_hex']
    elif layer['kind'] != 'image':
        raise ValueError(f'Unsupported layer kind: {layer["kind"]}')
    result = {k: layer[k] for k in keys}
    if layer['kind'] == 'text':
        family = layer.get('font_family')
        if family is None:
            family = font_refs[layer['font_ref']]
        result['font_family'] = family
    elif layer['kind'] == 'image':
        result['image_fit'] = layer.get('image_fit', 'contain')
    return result


def main() -> None:
    baseline_file = SESSIONS / 'H0-output.json'
    candidate_file = SESSIONS / 'H2-output.json'
    baseline_report_file = SESSIONS / 'composites/render-report.json'
    baseline = next(d for d in json.loads(baseline_file.read_text())['directions'] if d['id'] == 'H0_D2')
    candidate = json.loads(candidate_file.read_text())
    baseline_report = json.loads(baseline_report_file.read_text())
    prior = next(r for r in baseline_report['compositions'] if r['id'] == 'H0_D2')
    if candidate['source_candidate'] != 'H0_D2':
        raise ValueError('H2 must explicitly identify H0_D2 as its source')
    # The instruction in H2 explicitly reuses baseline layout and font adaptation.
    # Its tool schema stores a font_ref; the source preserves the original family.
    refs = {'inter': 'Inter'}
    base_plan, new_plan = baseline['layer_plan'], candidate['layer_plan']
    for key in ('width_px', 'height_px'):
        if base_plan[key] != new_plan[key]:
            raise ValueError(f'H2 changes canvas {key}')
    old_layers = sorted(base_plan['layers'], key=lambda l: l['z_index'])
    new_layers = sorted(new_plan['layers'], key=lambda l: l['z_index'])
    if [signature(l, refs) for l in old_layers] != [signature(l, refs) for l in new_layers]:
        raise ValueError('H2 changes a rendering input beyond the image asset')
    if baseline_report['script_sha256'] != renderer.sha(ROOT / 'render-candidates.py'):
        raise ValueError('The baseline renderer changed; do not silently reinterpret prior evidence')
    if baseline_report['pillow_version'] != PIL.__version__:
        raise ValueError('Pillow differs from the baseline runtime')
    if renderer.sha(baseline_file) != baseline_report['input_hashes']['sessions/H0-output.json']:
        raise ValueError('The original baseline candidate changed')
    baseline_png = SESSIONS / 'composites/H0_D2.png'
    if renderer.sha(baseline_png) != prior['output_sha256']:
        raise ValueError('The original baseline composite changed')
    for layer in prior['layers']:
        if layer['kind'] == 'text' and renderer.sha(Path(layer['font_path'])) != layer['font_file_sha256']:
            raise ValueError('The font file used for the baseline changed')

    protected = [SESSIONS / f'{run}-output.json' for run in ('H0', 'H1')]
    protected += list((SESSIONS / 'composites').glob('H[01]_D*.png'))
    protected += list((SESSIONS / 'assets').glob('H[01]_D*.png'))
    protected += list((SESSIONS / 'blind').glob('*.png')) + [baseline_report_file]
    before = {str(p.relative_to(ROOT)): renderer.sha(p) for p in protected}

    out = SESSIONS / 'composites'
    asset = SESSIONS / 'assets/H2_D2.png'
    # Keep the exact baseline plan in memory; neither source JSON is rewritten.
    direction = {'id': 'H2_D2', 'layer_plan': copy.deepcopy(base_plan)}
    record = renderer.compose('H2_D2', direction, asset, out)
    for old, new in zip(prior['layers'], record['layers']):
        if old['kind'] != 'image' and old != new:
            raise ValueError(f'Non-image rendering adaptation changed: {old["id"]}')

    text_zone = next(l for l in old_layers if l['id'] == 'H0_D2_reading')
    x, y, w, h = renderer.rect_pixels(text_zone, base_plan['width_px'], base_plan['height_px'])
    box = (x, y, x+w, y+h)
    output_png = out / 'H2_D2.png'
    with Image.open(baseline_png) as original, Image.open(output_png) as edited:
        left, right = original.convert('RGB').crop(box), edited.convert('RGB').crop(box)
        difference = ImageChops.difference(left, right)
        red, green, blue = difference.split()
        largest_channel = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        changed_pixels = left.width*left.height - largest_channel.histogram()[0]
        max_channel_difference = max(value for pair in difference.getextrema() for value in pair)
        pixel_check = {'region_xyxy_px': list(box), 'region_size_px': list(left.size),
                       'changed_pixel_count': changed_pixels,
                       'max_channel_difference': max_channel_difference,
                       'pixel_identical': difference.getbbox() is None}
    if not pixel_check['pixel_identical']:
        raise ValueError('The complete reading panel differs from baseline')

    blind = SESSIONS / 'blind/h2'
    blind.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(baseline_png, blind / 'X.png')
    shutil.copyfile(output_png, blind / 'Y.png')
    thumb_w, thumb_h, label_h, gap = 432, 540, 38, 16
    sheet = Image.new('RGB', (thumb_w*2+gap*3, thumb_h+label_h+gap*2), '#E8E8E8')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(renderer.FONT_ROOT / 'Arial.ttf'), 23)
    for index, label in enumerate(('X', 'Y')):
        x = gap+index*(thumb_w+gap)
        draw.text((x+8, gap+5), label, fill='#111111', font=font)
        with Image.open(blind / f'{label}.png') as im:
            sheet.paste(im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), (x, gap+label_h))
    sheet.save(blind / 'contact-sheet.png')
    after = {str(p.relative_to(ROOT)): renderer.sha(p) for p in protected}
    if before != after:
        raise ValueError('Protected baseline evidence changed during rendering')
    report = {
        'candidate': 'H2', 'pillow_version': PIL.__version__,
        'script_sha256': renderer.sha(Path(__file__)),
        'baseline_renderer_sha256': renderer.sha(ROOT / 'render-candidates.py'),
        'input_hashes': {str(p.relative_to(ROOT)): renderer.sha(p) for p in
                         (candidate_file, baseline_file, baseline_report_file, asset)},
        'schema_normalization': {
            'instruction': candidate['render_instruction'],
            'font_ref_mapping': refs,
            'source_layer_plan': 'H0-output.json directions[id=H0_D2].layer_plan',
            'rendering_inputs_match': True,
            'metadata_ignored_for_render': ['name', 'editable', 'version', 'coordinate_space',
                                           'art_zone', 'solid_reading_zone', 'product_ref',
                                           'campaign_ref', 'variation_ref'],
            'source_warnings': candidate['warnings'],
            'resolved_for_this_experiment_only': 'H2 asset supplied; fonts use the exact logged H0 fallback. Source warnings remain unchanged.'},
        'mapping_for_coordinator_only': {'X': 'H0_D2', 'Y': 'H2_D2'},
        'composition': record, 'reading_panel_pixel_check': pixel_check,
        'baseline_files_unchanged': before == after, 'protected_hashes': after,
        'blind_output_hashes': {str(p.relative_to(ROOT)): renderer.sha(p) for p in sorted(blind.glob('*.png'))},
        'limits': ['Image generation can alter every pixel in the image layer.',
                   'The reading panel is pixel-identical; this does not prove exact preservation of the generated image.',
                   'Inter remains adapted to Arial exactly as in the original baseline.',
                   'No candidate or source image file is rewritten; this is an experimental compositor.']}
    report_file = out / 'H2-render-report.json'
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'rendered': 'H2_D2', 'output': str(output_png),
                      'report': str(report_file), 'reading_panel_pixel_check': pixel_check,
                      'baseline_files_unchanged': before == after,
                      'comparison': str(blind / 'contact-sheet.png')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

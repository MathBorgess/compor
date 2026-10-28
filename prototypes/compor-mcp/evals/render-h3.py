#!/usr/bin/env python3
"""Render H3 copy changes while preserving and checking the H0/H2 evidence."""
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
spec = importlib.util.spec_from_file_location('h2_helpers', ROOT / 'render-h2.py')
helpers = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(helpers)
renderer = helpers.renderer
FONT_REFS = {'inter': 'Inter'}
MAPPING = {'K1': 'H0_D1', 'K2': 'H2_D2', 'L1': 'H3_D1', 'L2': 'H3_D2'}


def difference_summary(difference: Image.Image) -> dict:
    red, green, blue = difference.split()
    largest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    changed = difference.width*difference.height - largest.histogram()[0]
    return {'changed_pixel_count': changed, 'pixel_identical': changed == 0,
            'max_channel_difference': max(v for pair in difference.getextrema() for v in pair),
            'difference_bbox_xyxy_px': difference.getbbox()}


def main() -> None:
    candidate_file = SESSIONS / 'H3-output.json'
    candidate = json.loads(candidate_file.read_text())
    original_file = SESSIONS / 'H0-output.json'
    h2_file = SESSIONS / 'H2-output.json'
    original = json.loads(original_file.read_text())
    h2 = json.loads(h2_file.read_text())
    original_report_file = SESSIONS / 'composites/render-report.json'
    h2_report_file = SESSIONS / 'composites/H2-render-report.json'
    original_report = json.loads(original_report_file.read_text())
    h2_report = json.loads(h2_report_file.read_text())
    if original_report['script_sha256'] != renderer.sha(ROOT / 'render-candidates.py'):
        raise ValueError('The original renderer changed')
    if h2_report['baseline_renderer_sha256'] != original_report['script_sha256']:
        raise ValueError('Baseline renderer identity differs between H0 and H2')
    for report in (original_report, h2_report):
        if report['pillow_version'] != PIL.__version__:
            raise ValueError('Pillow differs from the baseline runtime')
    for path, report in ((original_file, original_report), (h2_file, h2_report)):
        if renderer.sha(path) != report['input_hashes'][str(path.relative_to(ROOT))]:
            raise ValueError(f'Baseline candidate changed: {path.name}')

    baselines = {
        'H3_D1': (next(d for d in original['directions'] if d['id'] == 'H0_D1'),
                  next(r for r in original_report['compositions'] if r['id'] == 'H0_D1')),
        'H3_D2': (h2, h2_report['composition']),
    }
    protected = [SESSIONS / f'H{i}-output.json' for i in range(4)]
    protected += list((SESSIONS / 'assets').glob('H[012]_D*.png'))
    protected += list((SESSIONS / 'composites').glob('H[012]_D*.png'))
    protected += list((SESSIONS / 'blind').glob('*.png'))
    protected += list((SESSIONS / 'blind/h2').glob('*.png'))
    protected += [original_report_file, h2_report_file]
    before = {str(p.relative_to(ROOT)): renderer.sha(p) for p in protected}
    if {d['id'] for d in candidate['directions']} != set(baselines):
        raise ValueError('Expected exactly the two H3 directions')
    out = SESSIONS / 'composites'
    records, checks = [], []
    for direction in candidate['directions']:
        cid = direction['id']
        source, prior = baselines[cid]
        baseline_png = ROOT / prior['output_file']
        if renderer.sha(baseline_png) != prior['output_sha256']:
            raise ValueError(f'Baseline composite changed: {baseline_png.name}')
        source_plan, proposed = source['layer_plan'], direction['layer_plan']
        for key in ('piece_id', 'width_px', 'height_px'):
            if source_plan[key] != proposed[key]:
                raise ValueError(f'{cid} changes {key}')
        old_layers = sorted(source_plan['layers'], key=lambda l: l['z_index'])
        new_layers = sorted(proposed['layers'], key=lambda l: l['z_index'])
        allowed_ids = {f'{source_plan["piece_id"]}_{suffix}' for suffix in ('headline', 'copy')}
        if len(old_layers) != len(new_layers):
            raise ValueError('Layer count changed')
        for old, new in zip(old_layers, new_layers):
            old_signature = helpers.signature(old, FONT_REFS)
            new_signature = helpers.signature(new, FONT_REFS)
            if old['id'] in allowed_ids:
                del old_signature['text'], new_signature['text']
                field = old['id'].rsplit('_', 1)[1]
                if new['text'] != direction[field]:
                    raise ValueError(f'{cid} top-level {field} differs from its layer text')
            if old_signature != new_signature:
                raise ValueError(f'{cid} changes a protected style/input: {old["id"]}')
        prior_image = next(l for l in prior['layers'] if l['kind'] == 'image')
        asset = ROOT.parents[2] / direction['source_asset']
        if asset.resolve() != (ROOT / prior_image['asset_path']).resolve():
            raise ValueError(f'{cid} changes the source asset path')
        if renderer.sha(asset) != direction['source_asset_sha256'] or renderer.sha(asset) != prior_image['asset_sha256']:
            raise ValueError(f'{cid} source asset bytes differ')
        for layer in prior['layers']:
            if layer['kind'] == 'text' and renderer.sha(Path(layer['font_path'])) != layer['font_file_sha256']:
                raise ValueError('A baseline font file changed')

        # Normalize only the explicit C2 font reference; preserve all candidate text.
        normalized = copy.deepcopy(direction)
        for layer in normalized['layer_plan']['layers']:
            if layer['kind'] == 'text':
                layer['font_family'] = FONT_REFS[layer['font_ref']]
        record = renderer.compose(cid, normalized, asset, out)
        for old, new in zip(prior['layers'], record['layers']):
            if old['id'] in allowed_ids:
                if new['fit_resize']:
                    raise ValueError(f'{cid} would reduce font size; no automatic fit is allowed here')
                permitted_log_changes = {'text_preserved', 'used_width_px', 'used_height_px'}
                if {k:v for k,v in old.items() if k not in permitted_log_changes} != {k:v for k,v in new.items() if k not in permitted_log_changes}:
                    raise ValueError(f'{cid} rendering adaptation changed beyond content metrics')
            elif old != new:
                raise ValueError(f'{cid} changes non-target rendering: {old["id"]}')
        boxes = []
        for layer in new_layers:
            if layer['id'] in allowed_ids:
                x, y, w, h = renderer.rect_pixels(layer, proposed['width_px'], proposed['height_px'])
                boxes.append({'layer_id': layer['id'], 'box_xyxy_px': [x,y,x+w,y+h]})
        with Image.open(baseline_png) as old_image, Image.open(out / f'{cid}.png') as new_image:
            delta = ImageChops.difference(old_image.convert('RGB'), new_image.convert('RGB'))
            outside = delta.copy()
            draw = ImageDraw.Draw(outside)
            for entry in boxes:
                x, y, right, bottom = entry['box_xyxy_px']
                draw.rectangle((x,y,right-1,bottom-1), fill=(0,0,0))
            x,y,w,h = prior_image['box_px']
            image_check = difference_summary(delta.crop((x,y,x+w,y+h)))
            outside_check = difference_summary(outside)
            pixel_check = {'candidate': cid, 'baseline': prior['id'],
                           'allowed_text_boxes': boxes, 'whole_canvas': difference_summary(delta),
                           'image_region_xyxy_px': [x,y,x+w,y+h], 'image_region': image_check,
                           'outside_changed_text_boxes': outside_check}
        if not image_check['pixel_identical'] or not outside_check['pixel_identical']:
            raise ValueError(f'{cid} changes pixels outside authorized text boxes')
        records.append(record)
        checks.append(pixel_check)

    blind = SESSIONS / 'blind/h3'
    blind.mkdir(parents=True, exist_ok=True)
    for label, cid in MAPPING.items():
        shutil.copyfile(out / f'{cid}.png', blind / f'{label}.png')
    thumb_w, thumb_h, label_h, gap = 432, 540, 38, 16
    sheet = Image.new('RGB', (thumb_w*2+gap*3, (thumb_h+label_h)*2+gap*3), '#E8E8E8')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(renderer.FONT_ROOT / 'Arial.ttf'), 23)
    for index, label in enumerate(('K1','K2','L1','L2')):
        x = gap+(index%2)*(thumb_w+gap)
        y = gap+(index//2)*(thumb_h+label_h+gap)
        draw.text((x+8,y+5),label,fill='#111111',font=font)
        with Image.open(blind / f'{label}.png') as im:
            sheet.paste(im.resize((thumb_w,thumb_h),Image.Resampling.LANCZOS),(x,y+label_h))
    sheet.save(blind / 'contact-sheet.png')
    after = {str(p.relative_to(ROOT)): renderer.sha(p) for p in protected}
    if before != after:
        raise ValueError('Protected previous evidence or candidate inputs changed')
    report = {
        'candidate': 'H3', 'pillow_version': PIL.__version__,
        'script_sha256': renderer.sha(Path(__file__)),
        'helper_script_sha256': renderer.sha(ROOT / 'render-h2.py'),
        'baseline_renderer_sha256': renderer.sha(ROOT / 'render-candidates.py'),
        'input_hashes': {str(p.relative_to(ROOT)): renderer.sha(p) for p in
                         (candidate_file, original_file, h2_file, original_report_file, h2_report_file)},
        'schema_normalization': {'font_ref_mapping': FONT_REFS,
                                 'instruction': candidate['render_instructions'],
                                 'only_rendered_changes': ['headline text', 'copy text'],
                                 'source_warnings_unchanged': {d['id']:d['warnings'] for d in candidate['directions']}},
        'mapping_for_coordinator_only': MAPPING,
        'compositions': records, 'pixel_checks': checks,
        'previous_evidence_unchanged': before == after, 'protected_hashes': after,
        'blind_output_hashes': {str(p.relative_to(ROOT)): renderer.sha(p) for p in sorted(blind.glob('*.png'))},
        'limits': ['Experimental compositor; not the Compor implementation.',
                   'Inter remains adapted to Arial exactly as in the baseline.',
                   'Only authorized headline/copy pixels differ; no text was rewritten or fitted by this script.',
                   'Hashes and pixel checks demonstrate invariants, not creative quality or human approval.']}
    report_file = out / 'H3-render-report.json'
    report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'rendered':[r['id'] for r in records], 'report':str(report_file),
                      'comparison':str(blind / 'contact-sheet.png'),
                      'pixel_checks':checks, 'previous_evidence_unchanged':before == after},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()

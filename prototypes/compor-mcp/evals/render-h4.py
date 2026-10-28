#!/usr/bin/env python3
"""Standalone experimental C2 renderer for H4; never rewrites previous evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
SESSIONS = ROOT / 'sessions'
REPO = ROOT.parents[2]
FONT_ROOT = Path('/System/Library/Fonts/Supplemental')
FONT_REFS = {'arial':'Arial', 'georgia':'Georgia', 'inter':'Inter'}
MAPPING = {'N1':'H3_D1', 'N2':'H3_D2', 'M1':'H4_D1', 'M2':'H4_D2'}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def resolve_asset(direction: dict) -> Path:
    name = direction.get('asset_existing') or direction.get('asset_expected_path')
    if not isinstance(name, str) or not name:
        raise ValueError(f'{direction["id"]} needs an explicit existing or expected asset path')
    path = Path(name)
    if not path.is_absolute():
        if name.startswith('prototypes/'):
            path = REPO / path
        elif name.startswith('evals/'):
            path = ROOT.parent / path
        else:
            path = ROOT / path
    path = path.resolve()
    # The experiment accepts its explicitly supplied assets, not arbitrary files.
    if not path.is_relative_to((SESSIONS / 'assets').resolve()):
        raise ValueError('Image must be an asset in this evaluation session')
    return path


def rectangle(layer: dict, size: tuple[int,int]) -> tuple[int,int,int,int]:
    r = layer['rect']
    if not all(math.isfinite(r[k]) for k in ('x','y','width','height')):
        raise ValueError(f'Non-finite rectangle: {layer["id"]}')
    if min(r['x'],r['y']) < 0 or min(r['width'],r['height']) <= 0 or r['x']+r['width'] > 1.00000001 or r['y']+r['height'] > 1.00000001:
        raise ValueError(f'Out-of-canvas rectangle: {layer["id"]}')
    width,height = size
    box = (round(r['x']*width),round(r['y']*height),round(r['width']*width),round(r['height']*height))
    x,y,w,h = box
    if min(w,h) < 1 or x+w > width or y+h > height:
        raise ValueError(f'Pixel-rounded rectangle does not fit: {layer["id"]}')
    return box


def text_overlay(layer: dict, size: tuple[int,int]) -> tuple[Image.Image,dict]:
    x,y,w,h = rectangle(layer,size)
    family = FONT_REFS[layer['font_ref'].lower()]
    resolved_family = 'Arial' if family == 'Inter' else family
    requested_weight = layer.get('font_weight',400)
    resolved_weight = 700 if requested_weight >= 600 else 400
    path = FONT_ROOT / (resolved_family+(' Bold' if resolved_weight == 700 else '')+'.ttf')
    if not path.is_file():
        raise FileNotFoundError(f'Explicit local font missing: {path}')
    requested_size = layer['font_size_px']
    if not math.isfinite(requested_size) or int(requested_size) != requested_size or requested_size <= 0:
        raise ValueError('This renderer needs a positive integer font size; no rounding applied')
    font = ImageFont.truetype(str(path),int(requested_size))
    advance = requested_size*layer.get('line_height',1.2)
    align = layer.get('text_align','left')
    if align not in ('left','center','right'):
        raise ValueError('Unsupported text alignment')
    overlay = Image.new('RGBA',size,(0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    line_logs = []
    left_bearing_overhang = 0
    for index,line in enumerate(layer['text'].split('\n')):
        bounds = font.getbbox(line,anchor='lt')
        text_width = bounds[2]
        lx = x if align == 'left' else x+(w-text_width)/(2 if align == 'center' else 1)
        lx,ly = round(lx),round(y+index*advance)
        absolute = [lx+bounds[0],ly+bounds[1],lx+bounds[2],ly+bounds[3]]
        left_bearing_overhang = max(left_bearing_overhang,max(0,-bounds[0]))
        if text_width > w or absolute[1] < y or absolute[2] > x+w or absolute[3] > y+h:
            raise ValueError(f'Text needs a source revision to fit its box; no reduction applied: {layer["id"]}')
        # Font metric bounds can include empty bearing pixels (Arial A has -1px
        # at some sizes). Verify actual ink against the layer box below, while
        # rejecting out-of-canvas metrics before the canvas could clip pixels.
        if absolute[0] < 0 or absolute[1] < 0 or absolute[2] > size[0] or absolute[3] > size[1]:
            raise ValueError(f'Text exceeds the canvas at requested size: {layer["id"]}')
        draw.text((lx,ly),line,font=font,fill=layer['color_hex'],anchor='lt')
        line_logs.append({'text':line,'origin_px':[lx,ly],'metric_bounds_xyxy_px':absolute})
    alpha = overlay.getchannel('A')
    outside = alpha.copy()
    ImageDraw.Draw(outside).rectangle((x,y,x+w-1,y+h-1),fill=0)
    overflow_pixels = size[0]*size[1]-outside.histogram()[0]
    overhang_bbox = outside.getbbox()
    unexpected = outside.copy()
    if left_bearing_overhang:
        # Natural glyph bearing is visible, as in an unclipped text layer. Keep
        # its source origin and record ink outside the box instead of shifting
        # or cropping it. This does not allow long lines/height overflow.
        ImageDraw.Draw(unexpected).rectangle((x-left_bearing_overhang,y,x-1,y+h-1),fill=0)
    if unexpected.getbbox() is not None:
        raise ValueError(f'Actual text pixels escape the box: {layer["id"]}')
    log = {'id':layer['id'],'kind':'text','box_px':[x,y,w,h],
           'text_preserved':layer['text'],'font_ref':layer['font_ref'],
           'requested_family':family,'resolved_family':resolved_family,
           'requested_weight':requested_weight,'resolved_weight':resolved_weight,
           'font_fallback':family != resolved_family or requested_weight != resolved_weight,
           'font_path':str(path),'font_file_sha256':sha(path),
           'requested_size_px':requested_size,'effective_size_px':requested_size,
           'fit_resize':False,'line_advance_px':advance,'alignment':align,
           'lines':line_logs,'rendered_pixel_bbox_xyxy_px':alpha.getbbox(),
           'text_pixels_outside_box':overflow_pixels,
           'typographic_overhang':{'allowed_left_bearing_px':left_bearing_overhang,
                                   'visible_pixels':overflow_pixels,'bbox_xyxy_px':overhang_bbox},
           'text_clipped':False}
    return overlay,log


def preflight(direction: dict) -> dict:
    plan = direction['layer_plan']
    size = (plan['width_px'],plan['height_px'])
    if any(type(v) is not int or v <= 0 for v in size):
        raise ValueError('Canvas dimensions must be positive integers')
    layers = plan['layers']
    if len({l['id'] for l in layers}) != len(layers):
        raise ValueError('Duplicate layer id')
    if len({l['z_index'] for l in layers}) != len(layers):
        raise ValueError('Ambiguous duplicate z_index')
    if sum(l['kind'] == 'image' for l in layers) != 1:
        raise ValueError('H4 requires exactly one rectangular image per direction')
    instruction = direction.get('render_instruction',{})
    if instruction.get('image_fit','contain') != 'contain' or instruction.get('crop',False) or instruction.get('mask') is not None:
        raise ValueError('Only contain, without crop or image masks, is supported')
    text_logs = []
    for layer in layers:
        rectangle(layer,size)
        if layer['kind'] == 'shape':
            if layer['shape'] not in ('rectangle','ellipse'):
                raise ValueError('Only rectangle and ellipse shapes are supported')
            if 'fill_hex' not in layer:
                raise ValueError('Shapes require an explicit fill; no inferred style')
        elif layer['kind'] == 'text':
            _,log = text_overlay(layer,size)
            text_logs.append(log)
        elif layer['kind'] == 'image':
            if layer.get('image_fit','contain') != 'contain':
                raise ValueError('No implicit or explicit cropping in this experiment')
        else:
            raise ValueError(f'Unsupported layer kind: {layer["kind"]}')
    asset = resolve_asset(direction)
    return {'id':direction['id'],'canvas_size_px':list(size),'texts':text_logs,
            'asset_path':relative(asset),'asset_available':asset.is_file()}


def compose(direction: dict, out: Path) -> dict:
    plan = direction['layer_plan']
    size = (plan['width_px'],plan['height_px'])
    canvas = Image.new('RGBA',size,(255,255,255,255))
    asset = resolve_asset(direction)
    instruction = direction.get('render_instruction',{})
    logs = []
    for layer in sorted(plan['layers'],key=lambda l:l['z_index']):
        x,y,w,h = rectangle(layer,size)
        log = {'id':layer['id'],'kind':layer['kind'],'box_px':[x,y,w,h]}
        if layer['kind'] == 'shape':
            draw = ImageDraw.Draw(canvas)
            method = draw.rectangle if layer['shape'] == 'rectangle' else draw.ellipse
            method((x,y,x+w-1,y+h-1),fill=layer['fill_hex'])
            log.update({'shape':layer['shape'],'fill_hex':layer['fill_hex'],'clipped':False})
        elif layer['kind'] == 'text':
            overlay,log = text_overlay(layer,size)
            canvas = Image.alpha_composite(canvas,overlay)
        elif layer['kind'] == 'image':
            with Image.open(asset) as raw:
                raw_size, raw_mode = raw.size, raw.mode
                source = ImageOps.exif_transpose(raw).convert('RGBA')
                rendered = ImageOps.contain(source,(w,h),method=Image.Resampling.LANCZOS)
                dx,dy = (w-rendered.width)//2,(h-rendered.height)//2
                fill = instruction.get('letterbox_fill')
                if fill is not None:
                    ImageDraw.Draw(canvas).rectangle((x,y,x+w-1,y+h-1),fill=fill)
                canvas.alpha_composite(rendered,(x+dx,y+dy))
                log.update({'asset_path':relative(asset),'asset_sha256':sha(asset),
                            'raw_size_px':list(raw_size),'raw_mode':raw_mode,
                            'source_size_after_exif_px':list(source.size),
                            'alpha_extrema':list(source.getchannel('A').getextrema()),
                            'fit':'contain','crop':False,'mask':None,'clipped':False,
                            'resampling':'LANCZOS','letterbox_fill':fill,
                            'letterbox_fill_behavior':'explicit fill' if fill else 'preserve existing canvas',
                            'rendered_size_px':list(rendered.size),
                            'placed_rect_px':[x+dx,y+dy,rendered.width,rendered.height],
                            'letterbox_px':{'left':dx,'top':dy,'right':w-rendered.width-dx,'bottom':h-rendered.height-dy},
                            'crop_removed_source_px':[0,0]})
        logs.append(log)
    output = out / f'{direction["id"]}.png'
    canvas.convert('RGB').save(output)
    return {'id':direction['id'],'canvas_size_px':list(size),'layers':logs,
            'output_file':relative(output),'output_sha256':sha(output),
            'source_plan_unchanged':True,'canvas_initial_fill':'#FFFFFF',
            'text_clipped':False,'fit_resize':False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preflight',action='store_true',help='Validate all text/layout before assets arrive; render no output.')
    args = parser.parse_args()
    candidate_file = SESSIONS / 'H4-output.json'
    candidate = json.loads(candidate_file.read_text())
    directions = candidate['directions']
    if len(directions) != 2 or {d['id'] for d in directions} != {'H4_D1','H4_D2'}:
        raise ValueError('Expected exactly H4_D1 and H4_D2')
    checks = [preflight(d) for d in directions]
    missing = [c['asset_path'] for c in checks if not c['asset_available']]
    if args.preflight or missing:
        print(json.dumps({'preflight':'passed','text_boxes_checked':sum(len(c['texts']) for c in checks),
                          'missing_assets':missing,'rendered':[],'details':checks},ensure_ascii=False,indent=2))
        if missing and not args.preflight:
            raise SystemExit(2)
        return

    prior_report_file = SESSIONS / 'composites/H3-render-report.json'
    prior_report = json.loads(prior_report_file.read_text())
    for record in prior_report['compositions']:
        if sha(ROOT / record['output_file']) != record['output_sha256']:
            raise ValueError('An H3 baseline composite changed')
    protected = [SESSIONS / f'H{i}-output.json' for i in range(5)]
    protected += list((SESSIONS / 'assets').glob('H[01234]_D*.png'))
    protected += list((SESSIONS / 'composites').glob('H[0123]_D*.png'))
    protected += list((SESSIONS / 'composites').glob('*render-report.json'))
    protected = [p for p in protected if p.name != 'H4-render-report.json']
    for folder in ('blind','blind/h2','blind/h3'):
        protected += list((SESSIONS / folder).glob('*.png'))
    protected += [ROOT / name for name in ('render-candidates.py','render-h2.py','render-h3.py')]
    before = {relative(p):sha(p) for p in protected}
    out = SESSIONS / 'composites'
    records = [compose(d,out) for d in directions]
    blind = SESSIONS / 'blind/h4'
    blind.mkdir(parents=True,exist_ok=True)
    for label,cid in MAPPING.items():
        shutil.copyfile(out / f'{cid}.png',blind / f'{label}.png')
    thumb_w,thumb_h,label_h,gap = 432,540,38,16
    sheet = Image.new('RGB',(thumb_w*2+gap*3,(thumb_h+label_h)*2+gap*3),'#E8E8E8')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(FONT_ROOT / 'Arial.ttf'),23)
    for index,label in enumerate(('N1','N2','M1','M2')):
        x = gap+(index%2)*(thumb_w+gap)
        y = gap+(index//2)*(thumb_h+label_h+gap)
        draw.text((x+8,y+5),label,fill='#111111',font=font)
        with Image.open(blind / f'{label}.png') as im:
            sheet.paste(im.resize((thumb_w,thumb_h),Image.Resampling.LANCZOS),(x,y+label_h))
    sheet.save(blind / 'contact-sheet.png')
    after = {relative(p):sha(p) for p in protected}
    if before != after:
        raise ValueError('Previous evidence or input files changed during rendering')
    report = {'candidate':'H4','pillow_version':PIL.__version__,'script_sha256':sha(Path(__file__)),
              'input_hashes':{relative(candidate_file):sha(candidate_file)},
              'font_ref_mapping':FONT_REFS,'mapping_for_coordinator_only':MAPPING,
              'preflight':checks,'compositions':records,
              'previous_evidence_and_inputs_unchanged':before == after,'protected_hashes':after,
              'blind_output_hashes':{relative(p):sha(p) for p in sorted(blind.glob('*.png'))},
              'limits':['Standalone experimental Pillow compositor, not Compor implementation.',
                        'No source text or layout edited; no font reduction or image crop.',
                        'Contains requested assets without assuming transparency; letterbox is explicit.',
                        'H4 changes imagery, typography, copy and layout; comparison does not isolate a causal effect.',
                        'Pixel-fit checks do not demonstrate creative quality, user preference or approval.']}
    report_file = out / 'H4-render-report.json'
    report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'rendered':[r['id'] for r in records],'report':str(report_file),
                      'comparison':str(blind / 'contact-sheet.png'),
                      'previous_evidence_and_inputs_unchanged':before == after},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()

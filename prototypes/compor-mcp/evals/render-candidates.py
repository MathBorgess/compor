#!/usr/bin/env python3
"""Experimental deterministic compositor; preserves candidate text and plans.

Image assets are generated separately. This does not call a model or implement
Compor rendering. Exact font fallback, image fitting and text fitting are logged.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import PIL
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
SESSIONS = ROOT / 'sessions'
FONT_ROOT = Path('/System/Library/Fonts/Supplemental')
BLIND_MAP = {'H1_D1': 'P1', 'H1_D2': 'P2', 'H0_D1': 'Q1', 'H0_D2': 'Q2'}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def choose_font(family: str, weight: int) -> tuple[Path, dict]:
    # Font files are not copied into the repository. No network/install occurs.
    chosen_family = family if family in ('Arial', 'Georgia') else 'Arial'
    chosen_weight = 700 if weight >= 600 else 400
    name = chosen_family + (' Bold' if chosen_weight == 700 else '') + '.ttf'
    path = FONT_ROOT / name
    if not path.is_file():
        raise FileNotFoundError(f'Required local font missing: {path}; no silent fallback')
    return path, {
        'requested_family': family, 'requested_weight': weight,
        'resolved_family': chosen_family, 'resolved_weight': chosen_weight,
        'font_fallback': chosen_family != family or chosen_weight != weight,
        'font_path': str(path), 'font_file_sha256': sha(path),
    }


def rect_pixels(layer: dict, width: int, height: int) -> tuple[int, int, int, int]:
    # Both candidate schemas carry normalized rectangles; these are authoritative.
    r = layer['rect']
    if not all(math.isfinite(r[k]) for k in ('x', 'y', 'width', 'height')):
        raise ValueError('Non-finite geometry')
    if min(r['x'], r['y']) < 0 or min(r['width'], r['height']) <= 0 or r['x']+r['width'] > 1.00000001 or r['y']+r['height'] > 1.00000001:
        raise ValueError('Out-of-canvas rectangle')
    x, y = round(r['x'] * width), round(r['y'] * height)
    w, h = round(r['width'] * width), round(r['height'] * height)
    return x, y, w, h


def text_layer(layer: dict, box: tuple[int,int,int,int], canvas_size: tuple[int,int]) -> tuple[Image.Image,dict]:
    x, y, width, height = box
    spec = layer.get('font', {})
    family = spec.get('family', layer.get('font_family', 'Arial'))
    weight = int(spec.get('weight', layer.get('font_weight', 400)))
    size = int(spec.get('size_px', layer.get('font_size_px', 32)))
    path, log = choose_font(family, weight)
    advance = float(spec.get('line_height_px', size * layer.get('line_height', 1.2)))
    lines = layer['text'].split('\n')
    align = layer.get('text_align', 'left')
    if align not in ('left', 'center', 'right'):
        raise ValueError(f'Unsupported text alignment {align}')
    requested = size
    for effective in range(size, 5, -1):
        font = ImageFont.truetype(str(path), effective)
        line_advance = advance * effective / requested
        widths = [font.getbbox(line or ' ', anchor='lt')[2] for line in lines]
        heights = [font.getbbox(line or ' ', anchor='lt')[3] for line in lines]
        used_width = max(widths)
        used_height = math.ceil((len(lines)-1)*line_advance + heights[-1])
        if used_width <= width and used_height <= height:
            break
    else:
        raise ValueError(f'Text cannot fit without clipping: {layer["id"]}')
    result = Image.new('RGBA', canvas_size, (0,0,0,0))
    draw = ImageDraw.Draw(result)
    for index, line in enumerate(lines):
        lx = x if align == 'left' else x + (width-widths[index]) / (2 if align == 'center' else 1)
        draw.text((round(lx), round(y+index*line_advance)), line, font=font, fill=layer['color_hex'], anchor='lt')
    log.update({'kind': 'text', 'text_preserved': layer['text'], 'requested_size_px': requested,
                'effective_size_px': effective, 'fit_resize': effective != requested,
                'requested_line_advance_px': advance, 'effective_line_advance_px': line_advance,
                'used_width_px': used_width, 'used_height_px': used_height,
                'box_px': list(box), 'text_clipped': False})
    return result, log


def compose(candidate: str, direction: dict, asset: Path, out: Path) -> dict:
    raw_plan = direction['layer_plan']
    if isinstance(raw_plan, dict):
        width, height, layers = raw_plan['width_px'], raw_plan['height_px'], raw_plan['layers']
        schema = 'H0-layer_plan-object'
    elif isinstance(raw_plan, list):
        width, height, layers = 1080, 1350, raw_plan
        schema = 'H1-layer_plan-list; canvas from brief 1080x1350'
    else:
        raise ValueError('Unknown layer schema')
    canvas = Image.new('RGBA', (width,height), (255,255,255,255))
    logs = []
    for layer in sorted(layers, key=lambda l: l['z_index']):
        box = rect_pixels(layer,width,height)
        x,y,w,h = box
        log = {'id':layer['id'], 'kind':layer['kind'], 'box_px':list(box)}
        if layer['kind'] == 'shape':
            if layer['shape'] != 'rectangle':
                raise ValueError('Renderer only implements candidate rectangles')
            draw = ImageDraw.Draw(canvas)
            draw.rectangle((x,y,x+w-1,y+h-1), fill=layer['fill_hex'])
        elif layer['kind'] == 'text':
            rendered, detail = text_layer(layer,box,(width,height))
            canvas = Image.alpha_composite(canvas, rendered)
            log.update(detail)
        elif layer['kind'] == 'image':
            with Image.open(asset) as source:
                source = ImageOps.exif_transpose(source).convert('RGBA')
                fit = layer.get('image_fit','contain')
                if fit == 'cover':
                    rendered = ImageOps.fit(source,(w,h),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
                    scale = max(w/source.width,h/source.height)
                    crop = [source.width-w/scale,source.height-h/scale]
                    canvas.alpha_composite(rendered,(x,y))
                    log.update({'fit':fit,'crop_removed_total_source_px':crop})
                elif fit == 'contain':
                    rendered = ImageOps.contain(source,(w,h),method=Image.Resampling.LANCZOS)
                    dx,dy=(w-rendered.width)//2,(h-rendered.height)//2
                    canvas.alpha_composite(rendered,(x+dx,y+dy))
                    log.update({'fit':fit,'contain_default_no_crop':True,'letterbox_total_px':[w-rendered.width,h-rendered.height]})
                else:
                    raise ValueError(f'Unsupported image fit: {fit}')
                log.update({'asset_path':str(asset.relative_to(ROOT)), 'asset_sha256':sha(asset),
                            'source_size_px':list(source.size),'rendered_size_px':list(rendered.size)})
        else:
            raise ValueError(f'Unsupported layer kind: {layer["kind"]}')
        logs.append(log)
    output = out / f'{candidate}.png'
    canvas.convert('RGB').save(output)
    return {'id':candidate,'source_direction_id':direction['id'],'schema_normalization':schema,
            'canvas_size_px':[width,height],'output_file':str(output.relative_to(ROOT)),
            'output_sha256':sha(output),'layers':logs,
            'limits':'Experimental Pillow compositor, not Compor UI or renderer. Original candidate plans and text unchanged.'}


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument('--allow-missing',action='store_true',help='Render available candidates and list missing assets; never fabricate placeholders.')
    args=parser.parse_args()
    out=SESSIONS/'composites'; out.mkdir(parents=True,exist_ok=True)
    blind=SESSIONS/'blind'; blind.mkdir(parents=True,exist_ok=True)
    records=[]; missing=[]; sources={}
    for run in ('H0','H1'):
        file=SESSIONS/f'{run}-output.json'
        if not file.exists():
            missing.append(str(file.relative_to(ROOT)));continue
        sources[str(file.relative_to(ROOT))]=sha(file)
        data=json.loads(file.read_text())
        for index,direction in enumerate(data['directions'],1):
            candidate=f'{run}_D{index}'
            asset=SESSIONS/'assets'/f'{candidate}.png'
            if not asset.is_file():
                missing.append(str(asset.relative_to(ROOT)));continue
            record=compose(candidate,direction,asset,out)
            records.append(record)
            # Neutral IDs do not contain the harness names or direction titles.
            import shutil
            shutil.copyfile(out/f'{candidate}.png',blind/f'{BLIND_MAP[candidate]}.png')
    report={'pillow_version':PIL.__version__,'script_sha256':sha(Path(__file__)),
            'input_hashes':sources,'mapping_for_coordinator_only':BLIND_MAP,'missing':missing,'compositions':records,
            'comparison_limits':['Font substitution differs from requested Inter; all substitutions recorded.',
                                 'H0 unspecified image fit defaults contain; H1 explicit cover is honored, with crop recorded.',
                                 'No model, no evaluation and no editing of candidate JSON takes place in this script.']}
    (out/'render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if len(records)==4:
        thumb_w,thumb_h,label_h,gap=432,540,38,16
        sheet=Image.new('RGB',(thumb_w*2+gap*3,(thumb_h+label_h)*2+gap*3),'#E8E8E8')
        draw=ImageDraw.Draw(sheet); font=ImageFont.truetype(str(FONT_ROOT/'Arial.ttf'),23)
        for i,label in enumerate(('P1','P2','Q1','Q2')):
            x=gap+(i%2)*(thumb_w+gap);y=gap+(i//2)*(thumb_h+label_h+gap)
            draw.text((x+8,y+5),label,fill='#111111',font=font)
            with Image.open(blind/f'{label}.png') as im:
                sheet.paste(im.resize((thumb_w,thumb_h),Image.Resampling.LANCZOS),(x,y+label_h))
        sheet.save(blind/'contact-sheet.png')
    print(json.dumps({'rendered':[r['id'] for r in records],'missing':missing,'report':str(out/'render-report.json')},ensure_ascii=False,indent=2))
    if missing and not args.allow_missing:
        raise SystemExit(2)

if __name__=='__main__':
    main()

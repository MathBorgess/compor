#!/usr/bin/env python3
"""Compose synthetic fixture layers; no network, model, or production code."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops

OUT = Path(__file__).resolve().parent / 'output'
SIZE = (640, 800)

# All sample content is fictitious, with no third-party assets or credentials.
original = {
    'id': 'peca_ficticia', 'version': 'v1', 'size': list(SIZE),
    'layers': [
        {'id': 'fundo', 'kind': 'background', 'z': 0, 'color': '#101C38'},
        {'id': 'faixa', 'kind': 'rectangle', 'z': 1, 'bbox': [40, 44, 600, 756], 'color': '#EAF4EF', 'radius': 22},
        {'id': 'titulo', 'kind': 'text', 'z': 2, 'xy': [78, 115], 'text': 'Ideias que\nganham forma.', 'size': 50, 'color': '#14223E'},
        {'id': 'descricao', 'kind': 'text', 'z': 3, 'xy': [80, 275], 'text': 'Um encontro para tirar\nseu projeto do papel.', 'size': 26, 'color': '#384A60'},
        {'id': 'arte', 'kind': 'synthetic_raster', 'z': 4, 'bbox': [404, 352, 540, 488]},
        {'id': 'preco', 'kind': 'text', 'z': 5, 'xy': [80, 435], 'text': 'R$ 99', 'size': 40, 'color': '#14223E'},
        {'id': 'cta_fundo', 'kind': 'rectangle', 'z': 6, 'bbox': [80, 560, 390, 640], 'color': '#9B57ED', 'radius': 16},
        {'id': 'cta_texto', 'kind': 'text', 'z': 7, 'xy': [111, 580], 'text': 'Conhecer oficina', 'size': 27, 'color': '#FFFFFF'},
    ],
}
updated = copy.deepcopy(original)
updated['version'] = 'v2'
price = next(layer for layer in updated['layers'] if layer['id'] == 'preco')
price['size'] = 58


def mcp_prepare(piece: dict) -> dict:
    layers = []
    for layer in piece['layers']:
        x1, y1, x2, y2 = (layer['bbox'] if 'bbox' in layer else
                          (*layer['xy'], min(SIZE[0], layer['xy'][0] + 470), min(SIZE[1], layer['xy'][1] + 140))
                          if 'xy' in layer else (0, 0, *SIZE))
        item = {'id': layer['id'], 'name': layer['id'], 'z_index': layer['z'],
                'rect': {'x': x1 / SIZE[0], 'y': y1 / SIZE[1], 'width': (x2-x1) / SIZE[0], 'height': (y2-y1) / SIZE[1]}}
        if layer['kind'] == 'text':
            item.update(kind='text', text=layer['text'], font_size_px=layer['size'], color_hex=layer['color'])
        elif layer['kind'] == 'synthetic_raster':
            item.update(kind='image', asset_ref='arte_sintetica')
        else:
            item.update(kind='shape', shape='rectangle', fill_hex=layer['color'])
        layers.append(item)
    input_piece = {'piece_id': piece['id'], 'version': piece['version'], 'width_px': SIZE[0], 'height_px': SIZE[1], 'layers': layers}
    proc = subprocess.run(['node', str(Path(__file__).resolve().parent / 'prepare.mjs')], input=json.dumps(input_piece), text=True, capture_output=True, check=True)
    snapshot = json.loads(proc.stdout)
    assert snapshot['input_snapshot_authenticated'] is False and snapshot['persists_data'] is False
    assert snapshot['renders_or_generates_image'] is False
    return snapshot


def render_snapshot(snapshot: dict) -> tuple[Image.Image, dict[str, Image.Image]]:
    layers = []
    for entry in snapshot['piece']['layers']:
        r = entry['rect']
        x1, y1 = round(r['x'] * SIZE[0]), round(r['y'] * SIZE[1])
        x2, y2 = round((r['x'] + r['width']) * SIZE[0]), round((r['y'] + r['height']) * SIZE[1])
        layer = {'id': entry['id'], 'z': entry['z_index']}
        if entry['kind'] == 'text':
            layer.update(kind='text', xy=[x1, y1], text=entry['text'], size=entry['font_size_px'], color=entry['color_hex'])
        elif entry['kind'] == 'image':
            if entry.get('asset_ref') != 'arte_sintetica':
                raise ValueError('O renderer aceita somente o ativo sintético conhecido.')
            layer.update(kind='synthetic_raster', bbox=[x1, y1, x2, y2])
        else:
            layer.update(kind='rectangle', bbox=[x1, y1, x2, y2], color=entry['fill_hex'], radius=0)
        layers.append(layer)
    return compose({'layers': layers})


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    # Pillow >=10.1 ships a scalable default font; older versions fall back to
    # its fixed default and the visual size assertion will explicitly fail.
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def render_layer(layer: dict) -> Image.Image:
    canvas = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if layer['kind'] == 'background':
        draw.rectangle((0, 0, SIZE[0], SIZE[1]), fill=layer['color'])
    elif layer['kind'] == 'rectangle':
        draw.rounded_rectangle(layer['bbox'], radius=layer['radius'], fill=layer['color'])
    elif layer['kind'] == 'synthetic_raster':
        x1, y1, x2, y2 = layer['bbox']
        asset = Image.new('RGBA', (x2 - x1, y2 - y1), (246, 215, 106, 255))
        asset_draw = ImageDraw.Draw(asset)
        asset_draw.ellipse((16, 16, 120, 120), fill='#9B57ED')
        asset_draw.polygon(((40, 90), (72, 35), (105, 90)), fill='#FFFFFF')
        canvas.alpha_composite(asset, (x1, y1))
    elif layer['kind'] == 'text':
        draw.multiline_text(layer['xy'], layer['text'], font=font(layer['size']), fill=layer['color'], spacing=8)
    else:
        raise ValueError(f"Unsupported synthetic layer: {layer['kind']}")
    return canvas


def compose(piece: dict) -> tuple[Image.Image, dict[str, Image.Image]]:
    layers = {layer['id']: render_layer(layer) for layer in sorted(piece['layers'], key=lambda l: l['z'])}
    combined = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    for image in layers.values():
        combined = Image.alpha_composite(combined, image)
    return combined.convert('RGB'), layers


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    snap_before, snap_after = mcp_prepare(original), mcp_prepare(updated)
    before, layer_before = render_snapshot(snap_before)
    after, layer_after = render_snapshot(snap_after)
    before.save(OUT / 'antes.png')
    after.save(OUT / 'depois.png')
    (OUT / 'antes.json').write_text(json.dumps(snap_before, indent=2, ensure_ascii=False) + '\n')
    (OUT / 'depois.json').write_text(json.dumps(snap_after, indent=2, ensure_ascii=False) + '\n')
    before_by_id = {x['id']: x for x in snap_before['piece']['layers']}
    after_by_id = {x['id']: x for x in snap_after['piece']['layers']}
    assert len(before_by_id) == len(original['layers']) == len(after_by_id)
    assert before_by_id['preco']['text'] == after_by_id['preco']['text'] == 'R$ 99'
    assert all(before_by_id[k] == after_by_id[k] for k in before_by_id if k != 'preco')
    assert all(digest(layer_before[k]) == digest(layer_after[k]) for k in layer_before if k != 'preco')
    assert digest(layer_before['preco']) != digest(layer_after['preco']), 'A fonte fallback não mudou o tamanho visual.'
    # The combined composite only changes within the union of the two alpha
    # bounds of the price layer; this does not claim a model preserves pixels.
    alpha_union = ImageChops.lighter(layer_before['preco'].getchannel('A'), layer_after['preco'].getchannel('A'))
    difference = ImageChops.difference(before, after).convert('RGB')
    outside = difference.copy()
    outside.paste((0, 0, 0), mask=alpha_union.point(lambda alpha: 255 if alpha else 0))
    assert outside.getbbox() is None, 'Mudança fora da camada de preço.'
    result = {
        'mode': 'synthetic_mcp_inmemory_no_model_no_network',
        'case': 'click_preco_aumentar_fonte_manual',
        'source_version': 'v1', 'new_version': 'v2',
        'target_layer': 'preco', 'price_value': 'R$ 99',
        'unchanged_other_layer_specs': True, 'unchanged_other_layer_pixels': True,
        'changes_confined_to_price_alpha_union': True,
        'before_sha256_pixels': digest(before), 'after_sha256_pixels': digest(after),
        'notes': 'Sem interpretação de agente, autenticação, persistência de produto, edição por área ou teste de usuário.',
    }
    (OUT / 'resultado.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()

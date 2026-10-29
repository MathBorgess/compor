#!/usr/bin/env python3
"""Bounded experimental preview worker. Host context owns every filesystem path."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
RENDERER = HERE.parent / 'render' / 'renderer.py'
SLOTS = frozenset(('D1', 'D2', 'V1', 'V2', 'R1'))


class PreviewError(ValueError):
    def __init__(self, code):
        self.code = code


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise PreviewError('duplicate_json_key')
            value[key] = item
        return value
    def constant(_):
        raise PreviewError('nonfinite_json')
    return json.loads(data, object_pairs_hook=pairs, parse_constant=constant)


def require(condition, code):
    if not condition:
        raise PreviewError(code)


def save(path, value):
    with path.open('xb') as stream:
        stream.write(canonical(value) + b'\n')


def validate_revision(piece, base, layer_id):
    require(isinstance(base, dict), 'revision_base_required')
    require(isinstance(piece, dict), 'invalid_piece')
    require(isinstance(layer_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', layer_id),
            'revision_layer_required')
    targets = [layer for layer in base.get('layers', [])
               if isinstance(layer, dict) and layer.get('id') == layer_id and layer.get('kind') == 'text']
    require(len(targets) == 1, 'revision_layer_required')
    old, new = deepcopy(base), deepcopy(piece)
    require(new.get('version') != old.get('version'), 'revision_version_required')
    old.pop('version', None)
    new.pop('version', None)
    before, after = old.pop('layers', None), new.pop('layers', None)
    require(old == new and isinstance(before, list) and isinstance(after, list)
            and len(before) == len(after), 'revision_scope_violation')
    changed = 0
    for a, b in zip(before, after):
        if a == b:
            continue
        changed += 1
        require(isinstance(a, dict) and isinstance(b, dict)
                and a.get('kind') == b.get('kind') == 'text'
                and a.get('id') == b.get('id') == layer_id, 'revision_scope_violation')
        require(isinstance(a.get('text'), str) and isinstance(b.get('text'), str)
                and a['text'].split() == b['text'].split(), 'revision_words_changed')
        aa, bb = deepcopy(a), deepcopy(b)
        for key in ('font_size_px', 'text'):
            aa.pop(key, None)
            bb.pop(key, None)
        require(aa == bb, 'revision_scope_violation')
    require(changed <= 1, 'revision_multiple_layers')


def context_data(context):
    require(isinstance(context, dict), 'invalid_host_context')
    require(set(context) <= {'assets', 'output_root', 'renderer_sha256', 'revision_base', 'revision_layer_id'}
            and {'assets', 'output_root', 'renderer_sha256'} <= set(context), 'invalid_host_context')
    root = Path(context['output_root'])
    require(root.is_absolute(), 'invalid_host_context')
    require(isinstance(context['assets'], dict), 'invalid_host_context')
    require(context['renderer_sha256'] == digest(RENDERER.read_bytes()), 'renderer_hash_mismatch')
    return root


def reserve(root, slot):
    root.mkdir(parents=True, exist_ok=True)
    for attempt in (1, 2):
        directory = root / f'{slot}-attempt{attempt}'
        try:
            directory.mkdir()
            return directory, attempt
        except FileExistsError:
            continue
    return None, None


def preview(request, context):
    """Only slot and piece originate with the model; context is trusted host data."""
    result = {'status': 'failed', 'slot': None, 'attempt': None,
              'piece_id': None, 'version': None, 'piece_sha256': None}
    directory = None
    renderer_report = None
    try:
        root = context_data(context)
        require(isinstance(request, dict) and set(request) == {'slot', 'piece'}, 'invalid_request')
        slot = request['slot']
        require(isinstance(slot, str) and slot in SLOTS, 'invalid_slot')
        result['slot'] = slot
        directory, attempt = reserve(root, slot)
        if directory is None:
            result.update(status='budget_exhausted', diagnostic={
                'code': 'preview_budget_exhausted', 'detail': 'Two attempts already reserved for this slot.'})
            return result
        result['attempt'] = attempt
        save(directory / 'input.json', request)
        piece = request['piece']
        result['piece_sha256'] = digest(canonical(piece))
        if isinstance(piece, dict):
            for key in ('piece_id', 'version'):
                value = piece.get(key)
                if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value):
                    result[key] = value
        require(isinstance(piece, dict) and type(piece.get('width_px')) is int
                and type(piece.get('height_px')) is int
                and piece['width_px'] == piece['height_px'] == 1080, 'preview_canvas_must_be_1080')
        if slot == 'R1':
            validate_revision(piece, context.get('revision_base'), context.get('revision_layer_id'))
        spec = importlib.util.spec_from_file_location('compor_preview_frozen_renderer', RENDERER)
        renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(renderer)
        assets = {}
        # Validate the snapshot before consulting any asset ID. Extra fields such
        # as paths are rejected by the frozen renderer, never interpreted here.
        renderer.validate({'piece': piece, 'assets': {}})
        for layer in piece['layers']:
            if layer['kind'] != 'image':
                continue
            ref = layer.get('asset_ref')
            entry = context['assets'].get(ref)
            require(isinstance(entry, dict) and set(entry) == {'path', 'sha256'}, 'unapproved_asset')
            path = Path(entry['path'])
            require(path.is_absolute() and path.is_file(), 'host_asset_unavailable')
            require(digest(path.read_bytes()) == entry['sha256'], 'asset_hash_mismatch')
            assets[ref] = str(path)
        png, renderer_report = renderer.compose({'piece': piece, 'assets': assets})
        # Detect changes between allowlist verification and the renderer read.
        for layer in renderer_report['layers']:
            if layer['kind'] == 'image':
                require(layer['asset_sha256'] == context['assets'][layer['asset_ref']]['sha256'],
                        'asset_hash_mismatch')
        output = directory / 'preview.png'
        with output.open('xb') as stream:
            stream.write(png)
        result.update(status='rendered', preview_path=str(output), diagnostic={
            'code': 'rendered', 'detail': 'Snapshot composed without wrapping, resizing or clipping.',
            'png_sha256': digest(png),
            'text_layers': [{'layer_id': layer['id'], 'rect_px': layer['rect_px'],
                             'pixel_bbox_xyxy_px': list(layer['pixel_bbox_xyxy_px']) if layer['pixel_bbox_xyxy_px'] is not None else None}
                            for layer in renderer_report['layers'] if layer['kind'] == 'text']})
    except PreviewError as error:
        result['diagnostic'] = {'code': error.code, 'detail': 'Preview refused by the experiment contract.'}
    except Exception as error:
        # Do not emit raw exceptions: OSError and font failures can contain host
        # paths. A renderer code/opaque layer ID is sufficient model feedback.
        result['diagnostic'] = {'code': getattr(error, 'code', 'preview_internal_error'),
                                'detail': 'Composition failed; no preview was produced.'}
        layer_id = getattr(error, 'layer_id', None)
        if isinstance(layer_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', layer_id):
            result['diagnostic']['layer_id'] = layer_id
    if directory is not None:
        save(directory / 'report.json', {'result': result, 'renderer_report': renderer_report})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', type=Path, required=True)
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(1_000_001)
        require(len(raw) <= 1_000_000, 'request_too_large')
        result = preview(strict_json(raw), strict_json(args.context.read_bytes()))
    except Exception:
        result = {'status': 'failed', 'slot': None, 'attempt': None, 'piece_id': None,
                  'version': None, 'piece_sha256': None,
                  'diagnostic': {'code': 'invalid_input_or_host_context', 'detail': 'Preview request unavailable.'}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""Build an immutable visual judging package with neutral labels and verified lineage."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import shutil
from PIL import Image

import advance
import artifacts

STAGES = [(3, 'D', 'directions'), (4, 'V', 'variations'), (5, 'R', 'revision')]


def select_chain(run):
    """Keep the existing selection rule, but reject independently selected branches."""
    selected = {}
    for turn, _, _ in STAGES:
        candidates = []
        for source in sorted(run.glob(f't{turn}-artifacts*')):
            path = source / 'report.json'
            if path.is_file():
                report = advance.read(path)
                if report.get('status') == 'ready_for_render':
                    candidates.append((source, report))
        if not candidates:
            continue
        source, report = candidates[-1]
        advance.require(report.get('turn') == turn and report.get('run_dir') == str(run.resolve()),
                        f'T{turn} extraction identity differs from its run/turn')
        if turn > 3:
            advance.require(turn - 1 in selected, f'T{turn} has no selected preceding extraction')
            expected = (selected[turn - 1][0] / 'report.json').resolve()
            previous = report.get('previous', {})
            advance.require(isinstance(previous, dict) and isinstance(previous.get('path'), str)
                            and Path(previous['path']).resolve() == expected
                            and previous.get('sha256') == advance.file_hash(expected),
                            f'T{turn} previous path/hash differs from the selected T{turn - 1}; choose one explicit extraction chain')
        selected[turn] = source, report
    return selected


def verified_images(run):
    """Verify every selected PNG before creating any package output."""
    stages, images = [], []
    selected = select_chain(run)
    for turn, prefix, key in STAGES:
        stage = {'turn': turn, 'artifacts': [], 'missing': False}
        if turn not in selected:
            stage.update(missing=True, limitation='Artefato não disponível nesta etapa; não inferir uma nota visual.')
        else:
            source, report = selected[turn]
            envelope = advance.read(source / 'envelope.original.json')
            entries = [envelope[key]] if turn == 5 else envelope[key]
            advance.require(len(report['artifacts']) == len(entries), 'Extraction/envelope artifact counts differ')
            for position, (item, entry) in enumerate(zip(report['artifacts'], entries), 1):
                advance.require(item['id'] == entry['id'] and artifacts.opaque(item['id']),
                                'Extraction/envelope artifact identity differs')
                png = source / 'renders' / (item['id'] + '.png')
                public_id = prefix + str(position)
                if not png.is_file():
                    stage['artifacts'].append({'id': public_id, 'missing': True})
                    continue
                input_path = (source / item['render_input']).resolve()
                advance.require(input_path.is_relative_to(source.resolve()), 'Render input escapes extraction directory')
                payload = advance.read(input_path)
                advance.require(artifacts.sha(artifacts.canonical(payload)) == item['render_input_sha256'],
                                'Render input checksum differs from extraction')
                advance.require(artifacts.sha(artifacts.canonical(payload['piece'])) == item['mapped_piece_sha256'],
                                'Mapped piece checksum differs from extraction')
                rendered = advance.verify_render(payload, png, png.with_suffix('.json'))
                for layer in rendered['layers']:
                    if layer['kind'] == 'image':
                        recorded = report['assets'].get(layer['asset_ref'], {})
                        advance.require(recorded.get('sha256') == layer['asset_sha256'],
                                        'Rendered asset checksum differs from extraction')
                with Image.open(png) as im:
                    pixel_sha = hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()
                stage['artifacts'].append({'id': public_id, 'image': public_id + '.png',
                    'preview_360': public_id + '-360.png', 'caption': entry['caption'],
                    'pixel_sha256': pixel_sha})
                images.append((png, public_id, rendered['png_sha256']))
        stages.append(stage)
    return stages, images


def build_package(base, first, last, out, mapping_path, schedule=None):
    rows = [r for r in advance.read(schedule or base / 'schedule.json') if first <= r['order'] <= last]
    advance.require(rows and not out.exists() and not mapping_path.exists(),
                    'Explicit schedule slice and new output paths required')
    random.Random(84512 + first).shuffle(rows)
    prepared = []
    for index, row in enumerate(rows, 1):
        label = f'P{index:02d}'
        stages, images = verified_images(base / 'runs' / row['run_id'])
        case = advance.read(base / 'cases' / (row['case_id'] + '.json'))
        package = {'id': label, 'synthetic': True, 'task': case['turns'], 'stages': stages}
        prepared.append((label, row['run_id'], package, images))
    # Lineage/render failures above must not publish a partial or misleading package.
    out.mkdir(parents=True)
    mapping = {}
    for label, run_id, package, images in prepared:
        mapping[label] = run_id
        folder = out / label
        folder.mkdir()
        for png, public_id, expected_hash in images:
            destination = folder / (public_id + '.png')
            shutil.copyfile(png, destination)
            advance.require(advance.file_hash(destination) == expected_hash, 'PNG changed during package assembly')
            with Image.open(destination) as im:
                preview = im.convert('RGB').resize((360, round(im.height * 360 / im.width)), Image.Resampling.LANCZOS)
                preview.save(folder / (public_id + '-360.png'))
        (folder / 'package.json').write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
    with mapping_path.open('x') as stream:
        json.dump(mapping, stream, indent=2)
        stream.write('\n')
    shutil.copyfile(base.parents[3] / 'docs/evals/model-efficiency/rubric.md', out / 'rubric.md')
    (out / 'index.json').write_text(json.dumps({'packages': list(mapping), 'scope': 'Visual synthetic judging only; labels hide model/arm; missing stages are not scored.'}, indent=2) + '\n')
    return {'packages': len(mapping), 'out': str(out)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--first', type=int, required=True)
    parser.add_argument('--last', type=int, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--mapping', type=Path, required=True)
    parser.add_argument('--schedule', type=Path)
    args = parser.parse_args()
    try:
        result = build_package(Path(__file__).resolve().parent, args.first, args.last,
                               args.out, args.mapping, args.schedule)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(result))


if __name__ == '__main__':
    main()

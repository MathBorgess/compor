#!/usr/bin/env python3
"""Build an immutable visual judging package with neutral labels and unchanged pixels."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import shutil
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--first', type=int, required=True)
parser.add_argument('--last', type=int, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--mapping', type=Path, required=True)
parser.add_argument('--schedule', type=Path)
args = parser.parse_args()
base = Path(__file__).resolve().parent
rows = [r for r in json.loads((args.schedule or base / 'schedule.json').read_text()) if args.first <= r['order'] <= args.last]
if not rows or args.out.exists() or args.mapping.exists():
    parser.error('Explicit schedule slice and new output paths required')
random.Random(84512 + args.first).shuffle(rows)
args.out.mkdir(parents=True)
mapping = {}
packages = []
for index, row in enumerate(rows, 1):
    label = f'P{index:02d}'
    mapping[label] = row['run_id']
    run = base / 'runs' / row['run_id']
    folder = args.out / label
    folder.mkdir()
    case = json.loads((base / 'cases' / (row['case_id'] + '.json')).read_text())
    package = {'id': label, 'synthetic': True, 'task': case['turns'], 'stages': []}
    for turn, prefix, key in [(3, 'D', 'directions'), (4, 'V', 'variations'), (5, 'R', 'revision')]:
        stage = {'turn': turn, 'artifacts': [], 'missing': False}
        alternatives = sorted(run.glob(f't{turn}-artifacts*'))
        candidates = [a for a in alternatives if (a / 'report.json').is_file()
                      and json.loads((a / 'report.json').read_text()).get('status') == 'ready_for_render']
        if not candidates:
            stage['missing'] = True
            stage['limitation'] = 'Artefato não disponível nesta etapa; não inferir uma nota visual.'
        else:
            source = candidates[-1]
            report = json.loads((source / 'report.json').read_text())
            envelope = json.loads((source / 'envelope.original.json').read_text())
            entries = [envelope[key]] if turn == 5 else envelope[key]
            for position, (item, entry) in enumerate(zip(report['artifacts'], entries), 1):
                assert item['id'] == entry['id']
                png = source / 'renders' / (item['id'] + '.png')
                public_id = prefix + str(position)
                if not png.is_file():
                    stage['artifacts'].append({'id': public_id, 'missing': True})
                    continue
                destination = folder / (public_id + '.png')
                shutil.copyfile(png, destination)
                with Image.open(png) as im:
                    preview = im.convert('RGB').resize((360, round(im.height * 360 / im.width)), Image.Resampling.LANCZOS)
                    preview.save(folder / (public_id + '-360.png'))
                    pixel_sha = hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()
                stage['artifacts'].append({'id': public_id, 'image': destination.name,
                    'preview_360': public_id + '-360.png', 'caption': entry['caption'],
                    'pixel_sha256': pixel_sha})
        package['stages'].append(stage)
    (folder / 'package.json').write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
    packages.append(label)
with args.mapping.open('x') as stream:
    json.dump(mapping, stream, indent=2)
    stream.write('\n')
repo = base.parents[3]
shutil.copyfile(repo / 'docs/evals/model-efficiency/rubric.md', args.out / 'rubric.md')
(args.out / 'index.json').write_text(json.dumps({'packages': packages, 'scope': 'Visual synthetic judging only; labels hide model/arm; missing stages are not scored.'}, indent=2) + '\n')
print(json.dumps({'packages': len(packages), 'out': str(args.out)}))

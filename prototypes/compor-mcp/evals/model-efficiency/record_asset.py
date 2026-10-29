#!/usr/bin/env python3
"""Record one already-generated native tool asset; does not generate or edit it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run', type=Path, required=True)
parser.add_argument('--requests', type=Path, required=True)
parser.add_argument('--index', type=int, required=True)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--elapsed-ms', type=int, required=True)
args = parser.parse_args()
requests = json.loads(args.requests.read_text())
if not isinstance(requests, list) or not 0 <= args.index < len(requests):
    parser.error('Invalid request index')
request = requests[args.index]
asset_ref = request['asset_ref']
if not __import__('re').fullmatch(r'[A-Za-z0-9_-]{1,80}', asset_ref):
    parser.error('Invalid local asset ID')
run = args.run.resolve()
folder = run / 'assets'
folder.mkdir(exist_ok=True)
target = folder / (asset_ref + '.png')
record = folder / (asset_ref + '.generation.json')
if target.exists() or record.exists() or not args.source.is_file() or args.elapsed_ms < 0:
    parser.error('Source missing, invalid timing or existing output')
if args.source.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
    parser.error('Native asset is not PNG')
shutil.copyfile(args.source, target)
value = {**request, 'source_path': str(args.source.resolve()), 'output_path': str(target),
         'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'elapsed_ms': args.elapsed_ms,
         'tool': 'image_gen.imagegen', 'provider_model_version': None, 'attempt': 1,
         'transparent_background': False, 'kind': 'new_generation',
         'prompt_modified_by_coordinator': False}
with record.open('x') as stream:
    json.dump(value, stream, ensure_ascii=False, indent=2)
    stream.write('\n')
print(json.dumps({'asset_ref': asset_ref, 'path': str(target), 'sha256': value['sha256']}))

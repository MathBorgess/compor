#!/usr/bin/env python3
"""Create a source-only Vercel bundle from one immutable Git commit.

Usage: python3 scripts/stage_vercel_web.py <40-char-commit> <new-output-directory>
The output directory must not exist. No deploy, secrets, or untracked files are read.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

PACKAGES = ('agents-api', 'images-api', 'private-images', 'remote-mcp')

def git(*args):
    return subprocess.check_output(['git', *args])

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result

def main():
    if len(sys.argv) != 3 or not re.fullmatch(r'[0-9a-f]{40}', sys.argv[1]):
        raise ValueError('expected immutable commit SHA and new output directory')
    commit = sys.argv[1]
    if git('rev-parse', '--verify', f'{commit}^{{commit}}').decode().strip() != commit:
        raise ValueError('commit not found')
    generator = git('show', f'{commit}:scripts/stage_vercel_web.py')
    if generator != Path(__file__).resolve().read_bytes():
        raise ValueError('generator differs from selected commit')
    generator_sha256 = hashlib.sha256(generator).hexdigest()
    root = Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve()
    output = Path(sys.argv[2])
    if not output.is_absolute() or output.exists():
        raise ValueError('output must be an absolute, nonexistent directory')
    resolved = output.resolve()
    if resolved == root or root in resolved.parents or resolved in root.parents:
        raise ValueError('output must be outside the repository')
    specs = ['apps/web/app', 'apps/web/lib', 'apps/web/public', 'apps/web/package.json',
             'apps/web/package-lock.json', 'apps/web/next.config.mjs', 'apps/web/.npmrc', 'apps/web/vercel.json']
    for name in PACKAGES:
        specs += [f'packages/{name}/package.json', f'packages/{name}/src']
    tree = git('ls-tree', '-r', '-z', '--full-tree', commit, '--', *specs)
    entries = []
    for entry in tree.split(b'\0'):
        if not entry:
            continue
        metadata, path_bytes = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode('ascii').split(' ')
        path = path_bytes.decode('utf8')
        if kind != 'blob' or mode not in ('100644', '100755') or any(part in ('', '.', '..') for part in path.split('/')):
            raise ValueError('unsupported tracked path or file mode')
        if any(ord(char) < 32 for char in path) or any(part.startswith('.env') for part in path.split('/')) or path.lower().endswith(('.pem', '.key', '.p12', '.pfx')):
            raise ValueError('sensitive or invalid tracked filename in bundle scope')
        if path.startswith('apps/web/'):
            destination = path
        else:
            parts = path.split('/')
            if len(parts) < 3 or parts[0] != 'packages' or parts[1] not in PACKAGES:
                raise ValueError('unexpected package path')
            destination = 'apps/web/vendor/' + '/'.join(parts[1:])
        entries.append((destination, oid))
    names = {name for name, _ in entries}
    required = {'apps/web/package.json', 'apps/web/package-lock.json', 'apps/web/next.config.mjs',
                'apps/web/.npmrc', 'apps/web/vercel.json'} | {f'apps/web/vendor/{name}/package.json' for name in PACKAGES}
    if not required.issubset(names) or not any(name.startswith('apps/web/app/') for name in names):
        raise ValueError('missing required source files')
    output.mkdir(mode=0o700)
    for name, oid in entries:
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(git('cat-file', 'blob', oid))
    app = output / 'apps/web'
    manifest = json.loads((app / 'package.json').read_text(), object_pairs_hook=unique_object)
    lock = json.loads((app / 'package-lock.json').read_text(), object_pairs_hook=unique_object)
    for name in PACKAGES:
        package = f'@compor/{name}'
        old, new = f'file:../../packages/{name}', f'file:vendor/{name}'
        if manifest['dependencies'].get(package) != old or lock['packages']['']['dependencies'].get(package) != old or lock['packages'][f'node_modules/{package}'].get('resolved') != old:
            raise ValueError('unexpected local dependency or lockfile')
        manifest['dependencies'][package] = new
        lock['packages']['']['dependencies'][package] = new
        lock['packages'][f'node_modules/{package}']['resolved'] = new
    if 'file:../../' in json.dumps(manifest) or 'file:../../' in json.dumps(lock):
        raise ValueError('bundle has another dependency outside the app root')
    for filename, value in [('package.json', manifest), ('package-lock.json', lock)]:
        (app / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    outputs = sorted(p for p in output.rglob('*') if p.is_file())
    listing = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs}
    manifest_path = output / 'STAGE-MANIFEST.json'
    manifest_path.write_text(json.dumps({'commit': commit, 'generator_sha256': generator_sha256, 'files': listing}, indent=2) + '\n')
    print(json.dumps({'commit': commit, 'output': str(output), 'files': len(listing),
                      'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()}))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Unable to stage Vercel bundle: {error}', file=sys.stderr)
        sys.exit(1)

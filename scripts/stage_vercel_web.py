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

PACKAGES = ('agents-api', 'agile-deliberation', 'images-api', 'private-images', 'remote-mcp')
PHOENIX_FILES = ('app/api/studio/decision/route.ts', 'lib/phoenix-worker.ts',
                 'lib/studio-decision-route.ts', 'lib/studio-decision-contract.ts',
                 'lib/phoenix/catalog.ts', 'lib/phoenix/deterministic.ts',
                 'lib/phoenix/formulas.ts', 'lib/phoenix/hyperparams.ts',
                 'lib/phoenix/models.ts', 'lib/phoenix/source-manifest.json', 'lib/phoenix/PROVENANCE.md')
DEPENDENCIES = ('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies')
UPSTREAM_FILES = {
    'third_party/google-research/agile_deliberation/LICENSE': 'apps/web/vendor/agile-deliberation/LICENSE',
    'third_party/google-research/agile_deliberation/provenance.json': 'apps/web/vendor/agile-deliberation/UPSTREAM-PROVENANCE.json',
}

def git(*args):
    return subprocess.check_output(['git', *args])

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result

def validate_vendor_dependencies(manifest):
    for field in DEPENDENCIES:
        for dependency, value in manifest.get(field, {}).items():
            if not isinstance(value, str) or not value.startswith('file:'):
                continue
            name = dependency.removeprefix('@compor/')
            if dependency != f'@compor/{name}' or name not in PACKAGES or value != f'file:../{name}':
                raise ValueError('local dependency points outside the staged package graph')

def validate_file_paths(value, allowed):
    if isinstance(value, dict):
        for item in value.values():
            validate_file_paths(item, allowed)
    elif isinstance(value, list):
        for item in value:
            validate_file_paths(item, allowed)
    elif isinstance(value, str) and value.startswith('file:') and value not in allowed:
        raise ValueError('bundle has a dependency outside the app root')

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
             'apps/web/package-lock.json', 'apps/web/next.config.mjs', 'apps/web/.npmrc', 'apps/web/vercel.json',
             'apps/web/tsconfig.json', 'apps/web/next-env.d.ts', 'apps/web/proxy.ts']
    for name in PACKAGES:
        specs += [f'packages/{name}/package.json', f'packages/{name}/src']
    specs += list(UPSTREAM_FILES)
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
        if path in UPSTREAM_FILES:
            destination = UPSTREAM_FILES[path]
        elif path.startswith('apps/web/'):
            destination = path
        else:
            parts = path.split('/')
            if len(parts) < 3 or parts[0] != 'packages' or parts[1] not in PACKAGES:
                raise ValueError('unexpected package path')
            destination = 'apps/web/vendor/' + '/'.join(parts[1:])
        entries.append((destination, oid))
    names = {name for name, _ in entries}
    required = {'apps/web/package.json', 'apps/web/package-lock.json', 'apps/web/next.config.mjs',
                'apps/web/.npmrc', 'apps/web/vercel.json', 'apps/web/tsconfig.json', 'apps/web/next-env.d.ts', 'apps/web/proxy.ts'} | {f'apps/web/vendor/{name}/package.json' for name in PACKAGES} | set(UPSTREAM_FILES.values()) | {f'apps/web/{name}' for name in PHOENIX_FILES}
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
    vendor_files = {f'file:vendor/{name}' for name in PACKAGES}
    sibling_files = {f'file:../{name}' for name in PACKAGES}
    for name in PACKAGES:
        package = f'@compor/{name}'
        old, new = f'file:../../packages/{name}', f'file:vendor/{name}'
        if manifest['dependencies'].get(package) != old or lock['packages']['']['dependencies'].get(package) != old or lock['packages'][f'node_modules/{package}'].get('resolved') != old:
            raise ValueError('unexpected local dependency or lockfile')
        manifest['dependencies'][package] = new
        lock['packages']['']['dependencies'][package] = new
        lock['packages'][f'node_modules/{package}']['resolved'] = new
        vendor_path = app / f'vendor/{name}/package.json'
        vendor = json.loads(vendor_path.read_text(), object_pairs_hook=unique_object)
        if vendor.get('name') != package or vendor.get('version') != lock['packages'][f'node_modules/{package}'].get('version'):
            raise ValueError('vendored package and lockfile identity differ')
        validate_vendor_dependencies(vendor)
        validate_file_paths(vendor, sibling_files)
        for field in ('dependencies', 'optionalDependencies', 'peerDependencies'):
            if field in vendor:
                lock['packages'][f'node_modules/{package}'][field] = vendor[field]
    validate_file_paths(manifest, vendor_files)
    lock_paths = {'': vendor_files, **{f'node_modules/@compor/{name}': vendor_files | sibling_files for name in PACKAGES}}
    for path, package_lock in lock['packages'].items():
        validate_file_paths(package_lock, lock_paths.get(path, set()))
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

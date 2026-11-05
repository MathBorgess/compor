import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packages = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => `packages/${entry.name}`);
packages.push('prototypes/compor-mcp');

for (const directory of packages) {
  console.log(`Testing ${directory}`);
  const result = spawnSync('npm', ['test', '--prefix', directory], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const python = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'], { cwd: root, stdio: 'inherit' });
if (python.error) throw python.error;
process.exitCode = python.status ?? 1;

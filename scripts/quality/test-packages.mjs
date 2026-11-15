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
  const npm = process.env.npm_execpath;
  if (!npm) throw Error('Run package checks through npm run quality:unit.');
  const result = spawnSync(process.execPath, [npm, 'test', '--prefix', directory], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'], { cwd: root, stdio: 'inherit' });
if (python.error) throw python.error;
process.exitCode = python.status ?? 1;

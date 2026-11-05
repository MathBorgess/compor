import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const browser = process.env.BROWSER_EXECUTABLE_PATH;
if (!browser) throw Error('Set BROWSER_EXECUTABLE_PATH to an installed Chromium executable. Browser tests must not silently skip.');
accessSync(browser, constants.X_OK);
const version = spawnSync(browser, ['--version'], { encoding: 'utf8' });
if (version.status !== 0) throw Error('Configured Chromium could not run.');
console.log(version.stdout.trim());
const result = spawnSync('npm', ['test'], {
  cwd: resolve(import.meta.dirname, '../../apps/web'),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

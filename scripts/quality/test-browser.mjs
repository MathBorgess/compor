import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {createRequire} from 'node:module';

const browser = process.env.BROWSER_EXECUTABLE_PATH;
if (!browser) throw Error('Set BROWSER_EXECUTABLE_PATH to an installed Chromium executable. Browser tests must not silently skip.');
accessSync(browser, constants.X_OK);
if (process.platform === 'win32') {
  // Windows Chrome treats --version as a GUI launch. Probe the same mandatory
  // executable headlessly instead of leaving a desktop process waiting forever.
  const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const {chromium} = require('playwright-core');
  const probe = await chromium.launch({executablePath:browser,headless:true});
  try { console.log(await probe.version()); } finally { await probe.close(); }
} else {
  const version = spawnSync(browser, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) throw Error('Configured Chromium could not run.');
  console.log(version.stdout.trim());
}
const result = spawnSync(process.execPath, ['test/run.mjs'], {
  cwd: resolve(import.meta.dirname, '../../apps/web'),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

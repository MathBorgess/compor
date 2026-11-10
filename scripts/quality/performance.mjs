import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cpus, loadavg, platform, arch } from 'node:os';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { summarizeRuns, budgetFailures, summarizeDiagnostics, entryScripts } from './performance-report.mjs';

const root = resolve(import.meta.dirname, '../..');
const app = resolve(root, 'apps/web');
const output = resolve(root, 'quality-results/performance');
const budgets = JSON.parse(await readFile(new URL('./budgets.json', import.meta.url), 'utf8'));
if (!Number.isInteger(budgets.runs) || budgets.runs < 3 || budgets.runs > 9 || budgets.runs % 2 !== 1) throw Error('Use an odd number of Lighthouse runs between 3 and 9.');
const browser = process.env.BROWSER_EXECUTABLE_PATH;
if (!browser) throw Error('Set BROWSER_EXECUTABLE_PATH to an installed Chromium executable.');
await access(browser, constants.X_OK);
await access(resolve(app, '.next/BUILD_ID'));
await mkdir(output, { recursive: true });

const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
  cwd: app,
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    APP_ORIGIN: origin, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_quality_fixture',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data.toString(); });
let chrome;
let report = {
  status: 'running',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  measuredAt: new Date().toISOString(),
  scope: 'Production signed-out entry with synthetic public configuration. No authentication or AI generation.',
  budgets,
};
try {
  const deadline = Date.now() + 30000;
  let html;
  while (!html) {
    if (server.exitCode !== null) throw Error('Production server exited before the audit.');
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) });
      if (response.ok) html = await response.text();
    } catch {}
    if (html) break;
    if (Date.now() > deadline) throw Error('Production server did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const initialFiles = [];
  for (const url of entryScripts(html, origin)) {
    const file = resolve(app, '.next', url.pathname.slice('/_next/'.length));
    const bytes = await readFile(file);
    initialFiles.push({ file: relative(app, file), bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  const allFiles = await readdir(resolve(app, '.next/static'), { recursive: true });
  const allSizes = await Promise.all(allFiles.filter(file => file.endsWith('.js')).map(async file => gzipSync(await readFile(resolve(app, '.next/static', file))).length));
  const bundle = {
    initialJavascriptGzipBytes: initialFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
    totalClientJavascriptGzipBytes: allSizes.reduce((sum, size) => sum + size, 0),
    initialFiles,
  };
  await writeFile(resolve(output, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  chrome = await launch({ chromePath: browser, chromeFlags: ['--headless=new', '--disable-dev-shm-usage'], logLevel: 'error' });
  const results = [];
  for (let index = 0; index < budgets.runs; index++) {
    const result = await lighthouse(origin, {
      port: chrome.port, output: ['json', 'html'], logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      formFactor: 'mobile', throttlingMethod: 'simulate',
      blockedUrlPatterns: ['*://*.supabase.co/*', '*://api.openai.com/*'],
    });
    if (!result?.lhr) throw Error('Lighthouse returned no audit report.');
    await writeFile(resolve(output, `run-${index + 1}.json`), result.report[0]);
    await writeFile(resolve(output, `run-${index + 1}.html`), result.report[1]);
    if (result.lhr.finalDisplayedUrl !== `${origin}/`) throw Error('Lighthouse navigated away from the Compor entry.');
    results.push(result.lhr);
    console.log(`Lighthouse run ${index + 1}/${budgets.runs} recorded.`);
  }
  const metrics = summarizeRuns(results);
  const failures = budgetFailures(bundle, metrics, budgets);
  report = {
    ...report,
    status: failures.length ? 'failed' : 'passed',
    environment: { node: process.version, platform: platform(), arch: arch(), cpuCount: cpus().length, loadAverage: loadavg(), browser: results[0].userAgent, lighthouse: results[0].lighthouseVersion },
    settings: results[0].configSettings,
    runs: results.length, bundle, metrics, budgets, failures,
    diagnostics: results.map(result => ({
      bootupTimeMs: result.audits['bootup-time']?.numericValue,
      mainThreadTimeMs: result.audits['mainthread-work-breakdown']?.numericValue,
      warnings: result.runWarnings,
    })),
  };
  console.log(JSON.stringify({ bundle: { ...bundle, initialFiles: undefined }, metrics, failures }, null, 2));
  console.log(JSON.stringify({ diagnostics: results.map(result => summarizeDiagnostics(result, origin)) }, null, 2));
  if (failures.length) throw Error(`Performance budget failed. ${failures.join('; ')}`);
} catch (error) {
  report = { ...report, status: 'failed', error: error.message };
  throw error;
} finally {
  try {
    await chrome?.kill();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    await writeFile(resolve(output, 'server.log'), serverLog);
    await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}

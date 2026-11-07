import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuns, budgetFailures, summarizeDiagnostics } from './performance-report.mjs';

const run = (lcp = 1000) => ({ finalDisplayedUrl: 'http://127.0.0.1:3000/', audits: {
  'network-requests': { details: { items: [{ url: 'http://127.0.0.1:3000/', resourceType: 'Document', statusCode: 200, finished: true }] } },
  'errors-in-console': { score: 1 },
  'largest-contentful-paint': { numericValue: lcp },
  'total-blocking-time': { numericValue: 50 },
  'cumulative-layout-shift': { numericValue: 0 },
} });

test('an error page or missing measurement cannot pass as a fast page', () => {
  assert.throws(() => summarizeRuns([run(), run(), { runtimeError: { code: 'NO_FCP' } }]));
  const failedPage = run(); failedPage.audits['network-requests'].details.items[0].statusCode = 500;
  assert.throws(() => summarizeRuns([run(), run(), failedPage]));
  const brokenPage = run(); brokenPage.audits['errors-in-console'].score = 0;
  assert.throws(() => summarizeRuns([run(), run(), brokenPage]));
  const missing = run(); delete missing.audits['largest-contentful-paint'];
  assert.throws(() => summarizeRuns([run(), run(), missing]));
  assert.throws(() => summarizeRuns([run(), run()]));
});

test('one noisy run is reported while sustained regression fails the budget', () => {
  const report = summarizeRuns([run(1000), run(1200), run(9000)]);
  assert.deepEqual(report.largestContentfulPaintMs, { median: 1200, min: 1000, max: 9000 });
  assert.equal(budgetFailures({}, report, { largestContentfulPaintMs: 1100 }).length, 1);
  assert.equal(budgetFailures({}, report, { largestContentfulPaintMs: 1300 }).length, 0);
});

test('missing or oversized bundles cannot pass the budget', () => {
  assert.equal(budgetFailures({}, {}, { initialJavascriptGzipBytes: 100 }).length, 1);
  assert.equal(budgetFailures({ initialJavascriptGzipBytes: 101 }, {}, { initialJavascriptGzipBytes: 100 }).length, 1);
});

test('diagnostics keep local chunk timings while excluding private URLs and malformed values', () => {
  const result = run();
  result.environment = { benchmarkIndex: 1245.65 };
  result.audits['mainthread-work-breakdown'] = { details: { items: [
    { group: 'scriptEvaluation', duration: 135.14 }, { group: 'bad?name', duration: 1 }, { group: 'other', duration: -1 },
  ] } };
  result.audits['bootup-time'] = { details: { items: [
    { url: 'http://127.0.0.1:3000/_next/static/chunks/app.js?secret=hidden', total: 120, scripting: 100, scriptParseCompile: 20 },
    { url: 'https://other.example/private?secret=hidden', total: 1 },
  ] } };
  result.audits['long-tasks'] = { details: { items: [
    { url: 'http://127.0.0.1:3000/_next/static/chunks/app.js?secret=hidden', startTime: 11.24, duration: 91.15 },
    { url: 'https://other.example/private?secret=hidden', startTime: 4, duration: 120 },
    { url: 'http://127.0.0.1:3000/private?secret=hidden', startTime: 2, duration: 15 },
    { url: 'https://other.example/private', startTime: -1, duration: 20 },
    { url: 'https://other.example/private', startTime: 1, duration: Infinity },
    { url: 'https://other.example/private', startTime: 1, duration: Number.MAX_VALUE },
  ] } };
  const diagnostics = summarizeDiagnostics(result, 'http://127.0.0.1:3000');
  assert.equal(diagnostics.benchmarkIndex, 1245.7);
  assert.deepEqual(diagnostics.mainThread, [{ group: 'scriptEvaluation', durationMs: 135.1 }]);
  assert.deepEqual(diagnostics.scripts, [
    { path: '/_next/static/chunks/app.js', totalMs: 120, scriptingMs: 100, parseCompileMs: 20 },
    { path: 'other', totalMs: 1, scriptingMs: null, parseCompileMs: null },
  ]);
  assert.deepEqual(diagnostics.longTasks, [
    { path: 'other', startTimeMs: 4, durationMs: 120 },
    { path: '/_next/static/chunks/app.js', startTimeMs: 11.2, durationMs: 91.2 },
    { path: 'other', startTimeMs: 2, durationMs: 15 },
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret|private|other\.example/);
  for (const invalid of [Number.MAX_VALUE, Infinity, NaN, -1, '42']) {
    result.environment.benchmarkIndex = invalid;
    assert.equal(summarizeDiagnostics(result, 'http://127.0.0.1:3000').benchmarkIndex, null);
  }
  result.audits['long-tasks'].details.items = Array.from({ length: 15 }, (_, index) => ({ url: 'https://other.example/', startTime: index, duration: index }));
  const capped = summarizeDiagnostics(result, 'http://127.0.0.1:3000').longTasks;
  assert.equal(capped.length, 10);
  assert.equal(capped[0].durationMs, 14);
  assert.equal(capped.at(-1).durationMs, 5);
  assert.deepEqual(summarizeDiagnostics({}, 'http://127.0.0.1:3000').longTasks, []);
  assert.deepEqual(summarizeDiagnostics({}, 'http://127.0.0.1:3000').scripts, []);
});

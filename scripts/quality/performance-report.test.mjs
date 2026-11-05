import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuns, budgetFailures } from './performance-report.mjs';

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

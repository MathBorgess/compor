export function summarizeRuns(results) {
  if (!Array.isArray(results) || results.length < 3) throw Error('At least three completed Lighthouse runs are required.');
  const audits = {
    largestContentfulPaintMs: 'largest-contentful-paint',
    totalBlockingTimeMs: 'total-blocking-time',
    cumulativeLayoutShift: 'cumulative-layout-shift',
  };
  for (const result of results) {
    if (result.runtimeError) throw Error(`Lighthouse failed: ${result.runtimeError.code}`);
    const documents = result.audits?.['network-requests']?.details?.items?.filter(item => item.resourceType === 'Document');
    if (!documents?.some(item => item.url === result.finalDisplayedUrl && item.statusCode === 200 && item.finished === true)) throw Error('Lighthouse did not audit a successful page response.');
    if (result.audits?.['errors-in-console']?.score !== 1) throw Error('The audited page reported browser errors.');
  }
  return Object.fromEntries(Object.entries(audits).map(([name, id]) => {
    const values = results.map(result => result.audits?.[id]?.numericValue);
    if (values.some(value => !Number.isFinite(value) || value < 0)) throw Error(`Missing or invalid ${id} measurement.`);
    values.sort((a, b) => a - b);
    return [name, { median: values[Math.floor(values.length / 2)], min: values[0], max: values.at(-1) }];
  }));
}

export function budgetFailures(bundle, lighthouse, budgets) {
  const values = {
    initialJavascriptGzipBytes: bundle.initialJavascriptGzipBytes,
    totalClientJavascriptGzipBytes: bundle.totalClientJavascriptGzipBytes,
    ...Object.fromEntries(Object.entries(lighthouse).map(([name, value]) => [name, value.median])),
  };
  return Object.entries(budgets).filter(([name]) => name !== 'runs').flatMap(([name, limit]) => {
    const value = values[name];
    if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return [`${name}: missing measurement or invalid budget`];
    return value > limit ? [`${name}: ${value.toFixed(2)} exceeds ${limit}`] : [];
  });
}

// The signed-out entry may ship no external script (ADR 0034). Zero scripts passes only on the
// Compor entry markup, and every script it does load must be a local Next chunk.
export function entryScripts(html, origin) {
  if (!/<main\b[^>]*\bclass="compor-entry"/.test(html) || !/<form\b[^>]*\baction="\/auth\/sign-in"/.test(html)) throw Error('The audited route is not the Compor entry.');
  const sources = [...html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(match => (match[1] ?? match[2] ?? match[3]).replaceAll('&amp;', '&'));
  return [...new Set(sources)].map(source => {
    const url = new URL(source, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/_next/static/') || !url.pathname.endsWith('.js')) throw Error(`Unexpected initial script: ${url.pathname}`);
    return url;
  });
}

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

export function bundleBudgetFailures(bundle, budgets) {
  return budgetFailures(bundle, {}, {
    initialJavascriptGzipBytes: budgets.initialJavascriptGzipBytes,
    totalClientJavascriptGzipBytes: budgets.totalClientJavascriptGzipBytes,
  });
}

// Diagnostic only: never change a gate based on missing breakdowns. Restrict
// paths to local Next chunks so logs cannot include query strings or URLs from
// a third-party report. Lighthouse's raw reports remain available as artifacts.
export function summarizeDiagnostics(result, origin) {
  const number = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 10 ? Math.round(value * 10) / 10 : null;
  const items = id => {
    const value = result?.audits?.[id]?.details?.items;
    return Array.isArray(value) ? value : [];
  };
  const path = value => {
    try {
      const url = new URL(value);
      if (url.origin !== origin) return 'other';
      if (url.pathname === '/') return 'document';
      return /^\/_next\/static\/chunks\/[a-zA-Z0-9._-]+\.js$/.test(url.pathname) ? url.pathname : 'other';
    } catch { return 'other'; }
  };
  return {
    benchmarkIndex: number(result?.environment?.benchmarkIndex),
    totalBlockingTimeMs: number(result?.audits?.['total-blocking-time']?.numericValue),
    mainThread: items('mainthread-work-breakdown').flatMap(item =>
      typeof item?.group === 'string' && /^[a-zA-Z]+$/.test(item.group) && number(item.duration) !== null
        ? [{ group: item.group, durationMs: number(item.duration) }] : []).slice(0, 12),
    scripts: items('bootup-time').flatMap(item => {
      const totalMs = number(item?.total);
      return totalMs === null ? [] : [{ path: path(item.url), totalMs, scriptingMs: number(item.scripting), parseCompileMs: number(item.scriptParseCompile) }];
    }).slice(0, 10),
    longTasks: items('long-tasks').flatMap(item => {
      const durationMs = number(item?.duration), startTimeMs = number(item?.startTime);
      return durationMs === null || startTimeMs === null ? [] : [{ path: path(item.url), startTimeMs, durationMs }];
    }).sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
  };
}

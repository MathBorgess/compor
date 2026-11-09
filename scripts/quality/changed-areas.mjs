import { spawnSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';

export const AREAS = ['web', 'unit', 'site'];

// First matching rule wins. A path that no rule matches turns on every area.
const RULES = [
  [/^\.github\//, AREAS],
  [/^(package\.json|package-lock\.json|eslint\.config\.mjs)$/, AREAS],
  [/^(docs\/.*|[^/]+)\.md$/, []],
  // prototypes/compor-mcp/test/phoenix-calibration.test.mjs reads JSON under docs/evals.
  [/^docs\//, ['unit']],
  [/^apps\/web\//, ['web']],
  [/^apps\/site\//, ['site']],
  [/^(packages|third_party)\//, ['web', 'unit']],
  [/^scripts\/quality\//, ['web', 'unit']],
  [/^(prototypes|supabase|scripts)\//, ['unit']],
];

// The gate accepts a skipped job only when its area is off. The static job
// runs the site steps itself, so site has no job here.
export const JOB_AREAS = { unit: 'unit', web: 'web', performance: 'web' };

export function areasForPaths(paths) {
  const on = new Set();
  for (const path of paths) {
    const rule = RULES.find(([pattern]) => pattern.test(path));
    for (const area of rule ? rule[1] : AREAS) on.add(area);
  }
  return Object.fromEntries(AREAS.map(area => [area, on.has(area)]));
}

// Only a pull request, or a local run, with a known diff can turn areas off.
export function selectAreas({ event, paths }) {
  const diffable = !event || event === 'pull_request';
  return diffable && paths ? areasForPaths(paths) : Object.fromEntries(AREAS.map(area => [area, true]));
}

export function gateFailures(needs) {
  const failures = [];
  if (needs.static?.result !== 'success') failures.push(`static: ${needs.static?.result ?? 'missing'}`);
  for (const [job, area] of Object.entries(JOB_AREAS)) {
    const result = needs[job]?.result ?? 'missing';
    const areaOff = needs.static?.outputs?.[area] === 'false';
    if (result !== 'success' && !(result === 'skipped' && areaOff)) failures.push(`${job}: ${result} with ${area} ${areaOff ? 'off' : 'on'}`);
  }
  for (const [job, check] of Object.entries(needs)) {
    if (job !== 'static' && !(job in JOB_AREAS) && check.result !== 'success') failures.push(`${job}: ${check.result}`);
  }
  return failures;
}

function changedPaths(base, head) {
  if (!base || !head) return null;
  const diff = spawnSync('git', ['diff', '--name-only', '--no-renames', `${base}...${head}`], { encoding: 'utf8' });
  if (diff.status !== 0) {
    console.log(`::warning::Could not diff ${base}...${head}, so every area runs. ${diff.stderr.trim()}`);
    return null;
  }
  return diff.stdout.split('\n').filter(Boolean);
}

function main(args) {
  if (args[0] === 'gate') {
    const needs = JSON.parse(process.env.CHECKS ?? '{}');
    for (const [job, check] of Object.entries(needs)) console.log(`${job}: ${check.result}`);
    const failures = gateFailures(needs);
    for (const failure of failures) console.log(`::error::${failure}`);
    process.exitCode = failures.length ? 1 : 0;
    return;
  }
  const [base = process.env.BASE_SHA, head = process.env.HEAD_SHA] = args;
  const event = process.env.GITHUB_EVENT_NAME, paths = changedPaths(base, head);
  console.log(`Event: ${event ?? 'local'}. Changed paths: ${paths ? paths.length : 'unknown'}.`);
  const lines = Object.entries(selectAreas({ event, paths })).map(([area, on]) => `${area}=${on}`);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) main(process.argv.slice(2));

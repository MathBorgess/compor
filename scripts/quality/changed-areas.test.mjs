import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { areasForPaths, selectAreas, gateFailures } from './changed-areas.mjs';

const areas = (web, unit, site) => ({ web, unit, site });

test('documentation and root Markdown turn on no area', () => {
  assert.deepEqual(areasForPaths(['docs/adr/0031-faixa.md', 'docs/quality/gates.md', 'GLOSSARY.md', 'AGENTS.md', 'README.md', 'PRODUCT.md']), areas(false, false, false));
  assert.deepEqual(areasForPaths([]), areas(false, false, false));
});

test('each source tree turns on the areas it can affect', () => {
  assert.deepEqual(areasForPaths(['apps/web/pages/index.tsx']), areas(true, false, false));
  assert.deepEqual(areasForPaths(['apps/web/lib/phoenix/PROVENANCE.md']), areas(true, false, false));
  assert.deepEqual(areasForPaths(['.claude/skills/next-dev-loop/SKILL.md', '.agents/skills/next-dev-loop/SKILL.md', 'skills-lock.json']), areas(false, false, false));
  assert.deepEqual(areasForPaths(['.claude/settings.json']), areas(true, true, true));
  assert.deepEqual(areasForPaths(['packages/agents-api/src/index.mjs']), areas(true, true, false));
  assert.deepEqual(areasForPaths(['third_party/agile-deliberation/LICENSE']), areas(true, true, false));
  assert.deepEqual(areasForPaths(['prototypes/compor-mcp/src/stdio.ts']), areas(false, true, false));
  assert.deepEqual(areasForPaths(['supabase/migrations/20261106000017_reference_signals.sql']), areas(false, true, false));
  assert.deepEqual(areasForPaths(['scripts/tests/test_migration_workflow.py']), areas(false, true, false));
  assert.deepEqual(areasForPaths(['scripts/quality/budgets.json']), areas(true, true, false));
  assert.deepEqual(areasForPaths(['apps/site/src/pages/index.astro']), areas(false, false, true));
  assert.deepEqual(areasForPaths(['apps/site/src/pages/index.astro', 'docs/x.md', 'supabase/tests/rls.sql']), areas(false, true, true));
  assert.deepEqual(areasForPaths(['docs/evals/2026-10-29-phoenix-calibracao/result-after-unknown-sid.json']), areas(false, true, false));
  assert.deepEqual(areasForPaths(['docs/design/2026-10-23-variacoes/a.png']), areas(false, true, false));
});

test('workflow, root tooling and unknown paths turn on every area', () => {
  for (const path of ['.github/workflows/quality.yml', 'package.json', 'package-lock.json', 'eslint.config.mjs', '.gitignore', 'apps/README.md', 'docs.md/x', 'new-tool/run.mjs']) {
    assert.deepEqual(areasForPaths([path]), areas(true, true, true), path);
  }
});

test('push, manual runs and an unknown diff run every area', () => {
  assert.deepEqual(selectAreas({ event: 'push', paths: ['docs/x.md'] }), areas(true, true, true));
  assert.deepEqual(selectAreas({ event: 'workflow_dispatch', paths: ['docs/x.md'] }), areas(true, true, true));
  assert.deepEqual(selectAreas({ event: 'pull_request', paths: null }), areas(true, true, true));
  assert.deepEqual(selectAreas({ event: 'pull_request', paths: ['docs/x.md'] }), areas(false, false, false));
});

const off = { web: 'false', unit: 'false' };
const needs = (overrides = {}, outputs = off) => ({
  static: { result: 'success', outputs },
  unit: { result: 'skipped' }, web: { result: 'skipped' }, performance: { result: 'skipped' },
  ...overrides,
});

test('the gate accepts a skipped job only when its area is off', () => {
  assert.deepEqual(gateFailures(needs()), []);
  assert.deepEqual(gateFailures(needs({ web: { result: 'success' }, performance: { result: 'success' } }, { ...off, web: 'true' })), []);
  assert.equal(gateFailures(needs({ web: { result: 'success' } }, { ...off, web: 'true' })).length, 1, 'performance skipped while web is on');
  assert.equal(gateFailures(needs({}, { web: 'false' })).length, 1, 'missing unit output is not off');
  assert.equal(gateFailures(needs({}, {})).length, 3, 'missing outputs');
});

test('the gate fails on any failure, cancellation or missing job', () => {
  assert.equal(gateFailures(needs({ static: { result: 'failure', outputs: off } })).length, 1);
  assert.equal(gateFailures(needs({ unit: { result: 'failure' } })).length, 1);
  assert.equal(gateFailures(needs({ web: { result: 'cancelled' } })).length, 1);
  const withoutPerformance = needs(); delete withoutPerformance.performance;
  assert.equal(gateFailures(withoutPerformance).length, 1);
  assert.equal(gateFailures(needs({ extra: { result: 'skipped' } })).length, 1, 'a job without an area must succeed');
  assert.equal(gateFailures({}).length, 4);
});

test('the CLI diffs both sides of a rename and writes job outputs', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-changed-areas-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '--quiet');
  await mkdir(join(dir, 'apps/site'), { recursive: true });
  await writeFile(join(dir, 'apps/site/page.astro'), 'page\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  await mkdir(join(dir, 'docs'));
  git('mv', 'apps/site/page.astro', 'docs/page.md'); git('commit', '--quiet', '-m', 'move');
  const head = git('rev-parse', 'HEAD');
  const run = (env, ...args) => {
    const output = join(dir, `output-${Math.random()}`);
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'changed-areas.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...env } });
    assert.equal(result.status, 0, result.stderr);
    return readFile(output, 'utf8');
  };
  assert.equal(await run({ GITHUB_EVENT_NAME: 'pull_request', BASE_SHA: base, HEAD_SHA: head }), 'web=false\nunit=false\nsite=true\n');
  assert.equal(await run({}, base, head), 'web=false\nunit=false\nsite=true\n');
  assert.equal(await run({ GITHUB_EVENT_NAME: 'push' }), 'web=true\nunit=true\nsite=true\n');
  assert.equal(await run({ GITHUB_EVENT_NAME: 'pull_request', BASE_SHA: 'f'.repeat(40), HEAD_SHA: head }), 'web=true\nunit=true\nsite=true\n');
});

test('the gate CLI exits non-zero unless every required job passed', () => {
  const run = checks => spawnSync(process.execPath, [join(import.meta.dirname, 'changed-areas.mjs'), 'gate'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...(checks && { CHECKS: JSON.stringify(checks) }) } }).status;
  assert.equal(run(needs()), 0);
  assert.equal(run(needs({ unit: { result: 'failure' } })), 1);
  assert.equal(run(undefined), 1);
});

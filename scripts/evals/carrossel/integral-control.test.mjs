import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readCaseEvidence } from './evidence.mjs';
import { evaluate } from './evaluate.mjs';
import { integralControlSha256, runIntegralControl } from './integral-control.mjs';
import { readSuite, sha256 } from './protocol.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const revision = '720628ebc4c32b41ab8fdc0c1b1a4f8f62511a79';
const key = 'sk-local-control-offline-no-provider-credential';
const caption = 'Legenda complementar ao controle integral.';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'compor-integral-c0-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (args, cwd = repository) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const sourceRepo = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const baselineCheckout = join(root, 'baseline');
  git(['clone', '--quiet', '--shared', '--no-checkout', sourceRepo, baselineCheckout]);
  git(['checkout', '--quiet', '--detach', revision], baselineCheckout);
  const cases = Array.from({ length: 6 }, (_, index) => ({
    id: 'publico-' + index, mode: 'editorial_art', briefing: 'Canário público ' + index,
    facts: ['Material confirmado ' + index], expected: 'deliver_deck', strata: ['controle'],
    ...(index === 0 ? { exactSlideCount: 3 } : {}),
  }));
  const raw = JSON.stringify({ version: 1, split: 'holdout', cases });
  const suitePath = join(root, 'fake-holdout.json');
  await writeFile(suitePath, raw);
  const suiteSha256 = sha256(raw);
  const suite = await readSuite(suitePath, 'holdout', suiteSha256);
  return { root, baselineCheckout, suitePath, suiteSha256, testCase: suite.cases[0] };
}

async function provider({ rejectImage, rejectPlan } = {}) {
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 1024, height: 1280, channels: 3, background: '#27573e' } }).png().toBuffer();
  const calls = { plans: [], images: [], reads: 0 };
  let answer;
  const fetchApi = async (target, options) => {
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer ' + key);
    const { pathname } = new URL(target);
    if (options.method === 'POST' && pathname === '/v1/agents/sessions') {
      const body = JSON.parse(options.body);
      const input = JSON.parse(body.input);
      calls.plans.push({ ...input, instructions: body.agent.instructions, model: body.agent.model });
      if (rejectPlan) return Response.json({}, { status: rejectPlan });
      answer = JSON.stringify({
        visualInvariants: 'Mesma luz',
        caption,
        frames: Array.from({ length: input.expectedFrames }, (_, index) => ({
          position: index + 1, role: 'Demonstração', headline: 'Controle integral', body: '',
          prompt: 'Arte em que a legenda é externa à imagem.', factIds: [],
        })),
      });
      return Response.json({ id: 'sess_integral_mock' }, { status: 201, headers: { 'x-request-id': 'req_integral_mock' } });
    }
    if (options.method === 'GET') {
      calls.reads += 1;
      if (pathname.endsWith('/turns')) return Response.json({ data: [
        { id: 'turn_integral_mock', session_id: 'sess_integral_mock', subagent_id: null, status: 'completed' },
      ] });
      if (pathname.endsWith('/items')) return Response.json({ data: [{
        type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer',
        turn_id: 'turn_integral_mock', content: [{ type: 'output_text', text: answer }],
      }] });
      return Response.json({ id: 'sess_integral_mock', status: 'idle' });
    }
    assert.ok(pathname === '/v1/images/generations' || pathname === '/v1/images/edits');
    const anchor = options.body instanceof FormData ? options.body.get('image[]') : null;
    calls.images.push({ pathname, anchor: anchor ? Buffer.from(await anchor.arrayBuffer()) : null });
    if (rejectImage === calls.images.length) return Response.json({}, { status: 503 });
    return Response.json({ data: [{ b64_json: png.toString('base64') }] }, { headers: { 'x-request-id': 'req_img_mock' } });
  };
  return { fetchApi, calls, png };
}

test('C0 recompõe a prova a partir dos PNGs integrais do pin e liga a comparação selada', async t => {
  const { testCase, ...options } = await fixture(t);
  const control = await provider();
  const params = { ...options, caseId: testCase.id, fetchApi: control.fetchApi };
  const preflight = await runIntegralControl({ ...params, preflightOnly: true });
  assert.equal(preflight.revision, revision);
  assert.equal(preflight.maximumPlannerSessions, 1);
  assert.equal(preflight.maximumImages, 3);
  assert.equal((await runIntegralControl({ ...params, caseId: 'publico-1', preflightOnly: true })).maximumImages, 4);
  await assert.rejects(runIntegralControl({ ...params, preflightOnly: true, suiteSha256: 'a'.repeat(64) }), /SHA-256/);
  await writeFile(join(options.baselineCheckout, 'dirty.txt'), 'canário');
  await assert.rejects(runIntegralControl({ ...params, preflightOnly: true }), /checkout limpo/);
  await rm(join(options.baselineCheckout, 'dirty.txt'));
  assert.deepEqual(control.calls, { plans: [], images: [], reads: 0 });

  const delivered = await runIntegralControl({ ...params, key });
  const { caseDirectory } = delivered;
  assert.equal(delivered.state, 'delivered');
  assert.equal(control.calls.plans.length, 1);
  assert.equal(control.calls.plans[0].model, 'gpt-6.1-terra');
  assert.equal(control.calls.plans[0].expectedFrames, 3);
  assert.equal(control.calls.plans[0].idea, testCase.briefing);
  assert.equal(control.calls.plans[0].offerFacts[0].value, testCase.facts[0]);
  assert.match(control.calls.plans[0].instructions, /Capa Âncora visual/);
  assert.deepEqual(control.calls.images.map(row => row.pathname), ['/v1/images/generations', '/v1/images/edits', '/v1/images/edits']);
  assert.equal(control.calls.images[0].anchor, null);
  assert.ok(control.calls.images[1].anchor.equals(control.png) && control.calls.images[2].anchor.equals(control.png));
  assert.ok((await readFile(join(caseDirectory, 'first-pass/frame-1.png'))).equals(control.png));
  assert.equal(await readFile(join(caseDirectory, 'first-pass/legenda.txt'), 'utf8'), caption + '\n');
  const alternative = JSON.parse(await readFile(options.suitePath, 'utf8'));
  alternative.cases[1].briefing = 'Outro briefing da mesma posição.';
  const changedSuite = JSON.stringify(alternative);
  const changedPath = join(options.root, 'changed-holdout.json');
  await writeFile(changedPath, changedSuite);
  await assert.rejects(runIntegralControl({ ...params, key, caseId: 'publico-1', suitePath: changedPath,
    suiteSha256: sha256(changedSuite) }), /partição congelada/);
  assert.equal(control.calls.plans.length, 1);

  const expectation = { cycle: 0, suiteSha256: options.suiteSha256, candidateSha256: integralControlSha256, controlOnly: true };
  const evidence = () => readCaseEvidence(caseDirectory, testCase, expectation);
  const observed = await evidence();
  assert.equal(observed.execution.status, 'pass');
  assert.equal(observed.final.assetsVerified, true);
  assert.equal(observed.final.judgeInput.captionSha256, sha256(caption + '\n'));
  assert.equal(observed.final.cqs, null);
  assert.equal(observed.final.staged.physical.complete, false);
  const baseline = await evaluate({ cycle: 0, tests: [testCase], evidenceRoot: join(options.root, 'c0'),
    references: new Map(), controlOnly: true, suiteDigests: { holdout: options.suiteSha256 }, candidateSha256: integralControlSha256 });
  assert.equal(baseline.cases[0].manifestSha256, observed.digest);

  const candidateRoot = join(options.root, 'c4');
  const candidateDirectory = join(candidateRoot, testCase.id);
  await cp(caseDirectory, candidateDirectory, { recursive: true });
  const manifestFile = join(candidateDirectory, 'qa-manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const receipt = JSON.parse(await readFile(caseDirectory + '.live-receipt.json', 'utf8'));
  Object.assign(manifest.execution, { cycle: 4, controlOnly: false, candidateSha256: 'd'.repeat(64) });
  manifest.pairwise = [{ againstCycle: 0, candidateFirst: 'first', controlFirst: 'second',
    controlManifestSha256: observed.digest, evaluator: 'test', evidence: 'Dupla ordenação simulada.' }];
  await writeFile(manifestFile, JSON.stringify(manifest));
  await writeFile(candidateDirectory + '.live-receipt.json', JSON.stringify({ ...receipt, ...manifest.execution }));
  const comparison = await evaluate({ cycle: 4, tests: [testCase], evidenceRoot: candidateRoot,
    references: new Map([[0, baseline]]), controlOnly: false, suiteDigests: { holdout: options.suiteSha256 },
    candidateSha256: manifest.execution.candidateSha256 });
  assert.equal(comparison.comparisons[0].win, 1);

  assert.equal((await readCaseEvidence(caseDirectory, { ...testCase, briefing: 'Outro briefing' }, expectation)).execution.status, 'fail');
  const realManifestFile = join(caseDirectory, 'qa-manifest.json');
  const realManifest = JSON.parse(await readFile(realManifestFile, 'utf8'));
  const adapted = realManifest.final.artifacts.find(item => item.file === 'first-pass/slide-01.jpg');
  const jpeg = await readFile(join(caseDirectory, 'first-pass/slide-02.jpg'));
  const changed = Buffer.from(jpeg);
  changed[changed.length - 1] ^= 1;
  await writeFile(join(caseDirectory, adapted.file), changed);
  for (const shot of [realManifest.first_pass, realManifest.final]) {
    shot.artifacts.find(item => item.file === adapted.file).sha256 = sha256(changed);
  }
  await writeFile(realManifestFile, JSON.stringify(realManifest));
  await assert.rejects(evidence(), /JPEG comparado diverge/);
});

test('uma imagem incerta retém a trava e impede a submissão de outras lâminas', async t => {
  const { testCase, ...options } = await fixture(t);
  const control = await provider({ rejectImage: 2 });
  const params = { ...options, caseId: testCase.id, key, fetchApi: control.fetchApi };
  const result = await runIntegralControl(params);
  assert.equal(result.state, 'unknown');
  assert.equal(control.calls.plans.length, 1);
  assert.deepEqual(control.calls.images.map(row => row.pathname), ['/v1/images/generations', '/v1/images/edits']);
  const lock = JSON.parse(await readFile(join(options.root, 'paid-active.json'), 'utf8'));
  assert.equal(lock.caseId, testCase.id);
  await assert.rejects(runIntegralControl({ ...params, caseId: 'publico-1' }), /aguarda reconciliação/);
});

test('planejamento com falha de transporte mantém a trava mesmo quando o runner antigo marca falha', async t => {
  const { testCase, ...options } = await fixture(t);
  const control = await provider({ rejectPlan: 503 });
  const result = await runIntegralControl({ ...options, caseId: testCase.id, key, fetchApi: control.fetchApi });
  assert.equal(result.state, 'unknown');
  assert.equal(control.calls.plans.length, 1);
  assert.equal(control.calls.images.length, 0);
  assert.equal(JSON.parse(await readFile(join(options.root, 'paid-active.json'), 'utf8')).caseId, testCase.id);
});

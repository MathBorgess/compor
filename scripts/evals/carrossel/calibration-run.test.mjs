import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runJudgeCalibration } from './calibration-run.mjs';
import { judgeDeckHash, judgeModel, judgeRubricSha256 } from './judge-evidence.mjs';
import { judgeWeights, sha256 } from './protocol.mjs';

const fakeKey = 'sk-local-synthetic-calibration-fixture';
const jpeg = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAaI//2Q==', 'base64');
const evidence = 'Observação do transporte simulado.';
const dimensions = Object.keys(judgeWeights);
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));

async function writeJson(root, name, data) {
  const bytes = JSON.stringify(data);
  await writeFile(join(root, name), bytes);
  return sha256(bytes);
}

async function inputSide(directory, id, side, withDefect) {
  const root = join(directory, id, side);
  await mkdir(root, { recursive: true });
  const hashes = [];
  for (const index of [1, 2]) {
    const comment = Buffer.from(`${id}/${side}/${index}`);
    const jpegComment = Buffer.from([0xff, 0xfe, 0, comment.length + 2]);
    const bytes = Buffer.concat([jpeg.subarray(0, 2), jpegComment, comment, jpeg.subarray(2)]);
    await writeFile(join(root, `slide-0${index}.jpg`), bytes);
    hashes.push(sha256(bytes));
  }
  const caption = side === 'baseline' ? 'Legenda com acento e newline.\n' : '';
  await writeFile(join(root, 'legenda.txt'), caption);
  return {
    deckSha256: judgeDeckHash(hashes), captionSha256: sha256(caption),
    scores: Object.fromEntries(dimensions.map(dimension => [dimension, withDefect && dimension === 'reentry' ? 2 : 4])),
    criticalDefects: withDefect ? [{ slide: 2, dimension: 'reentry', evidence }] : [],
  };
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'compor-judge-run-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cases = [];
  for (let index = 0; index < 6; index += 1) {
    const id = 'calibration-run-' + index;
    cases.push({
      id, briefing: 'Canário sintético de calibração ' + index, facts: [], winner: index < 2 ? 'candidate' : 'tie',
      reason: evidence, baseline: await inputSide(directory, id, 'baseline', index < 2),
      candidate: await inputSide(directory, id, 'candidate', false),
    });
  }
  const truthSha256 = await writeJson(directory, 'reference-labels.json', {
    version: 1, split: 'judge-calibration', reference: { kind: 'independent_rubric', reviewerId: 'mock-reviewer', source: evidence }, cases,
  });
  return { directory, truthSha256, cases };
}

function transport({ failOrder } = {}) {
  const calls = [];
  const fetchApi = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/agents/sessions');
    assert.equal(options.method, 'POST');
    const { output, order } = JSON.parse(options.body);
    calls.push({ output, order });
    return new Response(null, { status: order === failOrder ? 503 : 201 });
  };
  const runPair = async ({ key, root, output, expectedInput, baseline, candidate, briefing, fetchApi: provider }) => {
    assert.equal(provider, fetchApi);
    assert.equal(key, fakeKey);
    assert.equal(sha256(briefing), expectedInput.briefingSha256);
    assert.equal(sha256(baseline.caption), expectedInput.baselineCaptionSha256);
    assert.equal(sha256(candidate.caption), expectedInput.candidateCaptionSha256);
    const input = expectedInput;
    const identity = { model: judgeModel, rubricSha256: judgeRubricSha256, input };
    const orders = [];
    for (const order of ['ab', 'ba']) {
      const response = await provider('https://api.openai.com/v1/agents/sessions', {
        method: 'POST', body: JSON.stringify({ output, order }),
      });
      const name = `${output}-${order}.receipt.json`;
      if (!response.ok) {
        await writeJson(root, name, { ...identity, state: 'unknown', order, httpStatus: response.status });
        return;
      }
      const side = { defects: [], scores: Object.fromEntries(dimensions.map(dimension => [dimension, { value: 4, evidence }])) };
      const answer = { A: side, B: side, winner: 'tie', reason: evidence };
      const receiptSha256 = await writeJson(root, name, {
        ...identity, state: 'completed', order, httpStatus: response.status,
        sessionId: 'sess_' + output + '-' + order, turnId: 'turn_' + output + '-' + order, output: answer,
      });
      orders.push({ state: 'completed', receiptSha256, output: answer });
    }
    await writeJson(root, output + '.pair.json', {
      version: 1, ...identity, forward: orders[0], reverse: orders[1], results: ['tie', 'tie'],
    });
  };
  return { calls, fetchApi, runPair };
}

test('CLI pré-verifica os 12 pares sem credencial, rede ou observations.json', async t => {
  const { directory, truthSha256 } = await fixture(t);
  const args = [cli, 'calibration-run', '--bundle', directory, '--truth-sha256', truthSha256];
  const run = extra => promisify(execFile)(process.execPath, [...args, ...extra], { env: { PATH: process.env.PATH } });
  const preview = JSON.parse((await run(['--max-new-pairs', '1'])).stdout);
  assert.equal(preview.status, 'preflight');
  assert.equal(preview.targetPairs, 12);
  assert.equal(preview.maxNewSessions, 2);
  await assert.rejects(run(['--execute']), error => error.code === 1 && /--max-new-pairs/.test(error.stderr));
  await assert.rejects(run(['--execute', '--max-new-pairs', '1']), error => error.code === 1 && /Credencial/.test(error.stderr));
  await assert.rejects(readFile(join(directory, 'observations.json')), { code: 'ENOENT' });
});

test('o teto conta somente pares novos e observações completas são materializadas uma vez', async t => {
  const { directory, truthSha256 } = await fixture(t);
  const { calls, fetchApi, runPair } = transport();
  const options = { directory, truthSha256, execute: true, key: fakeKey, fetchApi, runPair };
  const canary = await runJudgeCalibration({ ...options, maxNewPairs: 1 });
  assert.equal(canary.status, 'pending');
  assert.equal(canary.completedPairs, 1);
  assert.equal(canary.pendingPairs, 11);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.output), ['calibration-run-0-r1', 'calibration-run-0-r1']);
  await assert.rejects(readFile(join(directory, 'observations.json')), { code: 'ENOENT' });

  const full = await runJudgeCalibration({ ...options, maxNewPairs: 11 });
  assert.equal(full.status, 'complete');
  assert.equal(full.observationsWritten, true);
  assert.equal(full.completedPairs, 12);
  assert.equal(calls.length, 24);
  assert.equal(calls[2].output, 'calibration-run-0-r2');
  const bytes = await readFile(join(directory, 'observations.json'));
  const observations = JSON.parse(bytes);
  assert.equal(observations.truthSha256, truthSha256);
  assert.equal(observations.cases.length, 6);
  assert.ok(observations.cases.every(item => item.pairs.length === 2));
  const replay = await runJudgeCalibration({ ...options, key: undefined, maxNewPairs: 12 });
  assert.equal(replay.status, 'complete');
  assert.equal(replay.newPairs, 0);
  assert.equal(replay.observationsWritten, false);
  assert.deepEqual(await readFile(join(directory, 'observations.json')), bytes);
  assert.equal(calls.length, 24);
});

test('resposta incerta deixa os recibos preservados e impede qualquer envio na retomada', async t => {
  const { directory, truthSha256 } = await fixture(t);
  const { calls, fetchApi, runPair } = transport({ failOrder: 'ba' });
  const options = { directory, truthSha256, execute: true, maxNewPairs: 2, key: fakeKey, fetchApi, runPair };
  await assert.rejects(runJudgeCalibration(options), /recibo parcial/);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(await readFile(join(directory, 'calibration-run-0-r1-ba.receipt.json'))).state, 'unknown');
  await assert.rejects(runJudgeCalibration(options), /recibo parcial/);
  assert.equal(calls.length, 2);
  await assert.rejects(readFile(join(directory, 'observations.json')), { code: 'ENOENT' });
});

test('um recibo parcial no último caso e insumos adulterados impedem novos envios', async t => {
  const partial = await fixture(t);
  const missing = await fixture(t);
  const { calls, fetchApi, runPair } = transport();
  const options = { execute: true, maxNewPairs: 1, key: fakeKey, fetchApi, runPair };
  await writeJson(partial.directory, 'calibration-run-5-r2-ab.receipt.json', { state: 'submitted' });
  await assert.rejects(runJudgeCalibration({ ...options, ...partial }), /run-5-r2 tem recibo parcial/);
  await assert.rejects(runJudgeCalibration({ ...options, ...missing, truthSha256: sha256('incorreto') }), /rótulos de referência diverge/);
  const base = join(missing.directory, 'calibration-run-0', 'baseline');
  await writeFile(join(base, 'legenda.txt'), 'Alterada.');
  await assert.rejects(runJudgeCalibration({ ...options, ...missing }), /SHA-256 da legenda diverge/);
  await writeFile(join(base, 'legenda.txt'), 'Legenda com acento e newline.\n');
  await writeFile(join(base, 'slide-01.jpg'), jpeg);
  await assert.rejects(runJudgeCalibration({ ...options, ...missing }), /SHA-256 das lâminas diverge/);
  assert.deepEqual(calls, []);
});

import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectCalibrationDiagrams } from './calibration-diagrams.mjs';
import { sha256 } from './protocol.mjs';

const slideId = 'retalho';
const decision = { slot: 'body', quote: 'A sombra deve cair fora do próximo furo.' };
const panels = [
  { label: 'Furo encoberto', item: 'Sombra no furo' },
  { label: 'Furo visível', item: 'Sombra ao lado' },
];
const expected = { slideId, decision, panels };
const target = { caseId: 'retalho-01', side: 'B', slideId };

function plan({ relations = panels, body = `Faça três pontos. ${decision.quote}`, type = 'category_split' } = {}) {
  const diagram = type === 'category_split'
    ? { type, labels: relations.map(panel => panel.label), items: relations.map(panel => panel.item) }
    : { type, labels: ['Em pé', 'De cabeça para baixo'], sample: 'Seu texto' };
  return { mode: 'editorial_art', slides: [
    { id: 'capa', layout: 'hero_bleed', headline: 'Ilumine o bordado', alt: 'Capa da oficina.' },
    { id: slideId, layout: 'comparison_dual', headline: 'Observe a sombra', alt: 'Teste da sombra.', body, diagram },
    { id: 'fecho', layout: 'cta_closing', headline: 'Salve para praticar', alt: 'Fecho com convite para salvar.' },
  ] };
}

async function fixture(t, sidePlans) {
  const directory = await mkdtemp(join(tmpdir(), 'compor-diagram-preflight-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const write = async (file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(join(directory, file), bytes, { mode: 0o600 });
    return sha256(bytes);
  };
  const sides = {};
  for (const [side, value] of Object.entries(sidePlans)) {
    const file = `${side}.json`;
    sides[side] = { plan: { file, sha256: await write(file, value) }, slides: [structuredClone(expected)] };
  }
  const bundle = { version: 1, cases: [{ id: target.caseId, sides }] };
  const options = async extras => ({
    directory, bundleSha256: await write('diagram-preflight.json', bundle), ...extras,
  });
  return { bundle, sides, options, write, directory };
}

test('preflight optativo distingue relações sem expectativa de relações verificadas', async t => {
  assert.deepEqual(await inspectCalibrationDiagrams(), { status: 'unchecked', checks: [] });
  const files = await fixture(t, { A: plan(), B: plan() });
  files.sides.A.slides = [];
  files.sides.B.slides = [];
  const unchecked = await inspectCalibrationDiagrams(await files.options());
  assert.equal(unchecked.status, 'unchecked');
  assert.deepEqual(unchecked.checks.map(check => check.status), ['unchecked', 'unchecked']);
  files.sides.B.slides = [expected];
  const mixed = await inspectCalibrationDiagrams(await files.options());
  assert.equal(mixed.status, 'pass');
  assert.deepEqual(mixed.checks.map(check => [check.status, check.planSha256]), [
    ['unchecked', files.sides.A.plan.sha256], ['pass', files.sides.B.plan.sha256],
  ]);
});

test('painéis podem trocar de ordem como pares; normalização NFC preserva a decisão aprovada', async t => {
  const reordered = panels.toReversed().map(panel => ({ label: panel.label.normalize('NFD'), item: panel.item }));
  const files = await fixture(t, { A: plan(), B: plan({ relations: reordered, body: decision.quote.normalize('NFD') }) });
  const result = await inspectCalibrationDiagrams(await files.options());
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.checks.map(check => check.status), ['pass', 'pass']);
});

test('divergência de relação plantada só é aceita no caso, lado e lâmina autorizados', async t => {
  const crossed = panels.map((panel, index) => ({ ...panel, item: panels[1 - index].item }));
  const files = await fixture(t, { A: plan({ relations: crossed }), B: plan({ relations: crossed }) });
  const actual = await inspectCalibrationDiagrams(await files.options({ expectedMismatches: [target] }));
  assert.equal(actual.status, 'fail');
  assert.deepEqual(actual.checks.map(check => [check.side, check.status, check.reason]), [
    ['A', 'fail', 'panel_relation_mismatch'], ['B', 'expected_mismatch', undefined],
  ]);
  files.sides.A.plan.sha256 = await files.write(files.sides.A.plan.file, plan());
  const approved = await inspectCalibrationDiagrams(await files.options({ expectedMismatches: [target] }));
  assert.equal(approved.status, 'pass');
  assert.deepEqual(approved.checks.map(check => check.status), ['pass', 'expected_mismatch']);
  files.sides.B.slides = [];
  const outside = await inspectCalibrationDiagrams(await files.options({ expectedMismatches: [target] }));
  assert.equal(outside.status, 'fail');
  assert.deepEqual(outside.checks.map(check => check.reason), [undefined, undefined, 'expected_mismatch_outside_expectations']);
});

test('exceção plantada exige divergência observada e a decisão literal preservada', async t => {
  const files = await fixture(t, { B: plan() });
  const run = async () => inspectCalibrationDiagrams(await files.options({ expectedMismatches: [target] }));
  assert.equal((await run()).checks[0].reason, 'expected_mismatch_missing');
  const relations = [panels[0], { ...panels[1], item: 'Sai do bastidor' }];
  files.sides.B.plan.sha256 = await files.write(files.sides.B.plan.file, plan({ relations, body: 'Faça três pontos.' }));
  assert.equal((await run()).checks[0].reason, 'decision_not_found');
  files.sides.B.plan.sha256 = await files.write(files.sides.B.plan.file, plan({ relations }));
  assert.equal((await run()).checks[0].status, 'expected_mismatch');
});

test('bundle, plano e escopo são estritos e o SHA-256 fixa os dois arquivos', async t => {
  const files = await fixture(t, { A: plan() });
  const options = await files.options();
  await assert.rejects(inspectCalibrationDiagrams({ ...options, bundleSha256: '0'.repeat(64) }), /SHA-256 divergente/);
  await assert.rejects(inspectCalibrationDiagrams({ ...options, expectedMismatches: [target, target] }), /Alvo.*repetido/);
  await assert.rejects(inspectCalibrationDiagrams({ ...options, expectedMismatches: [{ ...target, side: '*' }] }), /Alvo.*inválido/);
  const pinned = files.sides.A.plan.sha256;
  files.sides.A.plan.sha256 = '0'.repeat(64);
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /SHA-256 divergente/);
  files.sides.A.plan.sha256 = pinned;
  files.sides.A.slides.push(expected);
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /Expectativas.*repetidas/);
  files.sides.A.slides = [{ ...expected, ignoreFailure: true }];
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /Expectativa inválida/);
  files.sides.A.slides = [expected];
  files.bundle.cases.push(structuredClone(files.bundle.cases[0]));
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /Caso ou lado inválido/);
});

test('resoluções redirecionadas, travessia e arquivos fora do limite são recusados', async t => {
  const files = await fixture(t, { A: plan() });
  const original = files.sides.A.plan.file;
  await symlink(join(files.directory, original), join(files.directory, 'link.json'));
  for (const file of ['../A.json', join(files.directory, original), 'link.json']) {
    files.sides.A.plan.file = file;
    await assert.rejects(inspectCalibrationDiagrams(await files.options()), /Expectativa inválida|sem redirecionamento/);
  }
  files.sides.A.plan.file = original;
  files.sides.A.plan.sha256 = await files.write(original, 'a'.repeat(32 * 1024));
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /grande demais/);
});

test('o contrato não verifica comparações de orientação', async t => {
  const files = await fixture(t, { A: plan({ type: 'orientation' }) });
  await assert.rejects(inspectCalibrationDiagrams(await files.options()), /não corresponde a um category_split/);
  files.sides.A.slides = [];
  const result = await inspectCalibrationDiagrams(await files.options());
  assert.equal(result.status, 'unchecked');
  assert.deepEqual(result.checks, []);
});

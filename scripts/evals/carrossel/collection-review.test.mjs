import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readCaseEvidence } from './evidence.mjs';
import { judgeBriefing, judgeDeckHash } from './judge-evidence.mjs';
import { stripScaffold } from './novelty.mjs';
import { collectionWeights, judgeWeights, requiredChecks, sha256 } from './protocol.mjs';

const note = 'O parecer identifica a função das lâminas pela revisão dos quadros.';
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const testPlan = [
  { id: 'capa', layout: 'hero_bleed', headline: 'Uma oficina em formato de roteiro' },
  { id: 'a', layout: 'comparison_dual', headline: 'Separe pressão e volume', diagram: { type: 'type_scale', sample: 'Amostra', labels: ['Pequeno', 'Grande'] } },
  { id: 'b', layout: 'comparison_dual', headline: 'Demonstre o ciclo da água', diagram: { type: 'contrast', sample: 'Exemplo', labels: ['Baixo', 'Alto'] } },
  { id: 'c', layout: 'native_serial', headline: 'Teste cabos frouxos no corredor' },
  { id: 'd', layout: 'cta_closing', headline: 'Salve as notas da oficina' },
];

async function fixture(t, { mode = 'editorial_art', media = [0, 0.22, 0.21, 0, 0], sameDiagram = false, matrix = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'compor-collection-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, 'first-pass');
  await mkdir(first);
  const testCase = { id: 'colecao-dev', mode, split: 'dev', facts: [], briefing: 'Reúna práticas de uma oficina.' };
  const slides = mode === 'native_serial'
    ? testPlan.map(({ id, headline }, index) => ({
      id, headline, layout: index === testPlan.length - 1 ? 'cta_closing' : 'native_serial',
    }))
    : structuredClone(testPlan);
  if (matrix) slides[1].diagram = { type: 'readability_matrix' };
  if (sameDiagram) {
    const { type, sample, labels } = slides[1].diagram;
    slides[2].diagram = { labels, sample, type };
  }
  const plan = { mode, slides, caption: 'Uma legenda do caso.' };
  const planBytes = serialize(plan);
  const planSha256 = sha256(planBytes);
  const artifacts = [];

  const add = async (name, bytes) => {
    await writeFile(join(first, name), bytes);
    const artifact = { file: 'first-pass/' + name, sha256: sha256(bytes) };
    artifacts.push(artifact);
    return artifact.sha256;
  };
  await add('plan.json', planBytes);
  const contactSheetSha256 = await add('contact-sheet.png', 'folha de contato');
  await add('cover-grid.png', 'recorte da capa');
  const rendered = await Promise.all(slides.map(async (slide, i) => {
    const file = 'slide-' + String(i + 1).padStart(2, '0') + '.jpg';
    return { id: slide.id, index: i + 1, file, sha256: await add(file, 'jpeg observado ' + slide.id), artAreaFraction: media[i] };
  }));
  const renderChecksSha256 = await add('render-checks.json', serialize({
    slides: rendered, artifacts: [{ file: 'contact-sheet.png', sha256: contactSheetSha256 }],
  }));
  const checks = Object.fromEntries(Object.values(requiredChecks).flat().map(name => [name, { status: 'pass', evidence: note }]));
  checks.ART_PURITY = { status: 'not_applicable', evidence: 'Sem raster separado.' };
  const snapshot = {
    outcome: 'delivered', artSheetApplicable: false, slideCount: slides.length, inputSha256: planSha256, artifacts, checks,
    collectionScores: Object.fromEntries(Object.keys(collectionWeights).map(name => [name, { score: 100, evidence: note }])),
    ddr: 0.99, migMean: 0.99,
    judgeScores: Object.fromEntries(Object.keys(judgeWeights).map(name => [name, { score: 4, evidence: note, evaluator: 'teste' }])),
  };
  const manifest = { version: 1, caseId: testCase.id, mode, repair_count: 0, repairs: [], first_pass: snapshot, final: snapshot };
  const manifestBytes = serialize(manifest);
  await writeFile(join(directory, 'qa-manifest.json'), manifestBytes);
  const novelty = {
    model: 'text-embedding-3-small', inputSha256: planSha256,
    slides: slides.slice(0, 4).map((slide, index) => ({
      id: slide.id, textSha256: sha256(stripScaffold(slide.headline)), gain: [0.75, 1, 0.69, 0.75][index],
      cognitiveOperation: slide.id, evidence: note,
      embedding: Array.from({ length: 4 }, (_, j) => j === index ? 1 : 0),
    })),
  };
  const collection = {
    version: 1, scope: 'collection', mode, planSha256, renderChecksSha256, contactSheetSha256,
    deckSha256: judgeDeckHash(rendered.map(item => item.sha256)), briefingSha256: sha256(judgeBriefing(testCase)), noveltySha256: null,
    reviewer: { method: 'human', identity: 'revisor de teste' },
    scores: Object.fromEntries(Object.keys(collectionWeights).map((name, index) => [name,
      { status: 'observed', score: [92, 85, 88, 81][index], evidence: note, slides: [1, 2, 3, 4] }])),
    slides: rendered.map(({ id, index, sha256: digest, artAreaFraction }) => ({
      id, index, sha256: digest, visual: artAreaFraction ? 'novel' : 'none', evidence: note,
    })),
  };
  const attach = async ({ withNovelty = false } = {}) => {
    const input = { version: 1, manifestSha256: sha256(manifestBytes), final: {} };
    if (withNovelty) {
      const bytes = serialize(novelty);
      const file = 'novelty-final.json';
      await writeFile(join(directory, file), bytes);
      collection.noveltySha256 = sha256(bytes);
      input.final.noveltyEvidence = { file, sha256: collection.noveltySha256 };
    }
    const bytes = serialize(collection);
    const file = 'collection-final.json';
    await writeFile(join(directory, file), bytes);
    input.final.collectionEvidence = { file, sha256: sha256(bytes) };
    await writeFile(join(directory, 'qa-assessments.json'), serialize(input));
  };
  return { attach, collection, novelty, read: async () => (await readCaseEvidence(directory, testCase)).final };
}

test('liga as quatro notas, cobertura visível, MIG e DDR ao JPEG e ao snapshot', async t => {
  const sample = await fixture(t);
  await sample.attach({ withNovelty: true });
  const result = await sample.read();
  assert.equal(result.collectionEvidence.status, 'verified');
  assert.ok(Math.abs(result.sCol - 86.85) < 1e-10);
  assert.ok(Math.abs(result.cqs - 87.055) < 1e-10);
  assert.equal(result.collectionEvidence.vac, 2 / 5);
  assert.deepEqual(result.collectionEvidence.ddr, { applicable: true, eligible: 3, observed: 3, dual: 1, value: 1 / 3 });
  assert.equal(result.ddr, 1 / 3);
  assert.equal(result.migMean, (0.75 + 1 + 0.69 + 0.75) / 4);
  assert.deepEqual(result.collectionEvidence.legacy, { sCol: 100, ddr: 0.99 });
});

test('recebe a série nativa sem mídia como cobertura observada e mantém a métrica fora do piso editorial', async t => {
  const sample = await fixture(t, { mode: 'native_serial', media: [0, 0, 0, 0, 0] });
  await sample.attach();
  const result = await sample.read();
  assert.equal(result.collectionEvidence.status, 'verified');
  assert.ok(Math.abs(result.sCol - 86.85) < 1e-10);
  assert.equal(result.collectionEvidence.vac, 0);
  assert.deepEqual(result.collectionEvidence.ddr, { applicable: false, eligible: 3, observed: 3, dual: 0, value: 0 });
  assert.equal(result.ddr, 0);
});

test('distingue cobertura da matriz nativa de ganho sem aplicar o piso editorial', async t => {
  const sample = await fixture(t, { mode: 'native_serial', matrix: true, media: [0, 0.26, 0, 0, 0] });
  await sample.attach();
  assert.equal((await sample.read()).collectionEvidence.ddr.value, null);
  await sample.attach({ withNovelty: true });
  const result = await sample.read();
  assert.equal(result.collectionEvidence.vac, 1 / 5);
  assert.deepEqual(result.collectionEvidence.ddr, { applicable: false, eligible: 3, observed: 3, dual: 1, value: 1 / 3 });
});

test('preserva notas antigas como diagnóstico e registra lacunas do parecer sem completar por inferência', async t => {
  const sample = await fixture(t);
  const legacy = await sample.read();
  assert.equal(legacy.sCol, 100);
  assert.equal(legacy.ddr, 0.99);
  assert.equal(legacy.collectionEvidence.status, 'unavailable');
  sample.collection.scores.cohesion = { status: 'unknown', evidence: 'Faltou consistência da observação.', slides: [] };
  sample.collection.slides[1].visual = 'unknown';
  await sample.attach({ withNovelty: true });
  const result = await sample.read();
  assert.equal(result.collectionEvidence.status, 'unavailable');
  assert.deepEqual(result.collectionEvidence.unavailable, ['cohesion']);
  assert.equal(result.sCol, null);
  assert.equal(result.cqs, null);
  assert.equal(result.ddr, null);
  assert.equal(result.collectionEvidence.ddr.observed, 2);
  assert.deepEqual(result.collectionEvidence.legacy, { sCol: 100, ddr: 0.99 });
});

test('mantém DDR desconhecido quando a mídia inédita não tem MIG vinculado', async t => {
  const sample = await fixture(t);
  await sample.attach();
  const result = await sample.read();
  assert.equal(result.collectionEvidence.status, 'verified');
  assert.equal(result.collectionEvidence.ddr.value, null);
  assert.equal(result.collectionEvidence.ddr.observed, 1);
});

test('recusa observações desvinculadas do briefing ou do JPEG', async t => {
  const sample = await fixture(t);
  const briefing = sample.collection.briefingSha256;
  sample.collection.briefingSha256 = 'a'.repeat(64);
  await sample.attach();
  await assert.rejects(sample.read(), /diverge dos hashes/);
  sample.collection.briefingSha256 = briefing;
  sample.collection.slides[0].sha256 = 'b'.repeat(64);
  await sample.attach();
  await assert.rejects(sample.read(), /diverge de uma lâmina renderizada/);
});

test('recusa mídia repetida como inédita e nota numérica com estado desconhecido', async t => {
  const sample = await fixture(t, { sameDiagram: true });
  await sample.attach();
  await assert.rejects(sample.read(), /mídia visível foi registrada como inédita/);
  sample.collection.slides[2].visual = 'reused';
  sample.collection.scores.cohesion.status = 'unknown';
  await sample.attach();
  await assert.rejects(sample.read(), /Nota de coleção sem observação/);
});

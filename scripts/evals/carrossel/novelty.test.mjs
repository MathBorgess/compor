import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './protocol.mjs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { measureNovelty, reviewNovelty, stripScaffold } from './novelty.mjs';

test('remove marcadores em cada linha e exclui recap e CTA da comparação', () => {
  assert.equal(stripScaffold('Regra 2: Ilumine a cena\nFato: O fundo muda'), 'Ilumine a cena\nO fundo muda');
  const items = [
    { id: 'p', text: 'Passo 1: Marque a ideia central.', embedding: [1, 0], gain: 0.8 },
    { id: 'q', text: 'Passo 2: Ajuste a borda direita.', embedding: [0, 1], gain: 0.9 },
    { id: 'r', role: 'recap', text: 'Marque a ideia central.', embedding: [1, 0], gain: 0.2 },
  ];
  const result = measureNovelty(items);
  assert.equal(result.status, 'pass');
  assert.equal(result.pairs.length, 1);
  assert.ok(Math.abs(result.pairs[0].centered + 1) < 1e-12);
});

test('detecta duplicata manual mesmo com resíduo de norma zero', () => {
  const items = ['Regra 3', 'Regra 4'].map((label, index) => ({
    id: String(index), text: label + ': Use uma foto ampla.', embedding: [1, 0], gain: 0.85,
  }));
  const result = measureNovelty(items);
  assert.equal(result.status, 'fail');
  assert.equal(result.pairs[0].centered, null);
  assert.equal(result.pairs[0].cleanJaccard, 1);
});

test('ausência de embeddings ou juízo de ganho mantém avaliação inconclusiva', () => {
  const result = measureNovelty([
    { id: 'a', text: 'Ajuste as formas.' },
    { id: 'b', text: 'Compare a segunda frase.', embedding: [1, 0] },
  ]);
  assert.equal(result.status, 'unknown');
  assert.equal(result.migMean, null);
});

test('ganho insuficiente da próxima lâmina não some na média', () => {
  const result = measureNovelty([
    { id: 'a', text: 'Encontre um primeiro ponto.', embedding: [1, 0], gain: 1 },
    { id: 'b', text: 'Procure o começo da leitura.', embedding: [0.81, Math.sqrt(1 - 0.81 ** 2)], gain: 0.49 },
  ]);
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.belowFloor, ['b']);
  assert.equal(result.pairs[0].fail, true);
});

test('a CLI vincula a observação ao plano e à copy usada pelo embedding', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-novelty-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planPath = join(root, 'plan.json');
  const observationsPath = join(root, 'observations.json');
  const outputPath = join(root, 'report.json');
  const slides = [
    { id: 'one', headline: 'Passo 1: Ajuste a luz.', body: 'Compare as sombras.' },
    { id: 'two', headline: 'Passo 2: Equilibre a moldura.', listItems: ['Declare o foco.'] },
  ];
  const plan = JSON.stringify({ slides });
  await writeFile(planPath, plan);
  const observations = {
    model: 'text-embedding-3-small', inputSha256: sha256(plan),
    slides: slides.map((slide, index) => ({
      id: slide.id, embedding: index ? [1, 0] : [0, 1], gain: 0.9,
      textSha256: sha256(stripScaffold([slide.headline, slide.body, ...(slide.listItems ?? [])].filter(Boolean).join('\n'))),
      cognitiveOperation: 'comparar', evidence: 'Vetor sintético para testar o vínculo.',
    })),
  };
  const run = output => execFileSync(process.execPath, [
    fileURLToPath(new URL('./cli.mjs', import.meta.url)),
    'novelty', '--plan', planPath, '--observations', observationsPath, '--output', output,
  ], { encoding: 'utf8', stdio: 'pipe' });
  await writeFile(observationsPath, JSON.stringify(observations));
  assert.equal(JSON.parse(run(outputPath)).status, 'pass');
  assert.equal(JSON.parse(await readFile(outputPath)).inputSha256, sha256(plan));
  observations.slides[0].textSha256 = sha256('Copy diferente');
  await writeFile(observationsPath, JSON.stringify(observations));
  assert.throws(() => run(join(root, 'invalid.json')), /desvinculado da copy/);
});

test('um ganho ausente não mascara o veto já observado em outra lâmina', () => {
  const result = measureNovelty([
    { id: 'a', text: 'Ajuste as formas.', embedding: [0, 1], gain: 0.33 },
    { id: 'b', text: 'Compare a segunda frase.', embedding: [1, 0] },
  ]);
  assert.equal(result.status, 'fail');
  assert.equal(result.migMean, null);
  assert.deepEqual(result.belowFloor, ['a']);
});

const ordinary = {
  id: 'passo', layout: 'comparison_dual', headline: 'Regra 1: Prepare as margens.', body: 'Confira o espaço.',
  listItems: ['Enquadre a página.'], diagram: 'flow',
};
const ordinaryCopy = 'Prepare as margens.\nConfira o espaço.\nEnquadre a página.';
const closing = { id: 'fecho', layout: 'cta_closing', headline: 'Regra 2: Compare as opções.', body: 'Salve o roteiro.' };

function compareClosing(slide, copy, gain = 0.85) {
  const value = { slides: [ordinary, slide] };
  const digest = sha256(JSON.stringify(value));
  return reviewNovelty({ value, digest }, { digest: 'synthetic', value: {
    model: 'text-embedding-3-small',
    inputSha256: digest,
    slides: [
      { id: ordinary.id, embedding: [1, 0], gain: 0.95, textSha256: sha256(ordinaryCopy), evidence: 'Observação do preparo.' },
      { id: slide.id, embedding: [0, 1], gain, textSha256: sha256(copy), evidence: 'Observação da comparação.' },
    ],
  } });
}

test('cada demonstração governada contribui com a tese e o conteúdo visível sem o pedido de interação', () => {
  for (const [diagram, lines] of [
    [{ type: 'contrast', labels: ['Fundo suave', 'Fundo escuro'], sample: 'Sua oferta' }, ['Fundo suave', 'Fundo escuro', 'Sua oferta']],
    [{ type: 'type_scale', labels: ['Menor', 'Maior'], sample: 'Seu anúncio' }, ['Menor', 'Maior', 'Seu anúncio']],
    [{ type: 'hierarchy', labels: ['Peso igual', 'Título dominante'], items: ['Título', 'Oferta', 'Selo'] },
      ['Peso igual', 'Título dominante', 'Título', 'Oferta', 'Selo']],
    [{ type: 'category_split', labels: ['Ferramentas', 'Materiais'], items: ['Tesoura', 'Cartolina'] },
      ['Ferramentas', 'Tesoura', 'Materiais', 'Cartolina']],
    [{ type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Sua oferta' },
      ['Em pé', 'De cabeça para baixo', 'Sua oferta']],
  ]) {
    const visibleCopy = ['Compare as opções.', ...lines].join('\n');
    const slide = { ...closing, diagram };
    const result = compareClosing(slide, visibleCopy);
    assert.equal(result.status, 'pass', diagram.type);
    assert.equal(result.embeddingsComplete, true);
    assert.deepEqual(result.pairs.map(pair => pair.ids), [[ordinary.id, slide.id]]);
    assert.ok(Math.abs(result.migMean - 0.9) < 1e-12);
    assert.equal(compareClosing({ ...slide, body: 'Envie este exemplo.' }, visibleCopy).status, 'pass');
    assert.throws(() => compareClosing(slide, visibleCopy + '\n' + slide.body), /desvinculado da copy/);
  }
});

test('pares de uma demonstração final vinculam rótulo e exemplo e têm piso individual de ganho', () => {
  const diagram = { type: 'category_split', labels: ['Ferramentas', 'Materiais'], items: ['Tesoura', 'Cartolina'] };
  const visibleCopy = 'Compare as opções.\nFerramentas\nTesoura\nMateriais\nCartolina';
  const slide = { ...closing, diagram };
  const insufficientGain = compareClosing(slide, visibleCopy, 0.4);
  assert.equal(insufficientGain.status, 'fail');
  assert.deepEqual(insufficientGain.belowFloor, [closing.id]);
  const swapped = { ...slide, diagram: { ...diagram, items: diagram.items.toReversed() } };
  assert.throws(() => compareClosing(swapped, visibleCopy), /desvinculado da copy/);
});

test('fecho sem demonstração mantém a copy observada e fica fora do cálculo de novidade', () => {
  const slide = { ...closing, diagram: 'focus', listItems: ['Pratique depois.'] };
  const result = compareClosing(slide, 'Compare as opções.\nSalve o roteiro.\nPratique depois.', 0.2);
  assert.equal(result.status, 'unknown');
  assert.equal(result.migMean, 0.95);
  assert.deepEqual(result.belowFloor, []);
  assert.deepEqual(result.pairs, []);
});

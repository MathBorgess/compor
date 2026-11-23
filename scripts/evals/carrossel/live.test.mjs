import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fingerprintLiveCarouselCandidate, runLiveCarousel } from './live.mjs';
import { sha256 } from './protocol.mjs';

const fakeKey = 'sk-test-local-fixture-only-never-for-provider';
const candidateSha256 = await fingerprintLiveCarouselCandidate();
const devPath = fileURLToPath(new URL('./dev-cases.json', import.meta.url));

async function writeSuite(path, split, prefix, first = {}) {
  const cases = Array.from({ length: 6 }, (_, index) => ({
    id: `${prefix}-${index}`, mode: 'editorial_art', expected: 'deliver_deck',
    briefing: `Exemplo sintético ${prefix}: situação ${index}.`, facts: [`Fato hipotético ${index}.`], strata: ['sintetico'],
    ...(index === 0 ? first : {}),
  }));
  const bytes = JSON.stringify({ version: 1, split, cases });
  await writeFile(path, bytes);
  return { path, split, sha256: sha256(bytes) };
}

function scenario() {
  const submissions = [];
  const headline = 'Um exemplo verificável';
  const deck = { mode: 'editorial_art', slides: [
    { id: 'abertura', layout: 'typo_breather', headline, alt: 'Título em fundo claro.' },
    { id: 'explicacao', layout: 'svg_diagram', headline: 'Uma escolha muda o caminho', diagram: { type: 'flow', labels: ['Antes', 'Depois'] }, alt: 'Duas etapas.' },
    { id: 'fecho', layout: 'cta_closing', headline: 'Salve o exemplo', alt: 'Convite para salvar.' },
  ] };
  const coverOptions = [headline, ...Array.from({ length: 9 }, (_, index) => `Exemplo candidato ${index}`)];
  const fetchApi = async (url, options) => {
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${fakeKey}`);
    const { pathname } = new URL(url);
    if (options.method === 'POST') {
      assert.equal(pathname, '/v1/agents/sessions');
      submissions.push(JSON.parse(options.body));
      return Response.json({ id: 'sess_local_mock' }, { headers: { 'x-request-id': 'req_local_mock' } });
    }
    if (pathname.endsWith('/items')) return Response.json({ data: [{
      type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', turn_id: 'turn_local_mock',
      content: [{ type: 'output_text', text: JSON.stringify({ outcome: 'delivered', deck, coverOptions }) }],
    }] });
    if (pathname.endsWith('/turns')) return Response.json({ data: [
      { id: 'turn_local_mock', session_id: 'sess_local_mock', subagent_id: null, status: 'completed' },
    ] });
    return Response.json({ usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } });
  };
  return { submissions, fetchApi };
}

test('valida revisão, partição, caminho e integridade antes do primeiro envio', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-sealed-rejection-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'evidence');
  const sealedSuite = await writeSuite(join(directory, 'holdout.json'), 'holdout', 'reserve');
  const { submissions, fetchApi } = scenario();
  const options = { key: fakeKey, root, cycle: 4, candidateSha256, sealedSuite, render: false, fetchApi };
  await assert.rejects(runLiveCarousel({ ...options, cycle: 3 }), /holdout em C4/);
  await assert.rejects(runLiveCarousel({ ...options, candidateSha256: '0'.repeat(64) }), /candidato diverge/);
  await assert.rejects(runLiveCarousel({ ...options, sealedSuite: { ...sealedSuite, sha256: '0'.repeat(64) } }), /suíte privada diverge/);
  const link = join(directory, 'aponta-para-dev.json');
  await symlink(devPath, link);
  await assert.rejects(runLiveCarousel({ ...options, sealedSuite: { ...sealedSuite, path: link } }), /fora do repositório/);
  assert.equal(submissions.length, 0);
});

test('congela partições, conserva recibos e só envia o caso selecionado', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-sealed-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'evidence');
  const holdout = await writeSuite(join(directory, 'holdout.json'), 'holdout', 'reserve');
  const colliding = await writeSuite(join(directory, 'colliding.json'), 'independent', 'confirm', { briefing: 'Exemplo sintético reserve: situação 0.' });
  const independent = await writeSuite(join(directory, 'independent.json'), 'independent', 'confirm');
  const { submissions, fetchApi } = scenario();
  const options = { key: fakeKey, root, candidateSha256, render: false, fetchApi };

  const first = await runLiveCarousel({ ...options, cycle: 4, sealedSuite: holdout, caseIndex: 1 });
  assert.equal(first.state, 'planned');
  assert.equal(first.caseId, 'reserve-1');
  assert.equal(first.receipt.split, 'holdout');
  assert.equal(first.receipt.suiteSha256, holdout.sha256);
  assert.equal(first.receipt.candidateSha256, candidateSha256);
  const [submitted] = submissions;
  assert.deepEqual(JSON.parse(submitted.input), {
    mode: 'editorial_art', briefing: 'Exemplo sintético reserve: situação 1.', facts: ['Fato hipotético 1.'],
  });
  assert.equal((await runLiveCarousel({ ...options, cycle: 4, sealedSuite: holdout, caseIndex: 1 })).reused, true);
  const changed = await writeSuite(join(directory, 'other-holdout.json'), 'holdout', 'other');
  await assert.rejects(runLiveCarousel({ ...options, cycle: 4, sealedSuite: changed }), /partição congelada/);
  await assert.rejects(runLiveCarousel({ ...options, cycle: 4, sealedSuite: independent }), /controlOnly:true/);
  await assert.rejects(runLiveCarousel({ ...options, cycle: 5, sealedSuite: colliding }), /partições seladas compartilham/);
  assert.equal(submissions.length, 1);

  const control = await runLiveCarousel({ ...options, cycle: 4, sealedSuite: independent, controlOnly: true });
  const confirmation = await runLiveCarousel({ ...options, cycle: 5, sealedSuite: independent });
  assert.equal(control.state, 'planned');
  assert.equal(control.receipt.controlOnly, true);
  assert.equal(confirmation.state, 'planned');
  assert.equal(confirmation.receipt.controlOnly, false);
  assert.equal(control.receipt.suiteSha256, confirmation.receipt.suiteSha256);
  assert.equal(submissions.length, 3);
  const stored = JSON.parse(await readFile(first.receiptPath, 'utf8'));
  assert.equal(stored.planner.usage.total_tokens, 30);
});

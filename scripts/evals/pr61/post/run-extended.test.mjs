import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertPrivateEvidenceDir,
  buildFrameImageRequest,
  buildPlannerRequest,
  parsePlannedPiece,
  runExtendedRound,
} from './run-extended.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const FIXTURES_PATH = join(HERE, 'casos-estendidos.json');
const FAKE_KEY = 'sk-test-fake-secret-never-logged-1234567890';

function makeValidPngBase64(width, height, color) {
  const py = [
    'import base64, io, sys',
    'from PIL import Image',
    `img = Image.new("RGB", (${width}, ${height}), "${color}")`,
    'buf = io.BytesIO()',
    'img.save(buf, format="PNG")',
    'sys.stdout.write(base64.b64encode(buf.getvalue()).decode("ascii"))',
  ].join('\n');
  return execFileSync('python3', ['-I', '-B', '-c', py], { encoding: 'utf8' });
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

test('assertPrivateEvidenceDir rejeita caminhos dentro do repositório, cwd e home', () => {
  assert.throws(() => assertPrivateEvidenceDir(''), /explicit_evidence_directory_required/);
  assert.throws(() => assertPrivateEvidenceDir(homedir()), /dedicated_directory_required/);
  assert.throws(() => assertPrivateEvidenceDir(process.cwd()), /dedicated_directory_required/);
  assert.throws(() => assertPrivateEvidenceDir(join(REPO_ROOT, 'tmp-eval')), /evidence_directory_must_be_outside_git_repo/);
  const outside = join(tmpdir(), 'compor-eval-outside-check');
  assert.equal(assertPrivateEvidenceDir(outside), resolve(outside));
});

test('buildPlannerRequest isola baseline sem skills vs candidate com catalogo criativo e brandVoice', async () => {
  const cases = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const storyCase = cases.find(c => c.format === 'story');
  assert.ok(storyCase);

  const baseline = await buildPlannerRequest(storyCase, 'baseline');
  assert.deepEqual(baseline.skillIds, []);
  assert.equal(baseline.catalogVersion, null);
  assert.doesNotMatch(baseline.instructions, /on-image-copy\.v1|story-vertical\.v1/);
  assert.equal(JSON.parse(baseline.input).brandVoice, undefined);

  const candidate = await buildPlannerRequest(storyCase, 'candidate');
  assert.deepEqual(candidate.skillIds, ['creative-core.v1', 'on-image-copy.v1', 'story-vertical.v1']);
  assert.equal(candidate.catalogVersion, 'compor-creative-skills.v4');
  assert.match(candidate.instructions, /brandVoice\.avoid/);
  assert.ok(JSON.parse(candidate.input).brandVoice.avoid.length > 0);
});

test('runExtendedRound gera baseline e candidate compativeis com judge.py sem vazar API key', async () => {
  const cases = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const png45 = makeValidPngBase64(128, 160, '#224466');
  const png916 = makeValidPngBase64(108, 192, '#335544');
  const root = mkdtempSync(join(tmpdir(), 'compor-marco5-extended-test-'));

  try {
    const calls = { plans: [], images: [] };
    let sessCounter = 0;
    const sessionPlans = new Map();

    const fakeFetch = async (url, init) => {
      const target = String(url);
      const headers = new Headers(init.headers);
      assert.equal(headers.get('authorization'), `Bearer ${FAKE_KEY}`);

      if (target === 'https://api.openai.com/v1/agents/sessions' && init.method === 'POST') {
        const body = JSON.parse(init.body);
        const input = JSON.parse(body.input);
        const sid = `sess_fake_${++sessCounter}`;
        const factIds = input.offerFacts.map(f => f.id);
        const frames = Array.from({ length: input.expectedFrames }, (_, idx) => ({
          position: idx + 1,
          role: idx === 0 ? 'Capa gancho' : `Desenvolvimento ${idx + 1}`,
          headline: idx === 0 ? `Gancho ${input.format}` : `Passo ${idx + 1}`,
          body: idx === 0 ? input.offerFacts.map(f => f.value).join(' · ') : 'Apoio curto',
          visualCue: 'Luz natural lateral e alto contraste',
          factIds: idx === 0 ? factIds : [],
          prompt: `Cena editorial ${input.format} lâmina ${idx + 1} com foco concreto.`,
        }));
        const answer = JSON.stringify({
          visualInvariants: 'Paleta consistente, tipografia limpa e mesma luz',
          caption: input.captionIncluded ? 'Legenda complementar coerente com o post.' : '',
          frames,
        });
        sessionPlans.set(sid, answer);
        calls.plans.push({ sid, format: input.format, hasBrandVoice: Boolean(input.brandVoice) });
        return Response.json({ id: sid }, { headers: { 'x-request-id': `req_plan_${sessCounter}` } });
      }

      const sessMatch = target.match(/^https:\/\/api\.openai\.com\/v1\/agents\/sessions\/(sess_fake_\d+)$/);
      if (sessMatch) {
        return Response.json({ id: sessMatch[1], status: 'idle', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } });
      }

      const turnsMatch = target.match(/^https:\/\/api\.openai\.com\/v1\/agents\/sessions\/(sess_fake_\d+)\/turns/);
      if (turnsMatch && !target.includes('/items')) {
        return Response.json({
          data: [{ id: `turn_${turnsMatch[1]}`, session_id: turnsMatch[1], subagent_id: null, status: 'completed' }],
          has_more: false,
        });
      }

      const itemsMatch = target.match(/^https:\/\/api\.openai\.com\/v1\/agents\/sessions\/(sess_fake_\d+)\/turns\/(turn_[^/]+)\/items/);
      if (itemsMatch) {
        return Response.json({
          data: [{
            type: 'message',
            role: 'assistant',
            status: 'completed',
            phase: 'final_answer',
            turn_id: itemsMatch[2],
            content: [{ type: 'output_text', text: sessionPlans.get(itemsMatch[1]) }],
          }],
          has_more: false,
        });
      }

      if (target === 'https://api.openai.com/v1/images/generations' || target === 'https://api.openai.com/v1/images/edits') {
        const isEdit = target.endsWith('/edits');
        let size;
        let imageCount = 0;
        if (init.body instanceof FormData) {
          size = String(init.body.get('size'));
          imageCount = init.body.getAll('image[]').length;
        } else {
          const parsed = JSON.parse(init.body);
          size = parsed.size;
        }
        calls.images.push({ isEdit, size, imageCount });
        const b64 = size === '864x1536' ? png916 : png45;
        return Response.json(
          { data: [{ b64_json: b64 }], usage: { input_tokens: 80, output_tokens: 200, total_tokens: 280 } },
          { headers: { 'x-request-id': `req_img_${calls.images.length}` } },
        );
      }

      throw Error(`unexpected_fetch:${target}`);
    };

    const selectedIds = ['ext-single-cafe-dev', 'ext-carousel-enem-dev', 'ext-collection-ceramica-dev', 'ext-story-oficina-dev'];
    const subsetFixtures = join(root, 'subset-fixtures.json');
    const subsetCases = cases.filter(c => selectedIds.includes(c.id));

    // Write subset fixtures cleanly via node fs
    const { writeFileSync } = await import('node:fs');
    writeFileSync(subsetFixtures, JSON.stringify(subsetCases, null, 2));

    const r0 = await runExtendedRound({
      root,
      round: 0,
      arm: 'baseline',
      revision: 'rev-test-0',
      fixturesPath: subsetFixtures,
      key: FAKE_KEY,
      fetchApi: fakeFetch,
      sleepFn: async () => {},
      allowAnyRoot: true,
    });
    assert.equal(r0.completeManifest.incompleteCases.length, 0);
    assert.equal(r0.usageSummary.imagesComplete, 10);
    assert.equal(calls.images.every(c => !c.isEdit && c.imageCount === 0), true);
    assert.equal(calls.images.filter(c => c.size === '864x1536').length, 1);

    const beforeCandidateImages = calls.images.length;
    const r1 = await runExtendedRound({
      root,
      round: 1,
      arm: 'candidate',
      revision: 'rev-test-1',
      fixturesPath: subsetFixtures,
      key: FAKE_KEY,
      fetchApi: fakeFetch,
      sleepFn: async () => {},
      allowAnyRoot: true,
    });
    assert.equal(r1.completeManifest.incompleteCases.length, 0);
    assert.equal(r1.usageSummary.imagesComplete, 10);
    const candidateImages = calls.images.slice(beforeCandidateImages);
    // 4 carousel frames (2..5) + 2 collection frames (2..3) must use anchor via /edits
    assert.equal(candidateImages.filter(c => c.isEdit && c.imageCount === 1).length, 6);
    assert.equal(candidateImages.filter(c => !c.isEdit && c.imageCount === 0).length, 4);
    assert.equal(candidateImages.filter(c => c.size === '864x1536').length, 1);

    // Verify API key never leaked into any saved artifact
    for (const file of collectFiles(root)) {
      if (file.endsWith('.png')) continue;
      const content = readFileSync(file, 'utf8');
      assert.equal(content.includes(FAKE_KEY), false, `API key leaked in ${file}`);
    }

    // Verify judge.py build_extended_packet reads round-1 artifacts cleanly with 100% availability
    const pyCheck = [
      'import json, sys',
      'from pathlib import Path',
      `sys.path.insert(0, ${JSON.stringify(HERE)})`,
      'from judge import build_extended_packet',
      `root = Path(${JSON.stringify(root)})`,
      'blind = root / "blind-check"',
      'blind.mkdir()',
      'packets, attachments, decoding = build_extended_packet(root / "subset-fixtures.json", root / "round-1", blind, "seed", "rev-test-1")',
      'assert len(packets) == 4',
      'assert all(item["available"] for item in decoding.values()), decoding',
      'print(json.dumps({"packets": len(packets), "attachments": len(attachments)}))',
    ].join('\n');
    const verified = JSON.parse(execFileSync('python3', ['-I', '-B', '-c', pyCheck], { encoding: 'utf8' }));
    assert.equal(verified.packets, 4);
    assert.equal(verified.attachments, 14); // 4 panels + 10 original frames
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parsePlannedPiece e buildFrameImageRequest validam formato e ancora corretamente', () => {
  const cases = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const colCase = cases.find(c => c.id === 'ext-collection-ceramica-dev');
  const planned = parsePlannedPiece(
    '```json\n' + JSON.stringify({
      visualInvariants: 'Luz de janela quente e grão fino',
      caption: 'Fornada disponível sábado às 10h no Ateliê Barro Vivo.',
      frames: [
        { position: 1, role: 'Abertura', headline: 'Barro Vivo · Sábado às 10h', body: '', visualCue: 'Plano aberto', factIds: ['f1', 'f2'], prompt: 'Canecas em mesa de madeira' },
        { position: 2, role: 'Detalhe', headline: '', body: '', visualCue: 'Close da textura', factIds: [], prompt: 'Detalhe do esmalte azul-cinza sem texto' },
        { position: 3, role: 'Uso', headline: '', body: '', visualCue: 'Mãos segurando a caneca', factIds: [], prompt: 'Mãos segurando caneca fumegante sem texto' },
      ],
    }) + '\n```',
    colCase,
  );
  const anchorB64 = makeValidPngBase64(64, 80, '#886644');
  const req2 = buildFrameImageRequest({
    testCase: colCase,
    planned,
    frame: planned.frames[1],
    arm: 'candidate',
    anchorImage: { mime: 'image/png', data: anchorB64 },
  });
  assert.equal(req2.size, '1024x1280');
  assert.equal(req2.anchorUsed, true);
  assert.equal(req2.images.length, 1);
  assert.match(req2.prompt, /lâmina 1 âncora visual da série/);
  assert.match(req2.prompt, /Luz de janela quente/);
  assert.ok(!existsSync('/nonexistent-sentinel'));
});

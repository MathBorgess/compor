import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AGENT_MODEL } from '../../../../packages/agents-api/src/agent-model.mjs';
import { compileArtworkPrompt } from '../../../../packages/agents-api/src/artwork-input.mjs';
import {
  CREATIVE_SKILLS_CATALOG_VERSION,
  formatImageSize,
  formatSpec,
  resolveCreativeSkillBundle,
} from '../../../../packages/agents-api/src/creative-skills/index.mjs';
import { imagePromptSkills } from '../../../../packages/agents-api/src/image-prompt-skills.mjs';
import { createImageHandler } from '../../../../packages/images-api/src/index.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const DEFAULT_FIXTURES = fileURLToPath(new URL('./casos-estendidos.json', import.meta.url));
const AGENTS_ROOT = 'https://api.openai.com/v1/agents/sessions';
const IMAGES_ORIGIN = 'https://api.openai.com';
const PLACEHOLDER_KEY = 'sk-local-evaluation-only-no-provider-credential';
const MAX_ANCHOR_PNG_BYTES = 1_850_000;
const PYTHON = process.env.COMPOR_EVAL_PYTHON || 'python3';

const sessionIdValid = value => typeof value === 'string' && /^sess_[A-Za-z0-9_-]{1,128}$/.test(value);
const turnIdValid = value => typeof value === 'string' && /^turn_[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const deterministicUuid = seed => {
  const hex = digest(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const safeRequestId = response => {
  const id = response.headers.get('x-request-id');
  return /^[A-Za-z0-9_-]{1,160}$/.test(id ?? '') ? id : null;
};
const safeCounts = value => {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
};

function writeAtomic(file, value) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, json, { flag: 'wx', mode: 0o600 });
  try {
    if (existsSync(file)) unlinkSync(file);
    linkSync(tmp, file);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function writeOnceJson(file, value) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== json) throw Error(`artifact_changed:${file}`);
    return;
  }
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, json, { flag: 'wx', mode: 0o600 });
  try {
    linkSync(tmp, file);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

export function assertPrivateEvidenceDir(dirPath) {
  if (!dirPath) throw Error('explicit_evidence_directory_required');
  const resolved = resolve(dirPath);
  if (resolved === homedir() || resolved === process.cwd()) {
    throw Error('dedicated_directory_required');
  }
  const rel = relative(REPO_ROOT, resolved);
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))) {
    throw Error('evidence_directory_must_be_outside_git_repo');
  }
  return resolved;
}

function readApiKeyFromUser({ useStdin = false } = {}) {
  // Keys stay strictly in process memory via macOS clipboard or stdin, never in argv, files, env or logs.
  let secret;
  try {
    secret = process.platform === 'darwin' && !useStdin && !process.env.COMPOR_EVAL_KEY_STDIN
      ? execFileSync('/usr/bin/pbpaste', { maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      : readFileSync(0, 'utf8').trim();
  } catch {
    throw Error('credential_input_unavailable');
  }
  if (!/^sk-[A-Za-z0-9_-]{20,300}$/.test(secret)) {
    throw Error('clipboard_or_stdin_has_no_valid_openai_key');
  }
  return secret;
}

function withCredential(init, key) {
  const headers = new Headers(init.headers);
  if (headers.get('authorization') !== `Bearer ${PLACEHOLDER_KEY}` || init.redirect !== 'error') {
    throw Error('unexpected_transport');
  }
  headers.set('authorization', `Bearer ${key}`);
  return { ...init, headers };
}

function validatePngBytes(bytes) {
  const script = [
    'import io, sys',
    'from PIL import Image',
    'raw = sys.stdin.buffer.read()',
    'with Image.open(io.BytesIO(raw)) as img:',
    '    assert img.format == "PNG"',
    '    img.load()',
    '    assert img.width >= 64 and img.height >= 64',
  ].join('\n');
  const check = spawnSync(PYTHON, ['-I', '-B', '-c', script], {
    input: bytes,
    timeout: 30_000,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  if (check.status !== 0) throw Error('invalid_image_png');
}

function encodeAnchorImage(pngPath) {
  const bytes = readFileSync(pngPath);
  if (bytes.length <= MAX_ANCHOR_PNG_BYTES) {
    return { mime: 'image/png', data: bytes.toString('base64') };
  }
  const script = [
    'import io, sys',
    'from PIL import Image',
    'raw = sys.stdin.buffer.read()',
    'with Image.open(io.BytesIO(raw)) as img:',
    '    rgb = img.convert("RGB")',
    '    rgb.thumbnail((1024, 1280), Image.Resampling.LANCZOS)',
    '    out = io.BytesIO()',
    '    rgb.save(out, format="JPEG", quality=90, optimize=True)',
    '    sys.stdout.buffer.write(out.getvalue())',
  ].join('\n');
  const converted = spawnSync(PYTHON, ['-I', '-B', '-c', script], {
    input: bytes,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if (converted.status !== 0 || !converted.stdout?.length) {
    throw Error('anchor_image_transcode_failed');
  }
  return { mime: 'image/jpeg', data: converted.stdout.toString('base64') };
}

const OUTPUT_CONTRACT = [
  'Responda EXCLUSIVAMENTE com um objeto JSON válido (sem markdown nem texto fora do JSON), no formato:',
  '{"visualInvariants":"regras visuais da peça ou série","caption":"legenda complementar de publicação ou string vazia quando captionIncluded for false","frames":[{"position":1,"role":"papel da lâmina","headline":"texto principal na imagem (pode ser vazio em fotos puras de coleção)","body":"texto complementar curto na imagem (pode ser vazio)","visualCue":"enquadramento, luz e hierarquia visual","factIds":["f1"],"prompt":"descrição detalhada da arte completa para o gerador de imagem, em português"}]}',
  'Regras do contrato:',
  '- Produza exatamente `expectedFrames` itens em `frames`, com `position` sequencial de 1 até `expectedFrames`.',
  '- Todo fato confirmado em `offerFacts` (`status: "confirmed"`) DEVE aparecer no conjunto da peça (em `factIds` de pelo menos uma lâmina e refletido literalmente em `headline`/`body` e em `prompt`), sem alterar grafia, números, horários, preços ou inventar fatos novos.',
  '- Nunca repita automaticamente a legenda dentro da arte; quando `captionIncluded` for true, escreva uma legenda complementar em `caption`. Quando `captionIncluded` for false, devolva `"caption": ""`.',
  '- Respeite todas as restrições do briefing (por exemplo, se a direção pedir texto apenas na foto 1 de uma coleção, deixe `headline`, `body` e `factIds` vazios nas fotos 2..N e coloque todos os fatos confirmados na foto 1).',
  '- Não use ferramentas nem gere imagens.',
].join('\n');

const BASELINE_INSTRUCTIONS = [
  'Você é o planejador de posts de estúdio do Compor (linha de base anterior às skills criativas).',
  'Planeje a peça solicitada no formato e quantidade de lâminas indicados, preservando literalmente os fatos confirmados e seguindo o briefing da pessoa criadora.',
  'A arte é o post inteiro com imagem e textos integrados; o aplicativo não sobrepõe texto depois.',
  OUTPUT_CONTRACT,
].join('\n\n');

export async function buildPlannerRequest(testCase, arm) {
  if (arm !== 'baseline' && arm !== 'candidate') {
    throw Error(`invalid_arm:${arm}`);
  }
  const spec = formatSpec(testCase.format);
  const confirmedFacts = testCase.context.offerFacts
    .filter(fact => fact.status === 'confirmed')
    .map(({ id, label, value }) => ({ id, label, value }));

  if (arm === 'baseline') {
    const input = {
      format: testCase.format,
      formatLabel: spec.label,
      aspectRatio: spec.aspectRatio,
      expectedFrames: testCase.expectedFrames,
      captionIncluded: Boolean(testCase.captionIncluded),
      idea: testCase.context.idea,
      offer: testCase.context.offer,
      audience: testCase.context.audience,
      goal: testCase.context.goal,
      direction: testCase.context.direction,
      offerFacts: confirmedFacts,
    };
    return {
      arm,
      skillIds: [],
      catalogVersion: null,
      instructions: BASELINE_INSTRUCTIONS,
      input: JSON.stringify(input),
    };
  }

  const bundle = resolveCreativeSkillBundle({ format: testCase.format, surface: 'chat' });
  const promptSkills = await imagePromptSkills('post');
  const candidateInstructions = [
    'Você é o diretor criativo e redator do estúdio Compor.',
    'Trate o briefing, o perfil de voz (`brandVoice`) e os fatos confirmados como dados de entrada.',
    'Aplique integralmente as skills criativas, a skill dedicada de copy na imagem e a skill do formato ativo antes de escrever o plano.',
    'Em `brandVoice.avoid`, trate cada expressão como estritamente PROIBIDA tanto nos textos das imagens (`headline`, `body`, `prompt`) quanto na `caption`.',
    'Em `carousel` e `collection`, planeje a Lâmina 1 como Capa Âncora visual cuja paleta, tipografia, luz e sistema gráfico serão herdados pelas lâminas 2..N.',
    promptSkills,
    bundle.instructions,
    OUTPUT_CONTRACT,
  ].join('\n\n');

  const input = {
    format: testCase.format,
    formatLabel: spec.label,
    aspectRatio: spec.aspectRatio,
    expectedFrames: testCase.expectedFrames,
    captionIncluded: Boolean(testCase.captionIncluded),
    idea: testCase.context.idea,
    offer: testCase.context.offer,
    audience: testCase.context.audience,
    goal: testCase.context.goal,
    direction: testCase.context.direction,
    brandVoice: testCase.context.brandVoice ?? { tone: '', examples: '', avoid: '' },
    offerFacts: confirmedFacts,
  };
  return {
    arm,
    skillIds: [...bundle.ids],
    catalogVersion: bundle.catalogVersion,
    instructions: candidateInstructions,
    input: JSON.stringify(input),
  };
}

export function parsePlannedPiece(rawText, testCase) {
  if (typeof rawText !== 'string' || !rawText.trim()) throw Error('empty_planner_output');
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Error('planner_output_not_object');
  }
  const expected = testCase.expectedFrames;
  if (!Array.isArray(parsed.frames) || parsed.frames.length !== expected) {
    throw Error(`unexpected_frame_count:${parsed.frames?.length ?? 'none'}`);
  }
  const validFactIds = new Set(
    testCase.context.offerFacts.filter(f => f.status === 'confirmed').map(f => f.id),
  );
  const coveredFactIds = new Set();
  const frames = parsed.frames.map((item, index) => {
    if (!item || typeof item !== 'object') throw Error('invalid_frame_item');
    const position = index + 1;
    if (item.position !== position) throw Error(`invalid_frame_position:${item.position}`);
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    if (!prompt || prompt.length > 3500) throw Error(`invalid_frame_prompt:${position}`);
    const role = typeof item.role === 'string' && item.role.trim() ? item.role.trim().slice(0, 80) : `Lâmina ${position}`;
    const headline = typeof item.headline === 'string' ? item.headline.trim().slice(0, 500) : '';
    const body = typeof item.body === 'string' ? item.body.trim().slice(0, 1000) : '';
    const visualCue = typeof item.visualCue === 'string' ? item.visualCue.trim().slice(0, 500) : '';
    const factIds = Array.isArray(item.factIds)
      ? [...new Set(item.factIds.filter(id => typeof id === 'string' && validFactIds.has(id)))]
      : [];
    for (const id of factIds) coveredFactIds.add(id);
    return { position, role, headline, body, visualCue, factIds, prompt };
  });

  // Fallback for single-frame pieces if agent omitted factIds array
  if (expected === 1 && coveredFactIds.size === 0) {
    frames[0].factIds = [...validFactIds];
    for (const id of validFactIds) coveredFactIds.add(id);
  }

  const visualInvariants = typeof parsed.visualInvariants === 'string'
    ? parsed.visualInvariants.trim().slice(0, 1000)
    : '';
  const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
  if (testCase.captionIncluded && !caption) {
    throw Error('missing_required_caption');
  }
  return { visualInvariants, caption: testCase.captionIncluded ? caption : '', frames };
}

export function buildFrameImageRequest({ testCase, planned, frame, arm, anchorImage = null }) {
  const format = testCase.format;
  const size = formatImageSize(format);
  const spec = formatSpec(format);
  const confirmedMap = new Map(
    testCase.context.offerFacts
      .filter(fact => fact.status === 'confirmed')
      .map(fact => [fact.id, fact]),
  );
  const frameFacts = frame.factIds
    .map(id => confirmedMap.get(id))
    .filter(Boolean);

  if (arm === 'baseline') {
    const factsLine = frameFacts.length
      ? `Fatos obrigatórios desta imagem (preservar literalmente): ${frameFacts.map(f => `${f.label}: ${f.value}`).join(' | ')}.`
      : 'Sem fatos obrigatórios adicionais nesta imagem.';
    const textParts = [
      frame.headline ? `Título na arte: ${frame.headline}` : '',
      frame.body ? `Texto complementar na arte: ${frame.body}` : '',
    ].filter(Boolean).join('\n');
    const prompt = [
      `Crie uma arte completa para ${spec.label} (${spec.aspectRatio}), com composição, imagem e tipografia integradas.`,
      factsLine,
      textParts,
      `Pedido criativo:\n${frame.prompt}`,
    ].filter(Boolean).join('\n\n').slice(0, 7900);
    return { size, prompt, images: [], anchorUsed: false };
  }

  const isMultiFrame = format === 'carousel' || format === 'collection';
  const frameUuid = deterministicUuid(`${testCase.id}:frame:${frame.position}`);
  const anchorUuid = deterministicUuid(`${testCase.id}:anchor:1`);
  const useAnchor = Boolean(isMultiFrame && frame.position > 1 && anchorImage);

  const literalFields = frameFacts.map(fact => ({
    id: deterministicUuid(`${testCase.id}:fact:${fact.id}`),
    label: fact.label.slice(0, 80),
    value: fact.value.slice(0, 500),
    origin: 'user',
  }));

  const proposal = {
    operation: 'create',
    baseImageId: null,
    referenceIds: [],
    prompt: frame.prompt,
    format,
    ...(isMultiFrame ? { frameId: frameUuid, frameIndex: frame.position } : {}),
  };

  const artworkInput = {
    literalText: {
      headline: frame.headline,
      price: '',
      date: '',
      ...(literalFields.length ? { fields: literalFields } : {}),
    },
    source: null,
    images: useAnchor
      ? [{ id: anchorUuid, role: 'anchor', mime: anchorImage.mime, data: anchorImage.data }]
      : [],
    format,
    ...(isMultiFrame
      ? {
          frame: {
            id: frameUuid,
            position: frame.position,
            total: testCase.expectedFrames,
            role: frame.role,
            headline: frame.headline,
            body: frame.body,
            ...(frame.visualCue ? { visualCue: frame.visualCue } : {}),
            ...(planned.visualInvariants ? { visualInvariants: planned.visualInvariants } : {}),
          },
        }
      : {}),
  };

  const prompt = compileArtworkPrompt(proposal, artworkInput).slice(0, 7900);
  const images = useAnchor ? [{ mime: anchorImage.mime, data: anchorImage.data }] : [];
  return { size, prompt, images, anchorUsed: useAnchor };
}

async function runPlannerSession({ caseDir, testCase, arm, revision, key, fetchApi, sleepFn }) {
  const planFile = join(caseDir, 'plan.json');
  const ledgerFile = join(caseDir, 'plan-ledger.json');

  if (existsSync(planFile)) {
    const existing = JSON.parse(readFileSync(planFile, 'utf8'));
    if (existing.state === 'complete' && existing.arm === arm && existing.revision === revision) {
      return existing;
    }
  }

  const req = await buildPlannerRequest(testCase, arm);
  const bindingHash = digest(JSON.stringify({ arm, revision, instructions: req.instructions, input: req.input }));

  let ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
  if (ledger && ledger.bindingHash !== bindingHash) {
    throw Error(`plan_binding_changed:${testCase.id}`);
  }
  if (ledger && ledger.state === 'submitted') {
    // Uncertain initial POST: never blindly resubmit.
    return { state: 'unknown', stage: 'plan', reason: 'plan_post_unconfirmed', usage: null };
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    'OpenAI-Beta': 'agents=v1',
    'Content-Type': 'application/json',
  };

  if (!ledger) {
    ledger = {
      state: 'submitted',
      arm,
      revision,
      bindingHash,
      skillIds: req.skillIds,
      catalogVersion: req.catalogVersion,
      model: AGENT_MODEL,
      sessionId: null,
      requestId: null,
      usage: null,
    };
    writeAtomic(ledgerFile, ledger);

    const body = JSON.stringify({
      agent: {
        model: AGENT_MODEL,
        instructions: req.instructions,
        reasoning: { effort: 'low' },
        multi_agent: { enabled: false },
        tools: [],
      },
      environment: { type: 'none' },
      input: req.input,
      stream: false,
    });

    const createResponse = await fetchApi(AGENTS_ROOT, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const reqId = safeRequestId(createResponse);
    if (!createResponse.ok) {
      ledger = { ...ledger, state: 'failed', httpStatus: createResponse.status, requestId: reqId };
      writeAtomic(ledgerFile, ledger);
      return { state: 'failed', stage: 'plan', httpStatus: createResponse.status, requestId: reqId, usage: null };
    }
    const created = await createResponse.json();
    if (!sessionIdValid(created?.id)) {
      ledger = { ...ledger, state: 'unknown', requestId: reqId, reason: 'invalid_session_id' };
      writeAtomic(ledgerFile, ledger);
      return { state: 'unknown', stage: 'plan', requestId: reqId, usage: null };
    }
    ledger = { ...ledger, state: 'bound', sessionId: created.id, requestId: reqId };
    writeAtomic(ledgerFile, ledger);
  }

  if (ledger.state !== 'bound' || !sessionIdValid(ledger.sessionId)) {
    return { state: ledger.state || 'unknown', stage: 'plan', usage: ledger.usage ?? null };
  }

  const getJson = async path => {
    const res = await fetchApi(`${AGENTS_ROOT}/${path}`, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw Error(`plan_poll_http_${res.status}`);
    return res.json();
  };

  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    let session;
    try {
      session = await getJson(ledger.sessionId);
    } catch {
      await sleepFn(2500);
      continue;
    }
    const usage = safeCounts(session?.usage) ?? ledger.usage;
    if (usage && JSON.stringify(usage) !== JSON.stringify(ledger.usage)) {
      ledger = { ...ledger, usage };
      writeAtomic(ledgerFile, ledger);
    }

    let turnsPage;
    try {
      turnsPage = await getJson(`${ledger.sessionId}/turns?limit=100&order=desc`);
    } catch {
      await sleepFn(2500);
      continue;
    }
    const roots = (turnsPage?.data ?? []).filter(t => t?.session_id === ledger.sessionId && t.subagent_id === null && turnIdValid(t.id));
    if (roots.length === 0) {
      await sleepFn(2000);
      continue;
    }
    const turn = roots[0];
    if (['queued', 'in_progress', 'waiting'].includes(turn.status)) {
      await sleepFn(2000);
      continue;
    }
    if (['failed', 'cancelled'].includes(turn.status)) {
      ledger = { ...ledger, state: 'failed', turnId: turn.id };
      writeAtomic(ledgerFile, ledger);
      return { state: 'failed', stage: 'plan', turnId: turn.id, usage: ledger.usage };
    }
    if (turn.status !== 'completed') {
      await sleepFn(2000);
      continue;
    }

    const itemsPage = await getJson(`${ledger.sessionId}/turns/${turn.id}/items?limit=100&order=asc`);
    const messages = (itemsPage?.data ?? []).filter(
      item => item?.type === 'message' && item.role === 'assistant' && item.status === 'completed' && item.phase === 'final_answer' && item.turn_id === turn.id,
    );
    const content = messages
      .flatMap(msg => (Array.isArray(msg.content) ? msg.content : []))
      .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('');
    if (content.includes(key)) {
      throw Error('provider_output_leaked_credential');
    }

    let planned;
    try {
      planned = parsePlannedPiece(content, testCase);
    } catch (error) {
      ledger = { ...ledger, state: 'invalid', turnId: turn.id, reason: String(error.message || error) };
      writeAtomic(ledgerFile, ledger);
      writeAtomic(join(caseDir, 'plan-raw.txt'), { raw: content, error: String(error.message || error) });
      return { state: 'invalid', stage: 'plan', turnId: turn.id, reason: ledger.reason, usage: ledger.usage };
    }

    const result = {
      state: 'complete',
      arm,
      revision,
      model: AGENT_MODEL,
      sessionId: ledger.sessionId,
      turnId: turn.id,
      requestId: ledger.requestId,
      skillIds: req.skillIds,
      catalogVersion: req.catalogVersion,
      usage: ledger.usage,
      planned,
    };
    ledger = { ...ledger, state: 'complete', turnId: turn.id };
    writeAtomic(ledgerFile, ledger);
    writeAtomic(planFile, result);
    return result;
  }

  return { state: 'unknown', stage: 'plan', reason: 'plan_poll_timeout', usage: ledger.usage };
}

async function generateFrame({ caseDir, receiptsFile, testCase, planned, frame, arm, revision, key, fetchApi, validatePngFn, anchorImage }) {
  const filename = `frame-${frame.position}.png`;
  const targetPath = join(caseDir, filename);
  const receipts = existsSync(receiptsFile) ? JSON.parse(readFileSync(receiptsFile, 'utf8')) : {};
  const prior = receipts[filename];

  if (prior) {
    if (prior.state === 'complete' && prior.revision === revision && existsSync(targetPath)) {
      const existingBytes = readFileSync(targetPath);
      if (digest(existingBytes) === prior.sha256) {
        return { filename, receipt: prior, reused: true };
      }
      throw Error(`stored_image_changed:${testCase.id}/${filename}`);
    }
    // Never automatically resubmit an already-submitted or uncertain image slot.
    return { filename, receipt: prior, reused: false };
  }

  const req = buildFrameImageRequest({ testCase, planned, frame, arm, anchorImage });
  const promptSha256 = digest(req.prompt);

  receipts[filename] = {
    state: 'submitted',
    revision,
    model: 'gpt-image-2.6-flare',
    size: req.size,
    anchorUsed: req.anchorUsed,
    promptSha256,
    sha256: null,
    usage: null,
    requestId: null,
  };
  writeAtomic(receiptsFile, receipts);

  let httpStatus = null;
  let reqId = null;
  const handler = createImageHandler({
    authenticate: async () => ({ userId: 'synthetic-marco5-extended' }),
    fetch: async (url, init) => {
      const expectedUrl = `${IMAGES_ORIGIN}/v1/images/${req.images.length ? 'edits' : 'generations'}`;
      if (url !== expectedUrl || init.method !== 'POST') {
        throw Error('invalid_image_transport');
      }
      const authedInit = withCredential(init, key);
      const response = await fetchApi(url, authedInit);
      httpStatus = response.status;
      reqId = safeRequestId(response);
      return response;
    },
  });

  const response = await handler(
    new Request('http://localhost/eval-extended', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: PLACEHOLDER_KEY,
        authorizeGeneration: true,
        prompt: req.prompt,
        size: req.size,
        images: req.images,
      }),
    }),
  );

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const definite = response.status === 400 || response.status === 401 || response.status === 403 || response.status === 429;
    receipts[filename] = {
      ...receipts[filename],
      state: definite ? 'failed' : 'unknown',
      httpStatus: httpStatus ?? response.status,
      requestId: reqId,
      error: errorPayload?.error ?? `http_${response.status}`,
    };
    writeAtomic(receiptsFile, receipts);
    return { filename, receipt: receipts[filename], reused: false };
  }

  const payload = await response.json();
  const bytes = Buffer.from(payload.imageBase64, 'base64');
  try {
    validatePngFn(bytes);
  } catch {
    receipts[filename] = {
      ...receipts[filename],
      state: 'unknown',
      httpStatus: httpStatus ?? 200,
      requestId: reqId,
      error: 'invalid_image_png',
    };
    writeAtomic(receiptsFile, receipts);
    return { filename, receipt: receipts[filename], reused: false };
  }

  writeFileSync(targetPath, bytes, { flag: 'wx', mode: 0o600 });
  receipts[filename] = {
    state: 'complete',
    revision,
    model: 'gpt-image-2.6-flare',
    size: req.size,
    anchorUsed: req.anchorUsed,
    promptSha256,
    sha256: digest(bytes),
    bytes: bytes.length,
    usage: payload.usage ?? null,
    httpStatus: httpStatus ?? 200,
    requestId: reqId,
  };
  writeAtomic(receiptsFile, receipts);
  return { filename, receipt: receipts[filename], reused: false };
}

export async function runExtendedRound({
  root,
  round,
  arm,
  revision,
  fixturesPath = DEFAULT_FIXTURES,
  key,
  fetchApi = fetch,
  sleepFn = delay,
  validatePngFn = validatePngBytes,
  encodeAnchorFn = encodeAnchorImage,
  allowAnyRoot = false,
  caseFilter = null,
  onProgress = null,
}) {
  if (!Number.isInteger(round) || round < 0 || round > 5) throw Error(`invalid_round:${round}`);
  if (arm !== 'baseline' && arm !== 'candidate') throw Error(`invalid_arm:${arm}`);
  if (typeof revision !== 'string' || !revision.trim()) throw Error('revision_required');
  if (typeof key !== 'string' || !/^sk-[^\s]{20,300}$/.test(key)) throw Error('invalid_api_key');

  const resolvedRoot = allowAnyRoot ? resolve(root) : assertPrivateEvidenceDir(root);
  mkdirSync(resolvedRoot, { recursive: true, mode: 0o700 });

  const fixturesRaw = readFileSync(fixturesPath);
  const fixtureSha256 = digest(fixturesRaw);
  const allCases = JSON.parse(fixturesRaw.toString('utf8'));
  const cases = caseFilter ? allCases.filter(item => caseFilter.includes(item.id)) : allCases;

  const roundDir = join(resolvedRoot, `round-${round}`);
  mkdirSync(roundDir, { recursive: true, mode: 0o700 });

  const incompleteCases = [];
  const usageSummary = {
    round,
    arm,
    revision,
    modelPlanner: AGENT_MODEL,
    modelImage: 'gpt-image-2.6-flare',
    skillCatalogVersion: arm === 'candidate' ? CREATIVE_SKILLS_CATALOG_VERSION : null,
    casesTotal: cases.length,
    casesComplete: 0,
    imagesTotal: 0,
    imagesComplete: 0,
    plannerCalls: 0,
    plannerTokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    imageTokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    perCase: [],
  };

  for (const testCase of cases) {
    const caseDir = join(roundDir, testCase.id);
    mkdirSync(caseDir, { recursive: true, mode: 0o700 });
    const receiptsFile = join(caseDir, 'receipts.json');

    onProgress?.(`[round-${round}/${arm}] Planejando ${testCase.id} (${testCase.format}, ${testCase.expectedFrames} lâmina(s))...`);
    const planResult = await runPlannerSession({ caseDir, testCase, arm, revision, key, fetchApi, sleepFn });
    usageSummary.plannerCalls += 1;
    if (planResult.usage) {
      for (const field of ['input_tokens', 'output_tokens', 'total_tokens']) {
        if (Number.isSafeInteger(planResult.usage[field])) {
          usageSummary.plannerTokens[field] += planResult.usage[field];
        }
      }
    }

    if (planResult.state !== 'complete') {
      incompleteCases.push({
        id: testCase.id,
        stage: 'plan',
        state: planResult.state,
        slots: 'not_submitted',
      });
      usageSummary.perCase.push({
        id: testCase.id,
        format: testCase.format,
        planState: planResult.state,
        framesComplete: 0,
        expectedFrames: testCase.expectedFrames,
      });
      continue;
    }

    const planned = planResult.planned;
    if (testCase.captionIncluded && planned.caption) {
      writeFileSync(join(caseDir, 'caption.txt'), `${planned.caption.trim()}\n`, { mode: 0o600 });
    }

    let anchorImage = null;
    let framesComplete = 0;
    let firstFailureState = null;
    const isMultiFrame = testCase.format === 'carousel' || testCase.format === 'collection';

    for (const frame of planned.frames) {
      usageSummary.imagesTotal += 1;
      if (arm === 'candidate' && isMultiFrame && frame.position > 1 && !anchorImage) {
        firstFailureState = firstFailureState ?? 'anchor_unavailable';
        continue;
      }

      onProgress?.(`[round-${round}/${arm}] Gerando ${testCase.id} frame ${frame.position}/${testCase.expectedFrames}...`);
      const { receipt } = await generateFrame({
        caseDir,
        receiptsFile,
        testCase,
        planned,
        frame,
        arm,
        revision,
        key,
        fetchApi,
        validatePngFn,
        anchorImage: arm === 'candidate' && isMultiFrame && frame.position > 1 ? anchorImage : null,
      });

      if (receipt.state === 'complete') {
        framesComplete += 1;
        usageSummary.imagesComplete += 1;
        if (receipt.usage) {
          for (const field of ['input_tokens', 'output_tokens', 'total_tokens']) {
            if (Number.isSafeInteger(receipt.usage[field])) {
              usageSummary.imageTokens[field] += receipt.usage[field];
            }
          }
        }
        if (arm === 'candidate' && isMultiFrame && frame.position === 1) {
          anchorImage = encodeAnchorFn(join(caseDir, 'frame-1.png'));
        }
      } else {
        firstFailureState = firstFailureState ?? receipt.state;
        if (receipt.httpStatus === 401 || receipt.httpStatus === 403) {
          throw Error(`openai_credentials_rejected:${receipt.httpStatus}`);
        }
      }
    }

    if (framesComplete === testCase.expectedFrames) {
      usageSummary.casesComplete += 1;
    } else {
      incompleteCases.push({
        id: testCase.id,
        stage: 'image',
        state: firstFailureState ?? 'partial',
        slots: `${framesComplete}/${testCase.expectedFrames}`,
      });
    }

    usageSummary.perCase.push({
      id: testCase.id,
      format: testCase.format,
      planState: 'complete',
      framesComplete,
      expectedFrames: testCase.expectedFrames,
    });
  }

  const completeManifest = {
    round,
    revision,
    arm,
    suite: 'extended',
    fixtureSha256,
    skillCatalogVersion: arm === 'candidate' ? CREATIVE_SKILLS_CATALOG_VERSION : null,
    incompleteCases,
  };
  writeAtomic(join(roundDir, 'usage-summary.json'), usageSummary);
  writeOnceJson(join(roundDir, 'complete.json'), completeManifest);
  return { completeManifest, usageSummary };
}

function parseCliArgs(argv) {
  const args = {
    root: null,
    round: null,
    arm: null,
    revision: null,
    fixturesPath: DEFAULT_FIXTURES,
    confirmPaidRun: false,
    keyStdin: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--root') args.root = argv[++i];
    else if (token === '--round') args.round = Number(argv[++i]);
    else if (token === '--arm') args.arm = argv[++i];
    else if (token === '--revision') args.revision = argv[++i];
    else if (token === '--fixtures') args.fixturesPath = resolve(argv[++i]);
    else if (token === '--confirm-paid-run') args.confirmPaidRun = true;
    else if (token === '--key-stdin') args.keyStdin = true;
    else throw Error(`unknown_argument:${token}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.confirmPaidRun) {
    throw Error('paid_run_requires_explicit_--confirm-paid-run_flag');
  }
  const revision = args.revision || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  const key = readApiKeyFromUser({ useStdin: args.keyStdin });
  const { completeManifest, usageSummary } = await runExtendedRound({
    root: args.root,
    round: args.round,
    arm: args.arm,
    revision,
    fixturesPath: args.fixturesPath,
    key,
    onProgress: line => console.error(line),
  });
  console.log(JSON.stringify({ completeManifest, usageSummary }, null, 2));
}

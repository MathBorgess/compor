import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';
import { formatVersion, isDigest, readDocument, readSuite, requireCondition, sha256 } from './protocol.mjs';

const revision = '720628ebc4c32b41ab8fdc0c1b1a4f8f62511a79';
const source = 'scripts/evals/pr61/post/run-extended.mjs';
const profile = 'compor-integral-c0.v1';
const arm = 'candidate';
const catalog = 'compor-creative-skills.v4';
const defaultSlideCount = 4;
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const devSuite = new URL('./dev-cases.json', import.meta.url);
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const git = promisify(execFile);
const json = value => JSON.stringify(value, null, 2) + '\n';
const frameName = index => 'frame-' + index + '.png';
const slideName = index => 'slide-' + String(index).padStart(2, '0') + '.jpg';
const sessionPattern = /^sess_[\w-]{1,128}$/;
const turnPattern = /^turn_[\w-]{1,128}$/;

export const integralControlSha256 = sha256(JSON.stringify({
  revision, source, arm, catalog, profile, defaultSlideCount,
  adapterSha256: sha256(await readFile(new URL(import.meta.url))),
}));

function fixtureFor({ id, briefing, facts, exactSlideCount, direction, brandVoice }) {
  const expectedFrames = exactSlideCount ?? defaultSlideCount;
  requireCondition(Number.isInteger(expectedFrames) && expectedFrames >= 3 && expectedFrames <= 10,
    'Contagem de lâminas inválida para o controle integral.');
  return {
    id, format: 'carousel', expectedFrames, captionIncluded: true,
    context: {
      idea: briefing, offer: '', audience: '', goal: '', direction: direction ?? '',
      ...(brandVoice && { brandVoice }),
      offerFacts: facts.map((value, index) => ({ id: 'f' + (index + 1), label: 'Fato ' + (index + 1), value, status: 'confirmed' })),
    },
  };
}

async function privatePath(path) {
  requireCondition(typeof path === 'string' && isAbsolute(path), 'Informe um caminho privado absoluto.');
  const canonical = await realpath(path);
  const local = relative(await realpath(repository), canonical);
  requireCondition(isAbsolute(local) || local.startsWith('..' + sep), 'Use caminhos privados fora do repositório.');
  return canonical;
}

async function pinnedRunner(directory) {
  const checkout = await privatePath(directory);
  const command = async args => (await git('git', ['-C', checkout, ...args])).stdout.trim();
  const [head, top, dirty] = await Promise.all([
    command(['rev-parse', 'HEAD']), command(['rev-parse', '--show-toplevel']),
    command(['status', '--porcelain', '--untracked-files=all']),
  ]);
  requireCondition(head === revision && await realpath(top) === checkout && dirty === '',
    'O controle integral exige checkout limpo no commit histórico do produto.');
  return import(pathToFileURL(join(checkout, source)));
}

function executionFor(testCase, suiteSha256) {
  return { cycle: 0, caseId: testCase.id, split: 'holdout', suiteSha256, controlOnly: true,
    candidateSha256: integralControlSha256, caseSha256: sha256(JSON.stringify(testCase)) };
}

function briefingKey(value) {
  return value.normalize('NFC').trim();
}

async function freezeHoldout(root, cases, suiteSha256) {
  const ids = cases.map(item => sha256(item.id)).sort();
  const briefings = cases.map(item => sha256(briefingKey(item.briefing))).sort();
  const independent = await readDocument(join(root, 'sealed-independent.json')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (independent) {
    requireCondition(ids.every(id => !independent.value.ids.includes(id))
      && briefings.every(briefing => !independent.value.briefings.includes(briefing)), 'As partições seladas compartilham um caso.');
  }
  const seal = json({ version: formatVersion, split: 'holdout', suiteSha256, ids, briefings });
  const path = join(root, 'sealed-holdout.json');
  try {
    await writeFile(path, seal, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    requireCondition((await readDocument(path)).digest === sha256(seal), 'A suíte diverge da partição congelada neste diretório.');
  }
}

function scopedTransport({ fetchApi, caseDirectory, expectedFrames }) {
  let plannerPosts = 0;
  let imagePosts = 0;
  let uncertain = false;
  const transport = async (target, options) => {
    const url = new URL(target);
    const agents = '/v1/agents/sessions';
    const method = options?.method;
    const permitted = url.origin === 'https://api.openai.com' && options?.redirect === 'error' && !url.username && !url.password;
    requireCondition(permitted, 'Transporte fora do escopo do controle integral.');
    if (method === 'POST' && url.pathname === agents && !url.search) {
      requireCondition(plannerPosts === 0, 'O controle integral admite um envio de planejamento.');
      plannerPosts += 1;
    } else if (method === 'GET') {
      const ledger = (await readDocument(join(caseDirectory, 'plan-ledger.json'))).value;
      requireCondition(sessionPattern.test(ledger.sessionId), 'O planejamento integral ainda não tem sessão identificada.');
      const base = agents + '/' + ledger.sessionId;
      const suffix = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
      requireCondition(suffix === '' || suffix === '/turns' || /^\/turns\/turn_[\w-]{1,128}\/items$/.test(suffix),
        'Leitura desvinculada da sessão do controle integral.');
    } else if (method === 'POST' && !url.search &&
      url.pathname === (imagePosts === 0 ? '/v1/images/generations' : '/v1/images/edits')) {
      requireCondition(plannerPosts === 1 && imagePosts < expectedFrames, 'O controle integral excedeu o teto de imagens.');
      const receipts = (await readDocument(join(caseDirectory, 'receipts.json'))).value;
      const current = receipts[frameName(imagePosts + 1)];
      const previous = Array.from({ length: imagePosts }, (_, index) => receipts[frameName(index + 1)]);
      requireCondition(current?.state === 'submitted' && previous.every(receipt => receipt?.state === 'complete'),
        'A sequência do controle integral exige a imagem anterior confirmada.');
      imagePosts += 1;
    } else {
      throw Error('Operação fora do escopo do controle integral.');
    }
    try {
      const response = await fetchApi(url.href, options);
      if (method === 'POST' && (response.status >= 500 || [408, 425].includes(response.status))) uncertain = true;
      return response;
    } catch (error) {
      if (method === 'POST') uncertain = true;
      throw error;
    }
  };
  return { transport, isUncertain: () => uncertain };
}

async function collectSource(read, fixture, bindingSha256) {
  const files = new Map();
  const file = async name => {
    const bytes = await read(name);
    files.set(name, bytes);
    return bytes;
  };
  const document = async name => JSON.parse(await file(name));
  const [fixtures, complete, ledger, planned, receipts, caption] = await Promise.all([
    document('fixture.json'), document('complete.json'), document('plan-ledger.json'),
    document('plan-original.json'), document('receipts.json'), file('legenda.txt'),
  ]);
  requireCondition(isDeepStrictEqual(fixtures, [fixture]) && complete.round === 0 && complete.suite === 'extended'
    && complete.arm === arm && complete.revision === revision && complete.skillCatalogVersion === catalog
    && complete.fixtureSha256 === sha256(files.get('fixture.json')) && isDeepStrictEqual(complete.incompleteCases, []),
  'O arquivo do controle integral diverge da fixture ou do recibo da rodada.');
  requireCondition([ledger, planned].every(item => item.state === 'complete' && item.arm === arm && item.revision === revision
    && item.model === 'gpt-6.1-terra' && item.catalogVersion === catalog && sessionPattern.test(item.sessionId) && turnPattern.test(item.turnId))
    && ledger.sessionId === planned.sessionId && ledger.turnId === planned.turnId && isDigest(bindingSha256)
    && ledger.bindingHash === bindingSha256 && typeof planned.planned?.caption === 'string'
    && caption.equals(Buffer.from(planned.planned.caption.trim() + '\n'))
    && planned.planned.frames?.length === fixture.expectedFrames
    && Object.keys(receipts).length === fixture.expectedFrames, 'O plano, a legenda ou os recibos do controle integral divergem.');

  const originals = [];
  for (const [offset, frame] of planned.planned.frames.entries()) {
    const index = offset + 1;
    const name = frameName(index);
    const bytes = await file(name);
    const receipt = receipts[name];
    requireCondition(frame.position === index && receipt?.state === 'complete' && receipt.revision === revision
      && receipt.model === 'gpt-image-2.6-flare' && receipt.size === '1024x1280'
      && receipt.anchorUsed === (index > 1) && receipt.httpStatus === 200 && isDigest(receipt.promptSha256)
      && receipt.bytes === bytes.length && receipt.sha256 === sha256(bytes), 'O PNG original diverge do recibo do controle integral.');
    originals.push(bytes);
  }
  const proof = { profile, revision, bindingSha256, fixtureSha256: complete.fixtureSha256,
    captionSha256: sha256(caption), originals: originals.map(sha256) };
  return { files, originals, proof, ledger };
}

async function jpegFromPng(bytes) {
  const sharp = require('sharp');
  const image = sharp(bytes);
  const metadata = await image.metadata();
  requireCondition(metadata.format === 'png' && metadata.width === 1024 && metadata.height === 1280,
    'A imagem original do controle integral precisa ser PNG 4:5 de 1024 × 1280.');
  return image.resize(1080, 1350).withIccProfile('srgb').jpeg({ quality: 92, chromaSubsampling: '4:4:4', progressive: false }).toBuffer();
}

async function sheets(jpegs) {
  const sharp = require('sharp');
  const columns = Math.min(jpegs.length, 4);
  const tiles = await Promise.all(jpegs.map(async (bytes, index) => ({
    input: await sharp(bytes).resize(216, 270).png().toBuffer(),
    left: index % columns * 216, top: Math.floor(index / columns) * 270,
  })));
  const cover = await sharp(jpegs[0]).extract({ left: 34, top: 0, width: 1012, height: 1350 }).resize(270, 360).png().toBuffer();
  const overview = await sharp({ create: { width: columns * 216, height: Math.ceil(jpegs.length / columns) * 270,
    channels: 3, background: '#e9e4de' } }).composite(tiles).png().toBuffer();
  return { 'cover-grid.png': cover, 'contact-sheet.png': overview };
}

async function writeEnvelope(directory, testCase, execution, archive) {
  const jpegs = await Promise.all(archive.originals.map(jpegFromPng));
  const plan = json({ mode: testCase.mode, caption: archive.files.get('legenda.txt').toString('utf8'), integralControl: archive.proof });
  const snapshots = join(directory, 'first-pass');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(snapshots, { mode: 0o700 });
  const files = [...archive.files, ...jpegs.map((bytes, index) => [slideName(index + 1), bytes]),
    ...Object.entries(await sheets(jpegs)), ['plan.json', plan]];
  const artifacts = [];
  for (const [name, bytes] of files) {
    await writeFile(join(snapshots, name), bytes, { flag: 'wx', mode: 0o600 });
    artifacts.push({ file: 'first-pass/' + name, sha256: sha256(bytes) });
  }
  const snapshot = { outcome: 'delivered', inputSha256: sha256(plan), artifacts, slideCount: jpegs.length,
    artSheetApplicable: false, checks: { ART_PURITY: { status: 'not_applicable', evidence: 'Arte integral produzida em um único plano de pixels.' } } };
  const receipt = { version: formatVersion, ...execution, state: 'delivered', integralControl: archive.proof,
    planner: { state: 'completed', model: archive.ledger.model, sessionId: archive.ledger.sessionId,
      turnId: archive.ledger.turnId, promptSha256: archive.proof.bindingSha256 } };
  await writeFile(directory + '.live-receipt.json', json(receipt), { flag: 'wx', mode: 0o600 });
  await writeFile(join(directory, 'qa-manifest.json'), json({ version: formatVersion, caseId: testCase.id, mode: testCase.mode,
    execution, first_pass: snapshot, final: snapshot, repair_count: 0, repairs: [] }), { flag: 'wx', mode: 0o600 });
}

export async function verifyIntegralControlEvidence(directory, manifest, testCase, receipt) {
  const snapshot = manifest.final;
  requireCondition(manifest.repair_count === 0 && snapshot.outcome === 'delivered' && receipt.version === formatVersion
    && receipt.controlOnly === true && receipt.candidateSha256 === integralControlSha256
    && snapshot.artSheetApplicable === false && isDeepStrictEqual(Object.keys(snapshot.checks ?? {}), ['ART_PURITY'])
    && snapshot.checks.ART_PURITY.status === 'not_applicable', 'O controle C0 precisa de evidência integral sem checks de composição.');
  const names = new Set(snapshot.artifacts.map(file => file.file));
  const read = async name => {
    requireCondition(names.has('first-pass/' + name), 'Faltam artefatos de origem no controle integral.');
    return readFile(join(directory, 'first-pass', name));
  };
  const archive = await collectSource(read, fixtureFor(testCase), receipt.planner.promptSha256);
  const jpegs = await Promise.all(archive.originals.map(jpegFromPng));
  const envelopePlan = JSON.parse(await read('plan.json'));
  requireCondition(isDeepStrictEqual(archive.proof, receipt.integralControl) && isDeepStrictEqual(archive.proof, envelopePlan.integralControl)
    && envelopePlan.mode === testCase.mode && envelopePlan.caption === archive.files.get('legenda.txt').toString('utf8')
    && archive.ledger.sessionId === receipt.planner.sessionId && archive.ledger.turnId === receipt.planner.turnId
    && snapshot.slideCount === jpegs.length, 'A proveniência do controle integral diverge da execução.');
  for (const [index, bytes] of jpegs.entries()) {
    requireCondition((await read(slideName(index + 1))).equals(bytes), 'O JPEG comparado diverge do PNG original.');
  }
  for (const [name, bytes] of Object.entries(await sheets(jpegs))) {
    requireCondition((await read(name)).equals(bytes), 'A folha de comparação diverge dos JPEGs do controle.');
  }
}

export async function runIntegralControl({
  key, root, baselineCheckout, suitePath, suiteSha256, caseId, preflightOnly = false, fetchApi = fetch,
}) {
  const [outputRoot, runner, suiteFile] = await Promise.all([privatePath(root), pinnedRunner(baselineCheckout), privatePath(suitePath)]);
  requireCondition((await lstat(outputRoot)).isDirectory(), 'A saída do controle integral precisa ser um diretório.');
  const [{ cases, digest }, dev] = await Promise.all([readSuite(suiteFile, 'holdout', suiteSha256), readSuite(devSuite, 'dev')]);
  requireCondition(new Set(cases.map(item => briefingKey(item.briefing))).size === cases.length
    && cases.every(item => item.id !== 'ext-carousel-ux-dev' && dev.cases.every(known =>
      item.id !== known.id && briefingKey(item.briefing) !== briefingKey(known.briefing))),
  'A reserva repete um caso ou briefing de desenvolvimento.');
  const testCase = cases.find(item => item.id === caseId);
  requireCondition(testCase?.expected === 'deliver_deck', 'Selecione um caso reservado com entrega prevista.');
  const fixture = fixtureFor(testCase);
  const lockPath = join(outputRoot, 'paid-active.json');
  const lock = await lstat(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  requireCondition(!lock, 'Uma execução anterior aguarda reconciliação neste diretório.');
  if (preflightOnly) return { state: 'preflight', caseId, candidateSha256: integralControlSha256,
    revision, maximumPlannerSessions: 1, maximumImages: fixture.expectedFrames };
  requireCondition(/^sk-[^\s]{20,300}$/.test(key ?? ''), 'Credencial inválida.');
  require('sharp');
  const execution = executionFor(testCase, digest);
  const working = join(outputRoot, 'integral-raw', caseId);
  const caseDirectory = join(outputRoot, 'c0', caseId);
  const raw = join(working, 'round-0');
  const legacyCase = join(raw, caseId);
  const req = await runner.buildPlannerRequest(fixture, arm);
  const binding = sha256(JSON.stringify({ arm, revision, instructions: req.instructions, input: req.input }));
  await writeFile(lockPath, json(execution), { flag: 'wx', mode: 0o600 });
  let started = false;
  let reconciled = false;
  try {
    for (const name of ['integral-raw', 'c0']) {
      const path = join(outputRoot, name);
      await mkdir(path, { recursive: true, mode: 0o700 });
      requireCondition(await realpath(path) === path, 'A saída do controle integral está redirecionada.');
    }
    await freezeHoldout(outputRoot, cases, digest);
    await mkdir(working, { mode: 0o700 });
    const fixturesPath = join(working, 'fixture.json');
    await writeFile(fixturesPath, json([fixture]), { flag: 'wx', mode: 0o600 });
    const { transport, isUncertain } = scopedTransport({ fetchApi, caseDirectory: legacyCase, expectedFrames: fixture.expectedFrames });
    started = true;
    const { completeManifest } = await runner.runExtendedRound({
      root: working, round: 0, arm, revision, key, fixturesPath, caseFilter: [caseId], fetchApi: transport,
    });
    if (completeManifest.incompleteCases.length) {
      const { state } = completeManifest.incompleteCases[0];
      reconciled = !isUncertain() && ['failed', 'invalid'].includes(state);
      return { state: reconciled ? 'failed_execution' : 'unknown', caseId, revision };
    }
    const aliases = { 'fixture.json': fixturesPath, 'complete.json': join(raw, 'complete.json'),
      'plan-original.json': join(legacyCase, 'plan.json'), 'legenda.txt': join(legacyCase, 'caption.txt') };
    const archive = await collectSource(name => readFile(aliases[name] ?? join(legacyCase, name)), fixture, binding);
    await writeEnvelope(caseDirectory, testCase, execution, archive);
    reconciled = true;
    return { state: 'delivered', caseId, revision, candidateSha256: integralControlSha256, caseDirectory };
  } finally {
    if (!started || reconciled) await unlink(lockPath);
  }
}

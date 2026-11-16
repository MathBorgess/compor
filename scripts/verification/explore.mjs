import { createServer } from 'node:http';
import { appendFile, chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digestJson, sha256, validateGoal } from './contracts.mjs';

export const CONTROL_SOCKET = '/tmp/compor-verification-control.sock';
const MAX_INPUT_BYTES = 16 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const READ_ACTIONS = new Set(['inspect', 'list-versions']);
const ACTION_FIELDS = Object.freeze({
  inspect: [], close: [], 'create-project': ['title'], 'prepare-post': [], 'name-post': ['name'],
  'confirm-post': [], 'cancel-post': [], edit: ['field', 'value'], save: [], 'list-versions': [],
  'open-version': ['pieceId', 'version'], reopen: [], 'create-turn': ['message'],
  'poll-turn': ['turnRequestId'], 'request-image': ['prompt'],
});

function failure(code, status = 400) { return Object.assign(Error(code), { status }); }
function isBudgetError(error) { return error.status === 429 || /^budget_exhausted(?::|$)/.test(error.message ?? ''); }
function validateCommand(value, runId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid_command');
  if (Object.keys(value).some(key => !['runId', 'requestId', 'action', 'args', 'expectedRevision'].includes(key))) throw failure('unknown_command_field');
  if (value.runId !== runId) throw failure('run_scope_mismatch', 403);
  if (!Object.hasOwn(ACTION_FIELDS, value.action)) throw failure('unknown_action');
  const args = value.args ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw failure('invalid_arguments');
  const fields = ACTION_FIELDS[value.action];
  if (Object.keys(args).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(args, key))) throw failure('invalid_arguments');
  if (JSON.stringify(args).match(/sk-[A-Za-z0-9_-]{20,}/)) throw failure('credentials_not_accepted');
  const mutation = !READ_ACTIONS.has(value.action) && value.action !== 'close';
  if (mutation && !UUID.test(value.requestId ?? '')) throw failure('request_id_required');
  if (value.requestId !== undefined && !UUID.test(value.requestId)) throw failure('invalid_request_id');
  if (mutation && (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0)) throw failure('expected_revision_required');
  for (const [key, entry] of Object.entries(args)) {
    if (key === 'version') { if (!Number.isSafeInteger(entry) || entry < 1) throw failure('invalid_version'); }
    else if (typeof entry !== 'string' || !entry.trim() || entry.length > (['message', 'prompt'].includes(key) ? 8000 : key === 'value' ? 4000 : 200)) throw failure(`invalid_${key}`);
  }
  if (args.pieceId !== undefined && !UUID.test(args.pieceId)) throw failure('invalid_piece_id');
  if (args.turnRequestId !== undefined && !UUID.test(args.turnRequestId)) throw failure('invalid_turn_request_id');
  if (value.action === 'edit' && !['headline', 'price', 'date', 'caption'].includes(args.field)) throw failure('invalid_edit_field');
  return { ...value, args, mutation };
}

async function readCommand(request) {
  if (request.method !== 'POST' || request.url !== '/') throw failure('control_route_not_found', 404);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw failure('json_required', 415);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) throw failure('command_too_large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure('invalid_json'); }
}

function respond(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function productModules() {
  const [driver, state, post, draft] = await Promise.all([
    import('./shared-driver.mjs'), import('../../apps/web/lib/studio-state.ts'),
    import('../../apps/web/lib/studio-post-context.ts'),
    import('../../apps/web/lib/exploration-draft.ts'),
  ]);
  return { ...driver, ...state, ...post, ...draft };
}

export async function serveExploration(ctx, { goal, runId, onClose, onControl, socketPath = CONTROL_SOCKET, loadProductModules = productModules }) {
  validateGoal(goal);
  if (typeof runId !== 'string' || !runId) throw failure('run_id_required');
  const started = Date.now(), receipts = new Map(), turns = new Map(), outputFiles = new Map();
  const observations = { http: { exploration: [] }, db: {}, controller: {}, providerLedger: {}, errors: [] };
  const usage = { actions: 0, requests: 0, cycles: 1, candidates: 1, concurrency: 1 };
  const transcript = join(ctx.runDir, 'exploration-transcript.jsonl');
  let driver, modules, projectId, closed = false, closing = false, queue = Promise.resolve(), watchdog;
  let complete;
  const completion = new Promise(resolve => { complete = resolve; });
  const ledgerStart = ctx.fixture.ledger.length;
  const controlledCtx = { ...ctx,
    request: (...args) => { if (closing) throw failure('exploration_closed', 409); return ctx.request(...args); },
    readBytes: (...args) => { if (closing) throw failure('exploration_closed', 409); return ctx.readBytes(...args); },
  };

  function summary() {
    const state = driver?.getState(), draft = state && modules.getCurrentDraft(state);
    const available = closing ? ['close'] : !driver ? ['inspect', 'create-project', 'close']
      : ['inspect', 'prepare-post', 'name-post', 'confirm-post', 'cancel-post', 'edit', 'save', 'list-versions', 'open-version', 'reopen', 'create-turn', 'poll-turn', 'request-image', 'close'];
    return { runId, goalId: goal.id, projectId: projectId ?? null, revision: state?.revision ?? 0,
      selectedPost: draft ? { pieceId: draft.pieceId, baseVersion: draft.baseVersion, content: draft.content } : null,
      preparation: state?.workflow.pendingPost ?? null, phase: state?.workflow.phase ?? null,
      actions: available, usage: { ...usage, wallTimeMs: Date.now() - started, modelTokens: null, modelCostUsd: null },
      budget: goal.budgets, result: 'not_evaluated', evidence: 'exploration-transcript.jsonl' };
  }

  async function record(entry) {
    await appendFile(transcript, JSON.stringify({ at: new Date().toISOString(), runId, ...entry }) + '\n', { mode: 0o600 });
  }

  async function finish(reason) {
    if (closed) return;
    closing = true; closed = true; clearTimeout(watchdog);
    if (reason !== 'closed_by_client') observations.errors.push({ stage: 'exploration', message: reason });
    // Closing must resolve even when the last state/evidence read fails, so the
    // supervisor can record an inconclusive manifest and perform its cleanup.
    const capture = async (stage, operation) => {
      try { await operation(); }
      catch (error) { observations.errors.push({ stage, message: error instanceof Error ? error.message : String(error) }); }
    };
    let terminal = { reason, runId, goalId: goal.id, result: 'not_evaluated', stateUnavailable: true };
    await capture('exploration-driver-close', () => driver?.close());
    await capture('exploration-ledger', () => { observations.providerLedger.final = structuredClone(ctx.fixture.ledger.slice(ledgerStart)); });
    await capture('exploration-snapshot', () => {
      if (driver) {
        const state = driver.getState(), draft = modules.getCurrentDraft(state), facts = state.offerFacts ?? [];
        observations.identity = { actor: ctx.actorA, projectId, ...(draft ? { pieceId: draft.pieceId } : {}) };
        observations.controller.reopened = draft ? { pieceId: draft.pieceId, baseVersion: draft.baseVersion, content: draft.content,
          facts: facts.filter(fact => fact.status === 'confirmed'), suggestedFacts: facts.filter(fact => fact.status === 'pending') } : {};
      }
      terminal = { reason, ...summary() };
    });
    await capture('exploration-evidence', () => record({ type: 'closed', ...terminal }));
    await capture('exploration-evidence', () => writeFile(join(ctx.runDir, 'exploration-summary.json'), JSON.stringify(terminal, null, 2) + '\n'));
    await capture('exploration-control-close', async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    if (onClose) await capture('exploration-close', () => onClose(terminal));
    complete({ observations, files: [...outputFiles.values()], ...(observations.errors.length ? { errors: observations.errors } : {}) });
  }

  function requireDriver() { if (!driver) throw failure('create_project_first', 409); }
  function currentDraft() {
    requireDriver();
    const draft = modules.getCurrentDraft(driver.getState());
    if (!draft || driver.getState().workflow.pendingPost) throw failure('confirm_post_first', 409);
    return draft;
  }
  function noteHttp(action, response) {
    observations.http.exploration.push({ action, ...response });
    return response;
  }
  function beginIntent() {
    if (!observations.providerLedger.beforeIntent) observations.providerLedger.beforeIntent = structuredClone(ctx.fixture.ledger.slice(ledgerStart));
  }

  async function createTurn(command) {
    const draft = currentDraft(), conversationId = draft.pieceId, message = command.args.message;
    beginIntent();
    driver.change(state => modules.prepareAdjustment(state, { requestId: command.requestId, messageId: ctx.newId(), instruction: message, conversationId, createdAt: new Date().toISOString(), eventId: ctx.newId() }));
    await driver.flush();
    const context = await driver.getChatContext(conversationId);
    turns.set(command.requestId, conversationId);
    return noteHttp('create-turn', await controlledCtx.request(ctx.actorA, '/api/studio/chat', { method: 'POST', body: { projectId, requestId: command.requestId, conversationId, message, context, history: [] } }));
  }

  async function pollTurn(command) {
    requireDriver();
    const requestId = command.args.turnRequestId, conversationId = turns.get(requestId);
    if (!conversationId || currentDraft().pieceId !== conversationId) throw failure('turn_scope_mismatch', 409);
    const result = noteHttp('poll-turn', await controlledCtx.request(ctx.actorA, '/api/studio/chat', { method: 'POST', body: { op: 'poll', projectId, requestId, conversationId } }));
    if (result.body?.status === 'completed' && typeof result.body.text === 'string') {
      driver.change(state => modules.settleAdjustment(state, { requestId, status: 'completed', result: { messageId: ctx.newId(), text: result.body.text }, eventId: ctx.newId(), createdAt: new Date().toISOString() }));
    }
    return result;
  }

  async function requestImage(command) {
    const draft = currentDraft(); beginIntent();
    const response = noteHttp('request-image', await controlledCtx.request(ctx.actorA, '/api/studio/explorations', { method: 'POST', headers: { 'x-compor-exploration-request-id': command.requestId }, body: { projectId, requestId: command.requestId, prompt: command.args.prompt } }));
    observations.providerLedger.afterExplicitRequest = structuredClone(ctx.fixture.ledger.slice(ledgerStart));
    if (response.status !== 200 || response.body?.status !== 'completed') return response;
    const list = noteHttp('list-images', await controlledCtx.request(ctx.actorA, `/api/studio/explorations?projectId=${projectId}`));
    const image = list.body?.images?.find(item => item.id === command.requestId && item.state === 'completed');
    if (!image) throw failure('completed_image_not_observed', 502);
    driver.change(state => modules.recordCompletedExploration(state, draft.pieceId, { imageId: image.id, ordinal: image.ordinal, creationContext: { postContext: modules.postContext(state, draft.pieceId), references: [] } }));
    await driver.creationPorts.retainReferenceProposal(draft.pieceId);
    const result = await controlledCtx.readBytes(ctx.actorA, `/api/studio/explorations/image?projectId=${projectId}&imageId=${image.id}`);
    if (result.status !== 200) throw failure('authenticated_image_not_observed', 502);
    const path = `exploration-${image.id}.png`;
    await writeFile(join(ctx.runDir, path), result.bytes, { flag: 'wx' });
    outputFiles.set(image.id, { id: `image-${image.id}`, path });
    return { ...response, image: { id: image.id, path, sha256: sha256(result.bytes) } };
  }

  async function execute(command) {
    const { action, args } = command;
    if (action === 'inspect') return summary();
    if (action === 'create-project') {
      if (driver) throw failure('project_already_selected', 409);
      const response = noteHttp(action, await controlledCtx.request(ctx.actorA, '/api/projects', { method: 'POST', body: { title: args.title } }));
      if (response.status !== 201 || !UUID.test(response.body?.project?.id ?? '')) return response;
      projectId = response.body.project.id; modules = await loadProductModules();
      driver = await modules.createFileStudioDriver(controlledCtx, { projectId, filename: 'exploration-state.json' });
      return response;
    }
    requireDriver();
    if (action === 'prepare-post') { driver.controller.preparePost(ctx.newId()); return { status: 'prepared' }; }
    if (action === 'name-post') { driver.controller.changePreparation({ name: args.name }); return { status: 'named' }; }
    if (action === 'confirm-post') return driver.controller.confirmPost(driver.creationPorts);
    if (action === 'cancel-post') { driver.controller.cancelPreparation(); return { status: 'cancelled' }; }
    if (action === 'edit') { currentDraft(); driver.controller.editDraft(args); return { status: 'edited' }; }
    if (action === 'save') { currentDraft(); return driver.controller.saveCurrent(driver.savingPorts); }
    if (action === 'list-versions') {
      const versions = await driver.readVersions(); observations.db.versions = await ctx.query(`select project_id,piece_id,version,content from public.piece_versions where project_id='${projectId}' order by piece_id,version`);
      return { versions: versions.map(version => ({ pieceId: version.piece_id, version: version.version, content: version.content })) };
    }
    if (action === 'open-version') {
      const versions = await driver.readVersions(), version = versions.find(item => item.piece_id === args.pieceId && item.version === args.version);
      if (!version) throw failure('version_scope_mismatch', 404);
      driver.controller.openVersion(version, versions); return { status: 'opened' };
    }
    if (action === 'reopen') { await driver.flush(); driver.close(); await driver.reopen(); return { status: 'reopened' }; }
    if (action === 'create-turn') return createTurn(command);
    if (action === 'poll-turn') return pollTurn(command);
    if (action === 'request-image') return requestImage(command);
    throw failure('unknown_action');
  }

  async function dispatch(input) {
    const closeRequested = input?.action === 'close' && input?.runId === runId;
    if (!closeRequested && (usage.requests > goal.budgets.requests || Date.now() - started >= goal.budgets.wallTimeMs)) throw failure('budget_exhausted', 429);
    const command = validateCommand(input, runId);
    if (command.action === 'close') return { status: 200, body: { ok: true, closing: true, ...summary() }, finish: 'closed_by_client' };
    if (closing) throw failure('exploration_closed', 409);
    const fingerprint = digestJson({ action: command.action, args: command.args, expectedRevision: command.expectedRevision ?? null });
    if (command.requestId && receipts.has(command.requestId)) {
      const receipt = receipts.get(command.requestId);
      if (receipt.fingerprint !== fingerprint) throw failure('request_id_conflict', 409);
      return { status: receipt.status, body: { ...receipt.body, replayed: true } };
    }
    if (command.mutation && command.expectedRevision !== (driver?.getState().revision ?? 0)) throw failure('context_changed', 409);
    if (command.mutation && usage.actions >= goal.budgets.actions) throw failure('budget_exhausted', 429);
    if (command.mutation) { usage.actions++; if (onControl) onControl('actions'); }
    await record({ type: 'action', requestId: command.requestId ?? null, action: command.action, args: command.args, revision: driver?.getState().revision ?? 0 });
    let status = 200, body;
    try {
      const result = await execute(command);
      if (driver) await driver.flush();
      if (typeof result?.status === 'number') status = result.status;
      const outcome = typeof result?.status === 'string' ? result.status : result?.result?.status;
      body = { ok: status < 400 && !['unknown', 'unavailable'].includes(outcome), requestId: command.requestId ?? null, action: command.action, result, retryAutomatically: false, state: summary() };
    } catch (error) {
      if (isBudgetError(error)) throw error;
      status = error.status ?? 502;
      body = { ok: false, requestId: command.requestId ?? null, action: command.action, error: error.status ? error.message : 'operation_result_unknown', retryAutomatically: false, state: summary() };
      observations.errors.push({ stage: command.action, message: error.message });
    }
    if (command.requestId) receipts.set(command.requestId, { fingerprint, status, body });
    await record({ type: 'result', status, body });
    return { status, body };
  }

  const server = createServer((request, response) => {
    const operation = queue.then(async () => {
      try {
        usage.requests++;
        if (onControl) onControl('requests');
        if (usage.requests > goal.budgets.requests) throw failure('budget_exhausted', 429);
        const result = await dispatch(await readCommand(request));
        if (result.finish) response.once('finish', () => { void finish(result.finish); });
        respond(response, result.status, result.body);
      } catch (error) {
        const budget = isBudgetError(error);
        if (budget) response.once('finish', () => { void finish(error.message); });
        respond(response, budget ? 429 : error.status ?? 500, { ok: false, error: error.message, retryAutomatically: false, state: summary() });
        await record({ type: 'rejected', error: error.message });
      }
    });
    queue = operation.catch(async error => { observations.errors.push({ stage: 'control', message: error.message }); await finish('control_failed'); });
  });
  server.requestTimeout = 10_000; server.headersTimeout = 5_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  await chmod(socketPath, 0o600);
  await writeFile(join(ctx.runDir, 'control-ready.json'), JSON.stringify({ runId, goalId: goal.id, socketPath, actions: ACTION_FIELDS, budgets: goal.budgets }, null, 2) + '\n');
  watchdog = setTimeout(() => { closing = true; void queue.then(() => finish('budget_exhausted:wallTimeMs'), () => finish('budget_exhausted:wallTimeMs')); }, goal.budgets.wallTimeMs);
  server.unref();
  return completion;
}

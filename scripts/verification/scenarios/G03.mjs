function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw Error('scenario requires a UUID from the real route');
  return value;
}

function generate(ctx, projectId, requestId, prompt) {
  return ctx.request(ctx.actorA, '/api/studio/explorations', {
    method: 'POST', headers: { 'x-compor-exploration-request-id': requestId }, body: { projectId, requestId, prompt },
  });
}

function persistedRows(ctx, requestId) {
  return ctx.query(`select id, owner_id, project_id, state, ordinal from public.exploration_images where id='${uuid(requestId)}' order by id`);
}

function reopenedProjection(reply, requestId) {
  const record = reply.body?.images?.find(image => image.id === requestId);
  // This is a name projection of the real authenticated GET, not the privileged SQL oracle.
  return record ? { operationId: record.id, status: record.state } : {};
}

export async function runG03(ctx) {
  const http = {}, db = {}, providerLedger = {}, controller = {};
  http.createProject = await ctx.request(ctx.actorA, '/api/projects', { method: 'POST', body: { title: 'G03 — confirmação perdida sintética' } });
  const projectId = uuid(http.createProject.body?.project?.id);
  const persistedId = uuid(ctx.newId());
  const persistedPrompt = 'Efeito sintético persistido antes de perder a confirmação.';
  const persistedLedgerStart = ctx.fixture.ledger.filter(entry => entry.kind === 'image').length;
  ctx.fixture.setFault('loseCompletionReply');
  http.persistedReplyLost = await generate(ctx, projectId, persistedId, persistedPrompt);
  db.persistedBeforeReopen = await persistedRows(ctx, persistedId);
  providerLedger.persistedBeforeReopen = structuredClone(ctx.fixture.ledger.filter(entry => entry.kind === 'image').slice(persistedLedgerStart));
  http.persistedReopen = await ctx.request(ctx.actorA, `/api/studio/explorations?projectId=${projectId}`);
  controller.persistedReopened = reopenedProjection(http.persistedReopen, persistedId);
  http.persistedReplay = await generate(ctx, projectId, persistedId, persistedPrompt);
  db.persistedAfterReopen = await persistedRows(ctx, persistedId);
  providerLedger.persistedAfterReopen = structuredClone(ctx.fixture.ledger.filter(entry => entry.kind === 'image').slice(persistedLedgerStart));

  const unknownId = uuid(ctx.newId());
  const unknownPrompt = 'Efeito sintético no provedor cuja resposta não chega ao produto.';
  const unknownLedgerStart = ctx.fixture.ledger.filter(entry => entry.kind === 'image').length;
  ctx.fixture.setFault('loseProviderReply');
  http.providerReplyLost = await generate(ctx, projectId, unknownId, unknownPrompt);
  providerLedger.unknownBeforeReopen = structuredClone(ctx.fixture.ledger.filter(entry => entry.kind === 'image').slice(unknownLedgerStart));
  db.unknownBeforeReopen = await persistedRows(ctx, unknownId);
  http.unknownReopen = await ctx.request(ctx.actorA, `/api/studio/explorations?projectId=${projectId}`);
  controller.providerLostAfterReopen = reopenedProjection(http.unknownReopen, unknownId);
  http.unknownReplay = await generate(ctx, projectId, unknownId, unknownPrompt);
  http.unknownNewRequest = await generate(ctx, projectId, uuid(ctx.newId()), 'Novo pedido sintético após resultado desconhecido.');
  http.unknownFinalRead = await ctx.request(ctx.actorA, `/api/studio/explorations?projectId=${projectId}`);
  db.unknownAfterReopen = await persistedRows(ctx, unknownId);
  db.unknownAssets = await ctx.query(`select id, bucket_id, name from storage.objects where name like '%/${unknownId}.png' order by id`);
  providerLedger.unknownAfterReopen = structuredClone(ctx.fixture.ledger.filter(entry => entry.kind === 'image').slice(unknownLedgerStart));
  return { observations: { http, db, providerLedger, controller }, files: [] };
}

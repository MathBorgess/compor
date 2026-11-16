import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../contracts.mjs';

function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw Error('scenario requires a UUID from the real route');
  return value;
}

function generate(ctx, projectId, requestId, prompt) {
  return ctx.request(ctx.actorA, '/api/studio/explorations', {
    method: 'POST', headers: { 'x-compor-exploration-request-id': requestId }, body: { projectId, requestId, prompt },
  });
}

async function snapshot(ctx, projectId) {
  return {
    projects: await ctx.query(`select id, owner_id, title, revision from public.projects where id='${uuid(projectId)}' order by id`),
    assets: await ctx.query(`select id, bucket_id, name, owner from storage.objects where name like '%/${uuid(projectId)}/%' order by id`),
  };
}

async function waitForHeldDispatch(ctx, count, completed) {
  const deadline = Date.now() + 10_000;
  while (ctx.fixture.ledger.filter(entry => entry.kind === 'image').length === count) {
    const early = completed();
    if (early) throw Error(`first concurrent request ended before provider dispatch: ${early.error ?? early.status}`);
    if (Date.now() >= deadline) throw Error('provider dispatch was not observed before the concurrency deadline');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

export async function runG02(ctx) {
  const http = {};
  http.createProject = await ctx.request(ctx.actorA, '/api/projects', { method: 'POST', body: { title: 'G02 — isolamento sintético' } });
  const projectId = uuid(http.createProject.body?.project?.id);
  const ownerImageId = uuid(ctx.newId());
  http.ownerGeneration = await generate(ctx, projectId, ownerImageId, 'Imagem sintética exclusiva da conta A para verificar isolamento.');
  const ownerImagePath = `/api/studio/explorations/image?projectId=${projectId}&imageId=${ownerImageId}`;
  const ownerImage = await ctx.readBytes(ctx.actorA, ownerImagePath);
  if (ownerImage.status !== 200 || !ownerImage.bytes?.length) throw Error(`owner image prerequisite unavailable: ${ownerImage.status}`);
  await writeFile(join(ctx.runDir, 'owner-image.png'), ownerImage.bytes);
  const db = { beforeAttack: await snapshot(ctx, projectId) };

  http.readProjectAsB = await ctx.request(ctx.actorB, `/api/pieces?projectId=${projectId}`);
  http.writeProjectAsB = await ctx.request(ctx.actorB, '/api/projects', { method: 'PATCH', body: { projectId, title: 'Escrita não autorizada da conta B', expectedRevision: http.createProject.body.project.revision } });
  const deniedImage = await ctx.readBytes(ctx.actorB, ownerImagePath);
  http.readAssetAsB = { status: deniedImage.status, byteLength: deniedImage.bytes?.length ?? 0 };
  db.afterAttack = await snapshot(ctx, projectId);

  const firstId = uuid(ctx.newId()), secondId = uuid(ctx.newId());
  const beforeConcurrentDispatches = ctx.fixture.ledger.filter(entry => entry.kind === 'image').length;
  ctx.fixture.setFault('holdImage');
  let firstResult;
  const first = generate(ctx, projectId, firstId, 'Primeiro pedido concorrente sintético.').then(result => {
    firstResult = result; return result;
  }, error => {
    firstResult = { error: error.message }; return firstResult;
  });
  try {
    await waitForHeldDispatch(ctx, beforeConcurrentDispatches, () => firstResult);
    http.concurrentSecond = await generate(ctx, projectId, secondId, 'Segundo pedido concorrente sintético.');
  } finally {
    ctx.fixture.releaseImage();
    http.concurrentFirst = await first;
  }
  db.reservationRows = await ctx.query(`select id, owner_id, project_id, state from public.exploration_images where id in ('${firstId}','${secondId}') order by id`);
  const providerLedger = { reservationDispatches: structuredClone(ctx.fixture.ledger.filter(entry => entry.kind === 'image').slice(beforeConcurrentDispatches)) };
  return {
    observations: { http, db, providerLedger, files: { ownerImageSha256: sha256(ownerImage.bytes) } },
    files: [{ id: 'owner-image', path: 'owner-image.png' }],
  };
}

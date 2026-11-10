import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceRoutes } from '../lib/piece-route.ts';
const projectId = '11111111-1111-4111-8111-111111111111';
const pieceId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const content = { headline: 'Oficina', price: 'R$ 20', date: 'Amanhã', caption: 'Inscreva-se', captionOrigin: 'user' };
const actor = { userId, token: 'fake-user-token' };
const request = body => new Request('https://compor.test/api/pieces', { method: 'POST', headers: { origin: 'https://compor.test', 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('salva com token da pessoa e preserva conflito de versão', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async (a, p) => a.userId === userId && p === projectId, pieceStore: { save: async (context, input) => { calls++; assert.equal(context.token, actor.token); assert.deepEqual(input, { projectId, pieceId, expectedVersion: 1, content }); return { status: 'conflict', currentVersion: 2 }; } } });
  const result = await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }));
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { status: 'conflict', currentVersion: 2 });
  assert.equal(calls, 1);
});

test('não lê nem grava projeto de outra pessoa', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async () => false, pieceStore: { listProject: async () => { calls++; }, save: async () => { calls++; } } });
  assert.equal((await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`))).status, 404);
  assert.equal((await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }))).status, 404);
  assert.equal(calls, 0);
});

test('lista versões com metadata pelo RPC autorizado e rejeita projeto divergente', async () => {
  const { createProjectPieceStore } = await import('../lib/piece-store.ts');
  let upstream;
  const row = { project_id: projectId, piece_id: pieceId, version: 1, content, created_at: '2026-11-03T00:00:00Z', metadata: {baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}} };
  const store = createProjectPieceStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => { upstream = { url, options }; return Response.json([row]); } });
  const routes = createPieceRoutes({ resolveActor: async () => actor, ownsProject: async () => true, pieceStore: store });
  const response = await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).versions, [row]);
  assert.equal(upstream.options.headers.authorization, 'Bearer fake-user-token');
  assert.equal(upstream.url.pathname,'/rest/v1/rpc/list_project_piece_versions_v2');
  assert.deepEqual(JSON.parse(upstream.options.body),{p_project_id:projectId});
  row.project_id = 'outra-pessoa';
  const denied = await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  assert.equal(denied.status, 503);
  assert.doesNotMatch(await denied.text(), /Inscreva-se|fake-user-token/);
});

test('base explícita e aprovação usam contratos distintos sem aceitar aprovação inventada',async()=>{
 let saved,approved;
 const routes=createPieceRoutes({appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsProject:async()=>true,pieceStore:{
  save:async(context,input)=>{saved=input;assert.equal(context.token,actor.token);return {status:'saved'};},
  approve:async(context,input)=>{approved=input;assert.equal(context.token,actor.token);return {status:'conflict',currentRevision:1};}
 }});
 assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content}))).status,200);
 assert.deepEqual(saved,{projectId,pieceId,expectedVersion:3,baseVersion:1,content});
 assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content,approval:{status:'approved'}}))).status,400);
 const patch=body=>new Request('https://compor.test/api/pieces',{method:'PATCH',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await routes.PATCH(patch({operation:'approve',projectId,pieceId,version:2,expectedRevision:0}))).status,409);
 assert.deepEqual(approved,{projectId,pieceId,version:2,expectedRevision:0});
 const references=[{kind:'pinterest',originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography'},{kind:'generated',projectId,imageId:pieceId}];
 assert.equal((await routes.PATCH(patch({operation:'approve',projectId,pieceId,version:2,expectedRevision:0,references}))).status,409);
 assert.deepEqual(approved.references,references);
 assert.equal((await routes.PATCH(patch({operation:'approve',projectId,pieceId,version:2,expectedRevision:0,references:[{...references[0],approvedVersions:100}]}))).status,400);
 assert.equal((await routes.PATCH(patch({operation:'approve',projectId,pieceId,version:2,expectedRevision:0,approvedBy:userId}))).status,400);
});

test('falha após envio retorna resultado desconhecido sem retry', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async () => true, pieceStore: { save: async () => { calls++; throw new Error('provider secret'); } } });
  const response = await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});

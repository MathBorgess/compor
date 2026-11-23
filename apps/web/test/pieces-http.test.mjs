import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {carouselPlanJson} from '../lib/carousel-plan-json.ts';
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
  assert.equal(upstream.url.pathname,'/rest/v1/rpc/list_project_piece_versions_v3');
  assert.deepEqual(JSON.parse(upstream.options.body),{p_project_id:projectId});
  row.project_id = 'outra-pessoa';
  const denied = await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  assert.equal(denied.status, 503);
  assert.doesNotMatch(await denied.text(), /Inscreva-se|fake-user-token/);
});

test('salva um Story sem base explícita usando a revisão esperada e preserva o formato', async () => {
  const { createProjectPieceStore } = await import('../lib/piece-store.ts');
  const story = { ...content, format: 'story' };
  const row = { project_id: projectId, piece_id: pieceId, version: 2, content: story, created_at: '2026-11-21T00:00:00Z', metadata: {baseVersion:1,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}} };
  const store = createProjectPieceStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => {
    assert.equal(url.pathname, '/rest/v1/rpc/save_piece_version_v2');
    assert.equal(options.headers.authorization, 'Bearer fake-user-token');
    assert.deepEqual(JSON.parse(options.body), { p_project_id:projectId, p_piece_id:pieceId, p_expected_version:1, p_base_version:1, p_content:story });
    return Response.json({status:'saved',version:row});
  } });
  const routes = createPieceRoutes({ appOrigin:'https://compor.test', resolveActor:async () => actor, ownsProject:async () => true, pieceStore:store });
  const response = await routes.POST(request({ projectId, pieceId, expectedVersion:1, content:story }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status:'saved', version:row });
});

test('aceita o plano de carrossel e rejeita lâminas em um Story antes de gravar', async () => {
  const frames = [1, 2, 3].map(position => ({
    id:`22222222-2222-4222-8222-22222222222${position}`,
    position, role:'', headline:'', body:'', visualCue:'', assetId:null,
  }));
  const carousel = { ...content, format:'carousel', visualInvariants:'Mesma tipografia', frames };
  const calls = [];
  const routes = createPieceRoutes({ appOrigin:'https://compor.test', resolveActor:async () => actor, ownsProject:async () => true, pieceStore:{
    save:async (_context, input) => { calls.push(input); return {status:'saved'}; },
  } });
  const version = { projectId, pieceId, expectedVersion:1, baseVersion:1 };
  assert.equal((await routes.POST(request({ ...version, content:carousel }))).status, 200);
  assert.equal((await routes.POST(request({ ...version, content:{ ...carousel, format:'story' } }))).status, 400);
  assert.deepEqual(calls, [{ ...version, content:carousel }]);
});

test('salva e lista carrossel composto sem perder a leitura da versão legada', async () => {
  const {createProjectPieceStore} = await import('../lib/piece-store.ts');
  const frames = [1, 2, 3].map(position => ({
    id: `44444444-4444-4444-8444-44444444444${position}`,
    position, role: '', headline: `Lâmina ${position}`, body: position === 2 ? 'Texto de apoio' : '', visualCue: '',
    assetId: `55555555-5555-5555-8555-55555555555${position}`,
  }));
  const slides = frames.map(({id, position, headline, body}) => ({
    id, layout: position === 3 ? 'cta_closing' : 'native_serial', headline, alt: `Descrição da lâmina ${position}`,
    ...(body ? {body} : {}),
  }));
  const {caption} = content;
  const mode = 'native_serial';
  const planSha256 = createHash('sha256').update(carouselPlanJson({mode, slides, caption})).digest('hex');
  const carouselPlan = {mode, slides: slides.map(({id, layout, alt}) => ({frameId: id, layout, alt}))};
  const carouselRender = {planSha256, frames: slides.map(({id, alt}, index) => ({
    frameId: id, alt, sha256: createHash('sha256').update(`jpeg-${index}`).digest('hex'),
  }))};
  const legacy = {...content, format: 'carousel', frames};
  const governed = {...legacy, carouselPlan, carouselRender};
  const legacyRow = {
    project_id: projectId, piece_id: pieceId, version: 1, content: legacy, created_at: '2026-11-21T00:00:00Z',
    metadata: {baseVersion: null, revision: 0, approval: {status: 'unapproved', kind: null, sourceVersion: null, at: null}},
  };
  const savedRow = {...legacyRow, version: 2, content: governed, metadata: {...legacyRow.metadata, baseVersion: 1}};
  const store = createProjectPieceStore({url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer fake-user-token');
    if (url.pathname === '/rest/v1/rpc/save_piece_version_v2') {
      const submitted = JSON.parse(options.body);
      const expectedVersion = submitted.p_expected_version === 0 ? 0 : 1;
      assert.deepEqual(submitted, {
        p_project_id: projectId, p_piece_id: pieceId, p_expected_version: expectedVersion,
        p_base_version: expectedVersion, p_content: expectedVersion === 0 ? legacy : governed,
      });
      return Response.json({status: 'saved', version: expectedVersion === 0 ? legacyRow : savedRow});
    }
    assert.equal(url.pathname, '/rest/v1/rpc/list_project_piece_versions_v3');
    return Response.json([savedRow, legacyRow]);
  }});
  const routes = createPieceRoutes({appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async () => true, pieceStore: store});
  const load = () => routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  const first = await routes.POST(request({projectId, pieceId, baseVersion: 0, expectedVersion: 0, content: legacy}));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {status: 'saved', version: legacyRow});
  const saved = await routes.POST(request({projectId, pieceId, baseVersion: 1, expectedVersion: 1, content: governed}));
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {status: 'saved', version: savedRow});
  const listed = await load();
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).versions, [savedRow, legacyRow]);

  savedRow.content = {...governed, carouselRender: {...carouselRender, planSha256: 'a'.repeat(64)}};
  const corrupted = await load();
  assert.equal(corrupted.status, 503);
  assert.doesNotMatch(await corrupted.text(), /Lâmina|fake-user-token/);
});

test('base explícita e aprovação usam contratos distintos sem aceitar aprovação inventada',async()=>{
 let saved,approved;
 const routes=createPieceRoutes({appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsProject:async()=>true,pieceStore:{
  save:async(context,input)=>{saved=input;assert.equal(context.token,actor.token);return {status:'saved'};},
  approve:async(context,input)=>{approved=input;assert.equal(context.token,actor.token);return {status:'conflict',currentRevision:1};}
 }});
 assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content}))).status,200);
 assert.deepEqual(saved,{projectId,pieceId,expectedVersion:3,baseVersion:1,content});
 assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content,operation:'edit',changedDimension:'style'}))).status,200);
 assert.deepEqual(saved,{projectId,pieceId,expectedVersion:3,baseVersion:1,content,operation:'edit',changedDimension:'style'});
 for(const changedDimension of ['major','estilo',null])assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content,operation:'edit',changedDimension}))).status,400);
 assert.equal((await routes.POST(request({projectId,pieceId,expectedVersion:3,baseVersion:1,content,changedDimension:'style'}))).status,400);
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

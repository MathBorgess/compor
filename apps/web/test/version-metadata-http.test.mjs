import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectPieceStore } from '../lib/piece-store.mjs';
import { createWebProjectStore } from '../lib/project-store.mjs';
import { createProjectRoutes } from '../lib/project-route.mjs';

const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333';
const context={actor:{userId},token:'token-user'},content={headline:'Peça',price:'',date:'',caption:'Legenda',captionOrigin:'user'};
const version={project_id:projectId,piece_id:pieceId,version:3,content,created_at:'2026-11-05T00:00:00Z',metadata:{baseVersion:1,revision:0,approval:{status:'approved',kind:'inherited',sourceVersion:1,at:'2026-11-05T00:00:00Z'}}};

test('save v2 mantém base e revisão esperada; aprovação é consultada do servidor',async()=>{
 let call,response={status:'saved',version};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async(url,options)=>{call={url,options};return Response.json(response);}});
 const input={projectId,pieceId,expectedVersion:2,baseVersion:1,content};
 assert.deepEqual(await store.save(context,input),response);
 assert.equal(call.url.pathname,'/rest/v1/rpc/save_piece_version_v2');assert.equal(call.options.headers.authorization,'Bearer token-user');
 assert.deepEqual(JSON.parse(call.options.body),{p_project_id:projectId,p_piece_id:pieceId,p_expected_version:2,p_base_version:1,p_content:content});
 response={status:'saved',version:{...version,metadata:{...version.metadata,baseVersion:2}}};await assert.rejects(()=>store.save(context,input));
 response={status:'approved',version:{...version,metadata:{...version.metadata,revision:1,approval:{status:'approved',kind:'explicit',sourceVersion:3,at:'2026-11-05T00:00:00Z'}}}};
 assert.equal((await store.approve(context,{projectId,pieceId,version:3,expectedRevision:0})).status,'approved');
 assert.equal(call.url.pathname,'/rest/v1/rpc/approve_piece_version');
 response={status:'approved',version:{...version,project_id:'outra-conta'}};await assert.rejects(()=>store.approve(context,{projectId,pieceId,version:3,expectedRevision:0}));
});

test('projetos incluem revisão e rename mantém token e precondição; erros ficam incertos',async()=>{
 let call;
 const project={id:projectId,owner_id:userId,title:'Oficina',created_at:'2026-11-05T00:00:00Z',revision:1};
 const store=createWebProjectStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async(url,options)=>{call={url,options};return Response.json([project]);}});
 assert.equal((await store.list(context))[0].revision,1);assert.equal(call.url.searchParams.get('owner_id'),`eq.${userId}`);
 project.owner_id='outra';await assert.rejects(()=>store.list(context));
 const actor={userId,token:'token-user'};let changes=0;
 const routes=createProjectRoutes({appOrigin:'https://compor.test',resolveActor:async()=>actor,projectStore:{rename:async(ctx,input)=>{changes++;assert.deepEqual(ctx,context);assert.deepEqual(input,{projectId,title:'Nome novo',expectedRevision:1});return {status:'conflict',currentRevision:2};}}});
 const patch=(body,origin='https://compor.test')=>new Request('https://compor.test/api/projects',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await routes.PATCH(patch({projectId,title:' Nome novo ',expectedRevision:1}))).status,409);
 assert.equal((await routes.PATCH(patch({projectId,title:'Nome novo',expectedRevision:1},'https://outro.test'))).status,403);
 assert.equal((await routes.PATCH(patch({projectId,title:'Nome novo',expectedRevision:1,ownerId:userId}))).status,400);assert.equal(changes,1);
 const uncertain=createProjectRoutes({appOrigin:'https://compor.test',resolveActor:async()=>actor,projectStore:{rename:async()=>{throw Error('secret-provider-content');}}});
 const response=await uncertain.PATCH(patch({projectId,title:'Nome novo',expectedRevision:1}));assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'result_unknown',retryAutomatically:false});
});

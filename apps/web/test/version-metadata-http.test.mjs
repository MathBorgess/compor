import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectPieceStore } from '../lib/piece-store.ts';
import { createWebProjectStore } from '../lib/project-store.ts';
import { createProjectRoutes } from '../lib/project-route.ts';

const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333';
const context={actor:{userId},token:'token-user'},content={headline:'Peça',price:'',date:'',caption:'Legenda',captionOrigin:'user'};
const version={project_id:projectId,piece_id:pieceId,version:3,content,created_at:'2026-11-05T00:00:00.000Z',metadata:{baseVersion:1,revision:0,approval:{status:'approved',kind:'inherited',sourceVersion:1,at:'2026-11-05T00:00:00.000Z'}}};

test('save v2 mantém base e revisão esperada; aprovação é consultada do servidor',async()=>{
 let call,response={status:'saved',version};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async(url,options)=>{call={url,options};return Response.json(response);}});
 const input={projectId,pieceId,expectedVersion:2,baseVersion:1,content};
 assert.deepEqual(await store.save(context,input),response);
 assert.equal(call.url.pathname,'/rest/v1/rpc/save_piece_version_v2');assert.equal(call.options.headers.authorization,'Bearer token-user');
 assert.deepEqual(JSON.parse(call.options.body),{p_project_id:projectId,p_piece_id:pieceId,p_expected_version:2,p_base_version:1,p_content:content});
 response={status:'saved',version:{...version,metadata:{...version.metadata,baseVersion:2}}};await assert.rejects(()=>store.save(context,input));
 response={status:'approved',version:{...version,metadata:{...version.metadata,revision:1,approval:{status:'approved',kind:'explicit',sourceVersion:3,at:'2026-11-05T00:00:00.000Z'}}}};
 assert.equal((await store.approve(context,{projectId,pieceId,version:3,expectedRevision:0})).status,'approved');
 assert.equal(call.url.pathname,'/rest/v1/rpc/approve_piece_version');
 const references=[{kind:'pinterest',originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography'}];
 assert.equal((await store.approve(context,{projectId,pieceId,version:3,expectedRevision:0,references})).status,'approved');
 assert.equal(call.url.pathname,'/rest/v1/rpc/approve_piece_version_with_references');
 assert.deepEqual(JSON.parse(call.options.body),{p_project_id:projectId,p_piece_id:pieceId,p_version:3,p_expected_revision:0,p_references:references});
 response={status:'approved',version:{...version,project_id:'outra-conta'}};await assert.rejects(()=>store.approve(context,{projectId,pieceId,version:3,expectedRevision:0}));
});

test('projetos incluem revisão e rename mantém token e precondição; erros ficam incertos',async()=>{
 let call;
 const project={id:projectId,owner_id:userId,title:'Oficina',created_at:'2026-11-05T00:00:00.000Z',revision:1};
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


test('normaliza timestamps reais do PostgREST na listagem, aprovação e salvamento',async()=>{
 const raw='2026-11-05T12:49:20.123456+00:00',canonical='2026-11-05T12:49:20.123Z';
 const row={...version,metadata:{...version.metadata,approval:{...version.metadata.approval,at:raw}}};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async url=>Response.json(url.pathname.includes('list_project')?[row]:url.pathname.includes('approve')?{status:'approved',version:{...row,metadata:{...row.metadata,revision:1,approval:{...row.metadata.approval,kind:'explicit',sourceVersion:3}}}}:{status:'saved',version:row})});
 const listed=(await store.listProject(context,projectId))[0];assert.equal(listed.metadata.approval.at,canonical);
 assert.equal((await store.approve(context,{projectId,pieceId,version:3,expectedRevision:0})).version.metadata.approval.at,canonical);
 assert.equal((await store.save(context,{projectId,pieceId,baseVersion:1,expectedVersion:2,content})).version.metadata.approval.at,canonical);
 const {createStudioState,selectVersion,approveDraft}=await import('../lib/studio-state.ts');
 let state=selectVersion(createStudioState({userId,projectId}),{pieceId,version:3,latestVersion:3,content,approval:listed.metadata.approval});
 state=approveDraft(state,{at:canonical,eventId:'44444444-4444-4444-8444-444444444444'});assert.equal(state.drafts[0].approval.at,canonical);
});

test('versões com campos dinâmicos mantêm valores e versões legadas seguem legíveis',async()=>{
 const fields=[{id:'44444444-4444-4444-8444-444444444444',label:'Local',value:'Ateliê central',origin:'user'}];
 const dynamicContent={...content,fields};const row={...version,content:dynamicContent};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async url=>Response.json(url.pathname.includes('list_project')?[version,row]:{status:'saved',version:row})});
 const rows=await store.listProject(context,projectId);assert.equal(rows[0].content.fields,undefined);assert.deepEqual(rows[1].content.fields,fields);
 const saved=await store.save(context,{projectId,pieceId,baseVersion:1,expectedVersion:2,content:dynamicContent});assert.deepEqual(saved.version.content.fields,fields);
});
test('salvar imagem transmite dimensão e recusa uma variante que herda aprovação',async()=>{
 let call;
 const row={...version,metadata:{...version.metadata,changedDimension:'style',operation:'edit',approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async(url,options)=>{call={url,options};return Response.json({status:'saved',version:row});}});
 const input={projectId,pieceId,expectedVersion:2,baseVersion:1,content,operation:'edit',changedDimension:'style'};
 assert.equal((await store.save(context,input)).version.metadata.changedDimension,'style');
 assert.equal(call.url.pathname,'/rest/v1/rpc/save_piece_version_v3');
 assert.equal(JSON.parse(call.options.body).p_changed_dimension,'style');
 row.metadata.approval=version.metadata.approval;await assert.rejects(()=>store.save(context,input),/invalid image metadata/);
});


test('aprovação com referências aceita resposta legada e recarrega a dimensão da variante',async()=>{
 const calls=[],references=[{kind:'pinterest',originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography'}];
 const variant={...version,metadata:{...version.metadata,changedDimension:'composition',operation:'edit',approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}};
 const explicit={status:'approved',kind:'explicit',sourceVersion:3,at:'2026-11-10T00:00:00.000Z'};
 const store=createProjectPieceStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetchImpl:async(url,options)=>{
  calls.push({path:url.pathname,body:JSON.parse(options.body)});
  if(url.pathname.endsWith('/save_piece_version_v3'))return Response.json({status:'saved',version:variant});
  if(url.pathname.endsWith('/approve_piece_version_with_references'))return Response.json({status:'approved',version:{...variant,metadata:{baseVersion:1,revision:1,approval:explicit}}});
  return Response.json([{...version,version:1,metadata:{baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}}, {...variant,metadata:{...variant.metadata,revision:1,approval:explicit}}]);
 }});
 const saved=await store.save(context,{projectId,pieceId,expectedVersion:2,baseVersion:1,content,operation:'edit',changedDimension:'composition'});
 assert.equal(saved.version.metadata.approval.status,'unapproved');
 const approved=await store.approve(context,{projectId,pieceId,version:3,expectedRevision:0,references});
 assert.equal(approved.version.metadata.changedDimension,undefined,'a RPC anterior mantém a forma de resposta');
 const listed=await store.listProject(context,projectId);
 const {groupVariants}=await import('../lib/studio-variants.ts');
 assert.deepEqual(groupVariants(listed,pieceId).map(group=>[group.latest.version,group.dimension]),[[1,null],[3,'composition']]);
 assert.equal(listed[1].metadata.approval.kind,'explicit');
 assert.deepEqual(calls.map(call=>call.path.split('/').at(-1)),['save_piece_version_v3','approve_piece_version_with_references','list_project_piece_versions_v3']);
 assert.deepEqual(calls[1].body.p_references,references,'as fontes próprias continuam no contrato de aprovação da variante');
});

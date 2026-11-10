import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReferenceFeed,boardAffinities,searchReferences} from '../lib/reference-exploration.ts';
import {createReferenceSearchRoute,createReferenceSignalsRoute,createReferenceHistoryRoute} from '../lib/reference-exploration-route.ts';
const projectId='00000000-0000-4000-8000-000000000001',otherProject='00000000-0000-4000-8000-000000000002';
const board='behance/typography', originUrl='https://www.pinterest.com/pin/12345/',previewUrl='https://i.pinimg.com/236x/aa/bb/image.jpg';
const signal={id:'00000000-0000-4000-8000-000000000003',projectId,originUrl,board,action:'selected',comment:'',supersedes:null,createdAt:'2026-11-06T12:00:00.000Z'};
const feed=`<rss><channel><item><title>Tipografia acolhedora</title><link>${originUrl}</link><description><![CDATA[<img src="${previewUrl}">]]></description></item><item><title>ataque</title><link>http://localhost/pin/12345/</link><description>https://i.pinimg.com/a.jpg</description></item></channel></rss>`;
const origin='http://localhost:3000';
const request=body=>new Request(`${origin}/api/studio/references`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});

test('apresenta somente pins individuais com prévias de host permitido',()=>{
  assert.deepEqual(parseReferenceFeed(feed,board),[{id:'12345',title:'Tipografia acolhedora',board,originUrl,previewUrl}]);
  assert.deepEqual(parseReferenceFeed(feed.replaceAll('i.pinimg.com','evil.example'),board),[]);
});
test('usa sinais explícitos vigentes sem contar múltiplas vezes a mesma referência',()=>{
  const correction={...signal,id:'00000000-0000-4000-8000-000000000004',action:'rejected',supersedes:signal.id,createdAt:'2026-11-06T12:01:00.000Z'};
  const comment={...signal,id:'00000000-0000-4000-8000-000000000005',action:'comment',comment:'gosto do contraste',createdAt:'2026-11-06T12:02:00.000Z'};
  assert.deepEqual(boardAffinities([signal,correction,comment]),[{board,positive_actions:0,total_impressions:1,affinity_score:1/3}]);
});
test('busca restrita a boards do catálogo e não envia briefing ao provedor',async()=>{
  const urls=[];const result=await searchReferences({query:'tipografia informação privada',signals:[],fetchApi:async url=>{urls.push(String(url));return new Response(feed,{status:200});}});
  assert.equal(result.status,'ok');assert.ok(result.references.length>0);assert.ok(urls.length>0);
  assert.ok(urls.every(url=>url.startsWith('https://www.pinterest.com/')&&!url.includes('privada')&&!url.includes('?')));
});
test('histórico próprio ordena aprovações antes de seleções recentes e deduplica o feed',async()=>{
  const prior={id:'12345',title:'Histórico aprovado',board,originUrl,previewUrl,approvedVersions:2,selectedAt:'2026-11-06T12:00:00.000Z'};
  const recent={...prior,id:'67890',originUrl:'https://www.pinterest.com/pin/67890/',title:'Escolha recente',approvedVersions:0,selectedAt:'2026-11-09T12:00:00.000Z'};
  const result=await searchReferences({query:'tipografia',signals:[],history:[recent,prior],fetchApi:async()=>new Response(feed)});
  assert.deepEqual(result.references.map(item=>item.title),['Histórico aprovado','Escolha recente']);
  assert.equal(Object.hasOwn(result.references[0],'approvedVersions'),false,'a resposta de busca mantém o contrato anterior');
});
test('um pin recusado não retorna pelo RSS e uma seleção posterior permite apresentá-lo',async()=>{
  const rejected={...signal,id:'00000000-0000-4000-8000-000000000006',action:'rejected',supersedes:signal.id,createdAt:'2026-11-09T12:00:00.000Z'};
  const selected={...signal,id:'00000000-0000-4000-8000-000000000007',supersedes:rejected.id,createdAt:'2026-11-09T12:01:00.000Z'};
  const fetchApi=async()=>new Response(feed);
  const hidden=await searchReferences({query:'tipografia',signals:[signal,rejected],fetchApi});
  assert.deepEqual(hidden.references,[]);assert.equal(hidden.status,'empty');
  const restored=await searchReferences({query:'tipografia',signals:[signal,rejected,selected],fetchApi});
  assert.equal(restored.references[0]?.originUrl,originUrl);
});
test('consulta de histórico só lê a conta autenticada, sem autorização para busca externa',async()=>{
  let reads=0,searches=0;
  const route=createReferenceHistoryRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async(_,id)=>id===projectId,store:()=>({list:async()=>[],insert:async()=>signal,history:async()=>{reads++;return [];}}),search:async()=>{searches++;throw Error('external call');}});
  assert.equal((await route(request({projectId:otherProject}))).status,404);
  assert.equal(reads,0);
  assert.deepEqual(await(await route(request({projectId}))).json(),{references:[]});
  assert.equal(reads,1);assert.equal(searches,0);
});
test('metadados de seleção precisam corresponder ao pin escolhido',async()=>{
  const reference={id:'12345',title:'Tipografia',board,originUrl,previewUrl};
  let writes=0;
  const route=createReferenceSignalsRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async()=>true,store:()=>({list:async()=>[],insert:async input=>{writes++;return {...input,createdAt:signal.createdAt};}})});
  const {createdAt,...input}=signal;
  assert.equal((await route(request({...input,reference:{...reference,id:'unrelated'}}))).status,400);
  assert.equal((await route(request({...input,action:'rejected',reference}))).status,400);
  assert.equal(writes,0);
  assert.equal((await route(request({...input,reference}))).status,201);assert.equal(writes,1);
});
test('bloqueia busca sem consentimento ou projeto de outra pessoa',async()=>{
  let searches=0;const deps={appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async(_,id)=>id===projectId,store:()=>({list:async()=>[],insert:async()=>signal}),search:async()=>{searches++;return {status:'ok',references:[]};}};
  const route=createReferenceSearchRoute(deps);
  assert.equal((await route(request({projectId,query:'curso',consentExternalSearch:false}))).status,400);
  assert.equal((await route(request({projectId:otherProject,query:'curso',consentExternalSearch:true}))).status,404);
  assert.equal(searches,0);
  assert.equal((await route(request({projectId,query:'curso',consentExternalSearch:true}))).status,200);
  assert.equal(searches,1);
});
test('consulta e correção respeitam projeto, origem e tipo de sinal',async()=>{
  const recorded=[];const deps={appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async(_,id)=>id===projectId,store:()=>({list:async()=>[signal],insert:async input=>{recorded.push(input);return {...input,createdAt:'2026-11-06T12:02:00.000Z'};}})};
  const route=createReferenceSignalsRoute(deps);
  assert.equal((await route(request({projectId}))).status,200);
  const correction={...signal,id:'00000000-0000-4000-8000-000000000004',action:'rejected',supersedes:signal.id};delete correction.createdAt;
  assert.equal((await route(request({...correction,originUrl:'https://www.pinterest.com/pin/888/'}))).status,409);
  assert.equal((await route(request({...correction,action:'comment',comment:'teste'}))).status,409);
  assert.equal((await route(request({...correction,projectId:otherProject}))).status,404);
  assert.equal((await route(request(correction))).status,201);
  assert.equal(recorded.length,1);
});

test('armazenamento consulta a conta autenticada e valida o projeto retornado',async()=>{
  const {createReferenceSignalStore}=await import('../lib/reference-signal-store.ts');
  const calls=[];
  const row={id:signal.id,project_id:projectId,origin_url:originUrl,board,action:'selected',comment:'',supersedes:null,created_at:'2026-11-06T12:00:00+00:00'};
  const store=createReferenceSignalStore({config:{service:'https://db.example',app:origin,key:'public'},actor:{userId:projectId,token:'jwt'},fetchApi:async(url,options)=>{calls.push({url:String(url),options});return Response.json([row]);}});
  assert.equal((await store.list())[0].projectId,projectId);
  assert.equal(new URL(calls[0].url).searchParams.has('project_id'),false);
  assert.equal(calls[0].options.headers.authorization,'Bearer jwt');
  await assert.rejects(store.list(otherProject),/invalid project response/);
  assert.equal(new URL(calls[1].url).searchParams.get('project_id'),`eq.${otherProject}`);
});
test('repetir a seleção consulta o mesmo id e só aceita conteúdo idêntico',async()=>{
  const {createReferenceSignalStore}=await import('../lib/reference-signal-store.ts');
  const reference={id:'12345',title:'Tipografia',board,originUrl,previewUrl};
  const row={id:signal.id,project_id:projectId,origin_url:originUrl,board,action:'selected',comment:'',supersedes:null,created_at:signal.createdAt,reference_data:reference};
  const calls=[];
  const store=createReferenceSignalStore({config:{service:'https://db.example',app:origin,key:'public'},actor:{userId:projectId,token:'jwt'},fetchApi:async(url,options)=>{calls.push({url:new URL(url),options});return options.method==='POST'?new Response('{}',{status:409}):Response.json([row]);}});
  const {createdAt,...input}=signal;
  assert.deepEqual(await store.insert({...input,reference}),{...signal,reference});
  assert.equal(calls[1].url.searchParams.get('id'),`eq.${signal.id}`);assert.equal(calls[1].url.searchParams.get('owner_id'),`eq.${projectId}`);
  assert.equal(calls[1].options.headers.authorization,'Bearer jwt');
  await assert.rejects(()=>store.insert({...input,reference:{...reference,title:'Outra seleção'}}),/invalid signal response/);
});
test('leitura do histórico usa RPC da conta e rejeita URL de prévia fora da fonte',async()=>{
  const {createReferenceSignalStore}=await import('../lib/reference-signal-store.ts');
  let body=[{id:'12345',title:'Tipografia',board,originUrl,previewUrl,approvedVersions:1,selectedAt:signal.createdAt}],call;
  const store=createReferenceSignalStore({config:{service:'https://db.example',app:origin,key:'public'},actor:{userId:projectId,token:'jwt'},fetchApi:async(url,options)=>{call={url:new URL(url),options};return Response.json(body);}});
  assert.equal((await store.history())[0].approvedVersions,1);assert.equal(call.url.pathname,'/rest/v1/rpc/list_reference_history');
  assert.equal(call.options.headers.authorization,'Bearer jwt');assert.equal(call.options.body,'{}');
  body=[{...body[0],previewUrl:'https://other.example/private.png'}];await assert.rejects(()=>store.history());
});

test('aceita identificador opaco usado no feed público sem ampliar hosts',()=>{
  const opaque='e1_AfqPShz-h46etFHeUwApPCSv_wyrmRHB78a5maNJaYU7ucbeKnY';
  const result=parseReferenceFeed(feed.replaceAll('12345',opaque),board);
  assert.equal(result[0]?.originUrl,`https://www.pinterest.com/pin/${opaque}/`);
});
test('prévia exige conta, projeto, consentimento e host fixo; recusa redirecionamento',async()=>{
  const {createReferencePreviewRoute}=await import('../lib/reference-preview-route.ts');
  let calls=0,options;const route=createReferencePreviewRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async(_,id)=>id===projectId,fetchApi:async(_url,opts)=>{calls++;options=opts;return new Response(Buffer.from([255,216,255,1,2]));}});
  assert.equal((await route(request({projectId,previewUrl:'https://localhost/secret.jpg',consent:true}))).status,400);
  assert.equal((await route(request({projectId,previewUrl,consent:false}))).status,400);
  assert.equal((await route(request({projectId:otherProject,previewUrl,consent:true}))).status,404);
  assert.equal(calls,0);
  const response=await route(request({projectId,previewUrl,consent:true}));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(options.redirect,'error');assert.equal(calls,1);
});
test('metadados da referência preservam origem e rejeitam links fora da fonte',async()=>{
  const {referenceSchema}=await import('../lib/studio-domain.ts');
  const value={id:signal.id,name:'exemplo.jpg',mime:'image/jpeg',size:123,width:20,height:20,source:{originUrl,board}};
  assert.deepEqual(referenceSchema.parse(value),value);
  assert.equal(referenceSchema.safeParse({...value,source:{...value.source,originUrl:'https://evil.example/pin/12345/'}}).success,false);
  const legacy={...value};delete legacy.source;assert.equal(referenceSchema.safeParse(legacy).success,true);
});

test('imagem escolhida mantém origem no contexto congelado e pode servir de exemplo Agile',async()=>{
  const {createStudioState,createPost,addReference,addCreativeCriterion,prepareAdjustment}=await import('../lib/studio-state.ts');
  const ref={id:signal.id,name:'pinterest.jpg',mime:'image/jpeg',size:123,width:20,height:20,source:{originUrl,board}};
  const id=(number)=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  let state=createStudioState({userId:id(10),projectId});
  state=createPost(state,{pieceId:id(11)});
  state=addReference(state,ref);
  state=addCreativeCriterion(state,{id:id(12),viewpoint:'creator',dimension:'visual',statement:'Contraste',example:{description:'Aproxima',referenceId:ref.id},counterexample:{description:'Afasta',referenceId:null},provenance:'hypothesis',source:'',tension:''});
  state=prepareAdjustment(state,{requestId:id(13),messageId:id(14),instruction:'Compare a imagem',createdAt:'2026-11-06T12:00:00.000Z',eventId:id(15)});
  assert.equal(state.adjustments[0].context.references[0].source.originUrl,originUrl);
  assert.equal(state.direction.criteria[0].example.referenceId,ref.id);
});

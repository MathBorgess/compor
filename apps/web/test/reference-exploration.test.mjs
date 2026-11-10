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
  const urls=[];const result=await searchReferences({projectId,query:'tipografia informação privada',signals:[],fetchApi:async url=>{urls.push(String(url));return new Response(feed,{status:200});}});
  assert.equal(result.status,'ok');assert.ok(result.references.length>0);assert.ok(urls.length>0);
  assert.ok(urls.every(url=>url.startsWith('https://www.pinterest.com/')&&!url.includes('privada')&&!url.includes('?')));
});
test('histórico próprio ordena aprovações antes de seleções recentes e deduplica o feed',async()=>{
  const prior={id:'12345',title:'Histórico aprovado',board,originUrl,previewUrl,approvedVersions:2,selectedAt:'2026-11-06T12:00:00.000Z'};
  const recent={...prior,id:'67890',originUrl:'https://www.pinterest.com/pin/67890/',title:'Escolha recente',approvedVersions:0,selectedAt:'2026-11-09T12:00:00.000Z'};
  const result=await searchReferences({projectId,query:'tipografia',signals:[],history:[recent,prior],fetchApi:async()=>new Response(feed)});
  assert.deepEqual(result.references.map(item=>item.title),['Histórico aprovado','Escolha recente']);
  assert.equal(Object.hasOwn(result.references[0],'approvedVersions'),false,'a resposta de busca mantém o contrato anterior');
});
test('um pin recusado não retorna pelo RSS e uma seleção posterior permite apresentá-lo',async()=>{
  const rejected={...signal,id:'00000000-0000-4000-8000-000000000006',action:'rejected',supersedes:signal.id,createdAt:'2026-11-09T12:00:00.000Z'};
  const selected={...signal,id:'00000000-0000-4000-8000-000000000007',supersedes:rejected.id,createdAt:'2026-11-09T12:01:00.000Z'};
  const fetchApi=async()=>new Response(feed);
  const hidden=await searchReferences({projectId,query:'tipografia',signals:[signal,rejected],fetchApi});
  assert.deepEqual(hidden.references,[]);assert.equal(hidden.status,'empty');
  const restored=await searchReferences({projectId,query:'tipografia',signals:[signal,rejected,selected],fetchApi});
  assert.equal(restored.references[0]?.originUrl,originUrl);
});
test('recusa do projeto B não veta histórico aprovado em A nem feed em C',async()=>{
  const projectB=otherProject,projectC='00000000-0000-4000-8000-000000000020';
  const history=[{id:'12345',title:'Escolha aprovada em A',board,originUrl,previewUrl,approvedVersions:1,selectedAt:signal.createdAt}];
  const rejected={...signal,id:'00000000-0000-4000-8000-000000000006',projectId:projectB,action:'rejected',createdAt:'2026-11-09T12:00:00.000Z'};
  const selected={...rejected,id:'00000000-0000-4000-8000-000000000007',action:'selected',supersedes:rejected.id,createdAt:'2026-11-09T12:01:00.000Z'};
  const comment={...rejected,id:'00000000-0000-4000-8000-000000000008',action:'comment',comment:'Serve como contraponto',createdAt:'2026-11-09T12:02:00.000Z'};
  const options={query:'tipografia',signals:[signal,rejected,comment],history,fetchApi:async()=>new Response(feed)};
  assert.equal((await searchReferences({...options,projectId:projectC})).references[0]?.title,'Escolha aprovada em A');
  assert.deepEqual((await searchReferences({...options,projectId:projectB})).references,[]);
  assert.equal((await searchReferences({...options,projectId:projectB,signals:[...options.signals,selected]})).references[0]?.originUrl,originUrl);
  const rejectA={...rejected,projectId,id:'00000000-0000-4000-8000-000000000009',supersedes:signal.id};
  assert.equal((await searchReferences({...options,projectId:projectC,signals:[...options.signals,rejectA]})).references[0]?.title,'Escolha aprovada em A','recusa posterior em A não apaga aprovação histórica para C');
  assert.equal((await searchReferences({...options,projectId:projectC,history:[]})).references[0]?.originUrl,originUrl,'RSS obedece o mesmo escopo local');
});
test('consulta de histórico só lê a conta autenticada, sem autorização para busca externa',async()=>{
  let reads=0,searches=0;
  const route=createReferenceHistoryRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async(_,id)=>id===projectId,store:()=>({list:async()=>[],insert:async()=>signal,history:async currentProject=>{assert.equal(currentProject,projectId);reads++;return [];}}),search:async()=>{searches++;throw Error('external call');}});
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
test('busca consulta decisões do projeto atual e histórico da conta no mesmo escopo de veto',async()=>{
  let query;
  const route=createReferenceSearchRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async()=>true,
    store:()=>({list:async currentProject=>{assert.equal(currentProject,projectId);return [signal];},insert:async()=>signal,history:async currentProject=>{assert.equal(currentProject,projectId);return [];}}),
    search:async input=>{query=input;return {status:'ok',references:[]};}});
  assert.equal((await route(request({projectId,query:'tipografia',consentExternalSearch:true}))).status,200);
  assert.equal(query.projectId,projectId);assert.deepEqual(query.signals,[signal]);
});
test('falha do histórico opcional mantém RSS e as recusas do projeto atual',async()=>{
  const rejected={...signal,action:'rejected'};
  const allowedOrigin='https://www.pinterest.com/pin/98765/';
  const availableFeed=feed.replace('</channel>',`<item><title>Outra direção</title><link>${allowedOrigin}</link><description>${previewUrl}</description></item></channel>`);
  let searches=0,feeds=0;
  const route=createReferenceSearchRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async()=>true,
    store:()=>({list:async currentProject=>{assert.equal(currentProject,projectId);return [rejected];},insert:async()=>signal,history:async currentProject=>{assert.equal(currentProject,projectId);throw Error('history unavailable');}}),
    search:async options=>{searches++;return searchReferences({...options,fetchApi:async()=>{feeds++;return new Response(availableFeed);}});}});
  const response=await route(request({projectId,query:'tipografia',consentExternalSearch:true}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'ok');assert.deepEqual(result.references.map(item=>item.originUrl),[allowedOrigin]);
  assert.equal(searches,1);assert.ok(feeds>0);
});
test('falha na leitura obrigatória das decisões impede a busca externa',async()=>{
  let searches=0;
  const route=createReferenceSearchRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async()=>true,
    store:()=>({list:async()=>{throw Error('signals unavailable');},insert:async()=>signal,history:async()=>{throw Error('history unavailable');}}),
    search:async()=>{searches++;return {status:'ok',references:[]};}});
  const response=await route(request({projectId,query:'tipografia',consentExternalSearch:true}));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable',references:[]});assert.equal(searches,0);
});
test('tolerância ao histórico não contorna origem, sessão ou propriedade do projeto',async()=>{
  const input={projectId,query:'tipografia',consentExternalSearch:true};
  const connected=async()=>({userId:projectId,token:'token'});
  for(const {actor=connected,owns=async()=>true,originHeader=origin,status} of [
    {originHeader:'https://other.example',status:404},{actor:async()=>null,status:404},
    {actor:async()=>({userId:projectId,token:''}),status:404},{owns:async()=>false,status:404},
    {actor:async()=>{throw Error('session unavailable');},status:503},{owns:async()=>{throw Error('ownership unavailable');},status:503},
  ]){
    let reads=0,searches=0;
    const route=createReferenceSearchRoute({appOrigin:origin,resolveActor:actor,ownsProject:owns,
      store:()=>{reads++;throw Error('must authorize before reading');},search:async()=>{searches++;return {status:'ok',references:[]};}});
    const incoming=request(input);incoming.headers.set('origin',originHeader);
    assert.equal((await route(incoming)).status,status);assert.equal(reads,0);assert.equal(searches,0);
  }
});
test('falhas do RSS continuam visíveis quando o histórico está indisponível',async()=>{
  const deps={appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'token'}),ownsProject:async()=>true,
    store:()=>({list:async()=>[],insert:async()=>signal,history:async()=>{throw Error('history unavailable');}})};
  let feeds=0;
  const unavailable=createReferenceSearchRoute({...deps,search:options=>searchReferences({...options,fetchApi:async()=>{feeds++;throw Error('RSS unavailable');}})});
  const result=await unavailable(request({projectId,query:'tipografia',consentExternalSearch:true}));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'unavailable',references:[]});assert.ok(feeds>0);
  const failed=createReferenceSearchRoute({...deps,search:async()=>{throw Error('search unavailable');}});
  const response=await failed(request({projectId,query:'tipografia',consentExternalSearch:true}));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable',references:[]});
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
  assert.equal((await store.history(projectId))[0].approvedVersions,1);assert.equal(call.url.pathname,'/rest/v1/rpc/list_reference_history');
  assert.equal(call.options.headers.authorization,'Bearer jwt');assert.deepEqual(JSON.parse(call.options.body),{p_project_id:projectId});
  body=[{...body[0],previewUrl:'https://other.example/private.png'}];await assert.rejects(()=>store.history(projectId));
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReferenceFeed,boardAffinities,searchReferences} from '../lib/reference-exploration.ts';
import {createReferenceSearchRoute,createReferenceSignalsRoute} from '../lib/reference-exploration-route.ts';
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

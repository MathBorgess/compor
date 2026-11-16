import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileRoute} from '../lib/profile-route.ts';
import {createProfileStore} from '../lib/profile-store.ts';
import {localProfileCriteria} from '../lib/profile-local.ts';
import {supersededProfileSignals,PROFILE_PROJECT_PAGE} from '../lib/profile-contract.ts';
import {createStudioState,addCreativeCriterion,recordCreativeDecision,updateBrief,updateOfferFacts} from '../lib/studio-state.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),other=id(2),project=id(3),post=id(4),at='2026-11-16T15:00:00.000Z';
const config={app:'http://localhost:3000',service:'https://example.supabase.co',key:'public-key'};
const actor={userId,token:'personal-token'};
const signal={id:id(5),owner_id:userId,project_id:project,piece_id:post,action:'comment',comment:'Prefiro o contraste suave neste post.',supersedes:null,created_at:at};
const source='https://www.pinterest.com/pin/123/';
const request=(body={},origin=config.app)=>new Request(`${config.app}/api/profile`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const empty={userId,projects:[],signals:[],nextOffset:null,limitedSources:[]};

test('perfil exige origem e identidade verificadas, sem aceitar conta ou projeto do navegador',async()=>{
  let reads=0;
  const route=createProfileRoute({appOrigin:config.app,resolveActor:async()=>actor,read:async()=>{reads++;return empty;}});
  assert.equal((await route(request({},'https://other.test'))).status,403);
  for(const body of [{userId:other},{projectId:project},{offset:-1},{offset:1.5},{offset:1_000_001},{padding:'x'.repeat(600)}])assert.equal((await route(request(body))).status,400);
  assert.equal(reads,0);
  assert.equal((await createProfileRoute({appOrigin:config.app,resolveActor:async()=>null,read:async()=>{throw Error('must not read');}})(request())).status,401);
  const response=await route(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),empty);
  assert.equal((await createProfileRoute({appOrigin:config.app,resolveActor:async()=>actor,read:async()=>({...empty,userId:other})})(request())).status,503);
  assert.equal((await createProfileRoute({appOrigin:config.app,resolveActor:async()=>{throw Error('private');},read:async()=>empty})(request())).status,503);
});

test('perfil conserva sinais de projeto excluído, separa fontes e rejeita resposta alheia',async()=>{
  const calls=[];let foreign=false,unavailable=false;
  const store=createProfileStore({config,actor,fetchApi:async(url,options)=>{
    calls.push({url,options});
    if(unavailable)return Response.json({error:'private'},{status:503});
    const owner=foreign?other:userId;
    if(url.pathname.endsWith('/projects'))return Response.json([{id:project,owner_id:owner,title:'Café Aurora',deleted_at:at}]);
    if(url.pathname.endsWith('/reference_signals'))return Response.json([{...signal,owner_id:owner,origin_url:source,reference_data:null}]);
    return Response.json([{...signal,id:id(6),owner_id:owner,piece_id:null,action:'selected',comment:'',image_id:id(7)}]);
  }});
  const page=await store.read();
  assert.equal(page.projects[0].deletedAt,at);assert.equal(page.signals.length,2);
  assert.equal(page.signals.find(value=>value.kind==='reference').pieceId,post);
  assert.equal(page.signals.find(value=>value.kind==='reference').comment,signal.comment);
  assert.equal(page.signals.find(value=>value.kind==='generated').pieceId,null);
  for(const call of calls){assert.equal(call.options.headers.authorization,'Bearer personal-token');assert.equal(call.url.searchParams.get('owner_id'),`eq.${userId}`);assert.equal(call.url.searchParams.has('deleted_at'),false);assert.equal(call.options.method,undefined);}
  assert.equal(calls[1].url.searchParams.get('project_id'),`in.(${project})`);
  foreign=true;await assert.rejects(store.read(),/invalid_profile_owner/);
  foreign=false;unavailable=true;await assert.rejects(store.read(),/profile_unavailable/);
});

test('paginação mantém projetos antigos acessíveis e limites de sinais são explícitos',async()=>{
  const requests=[];
  const store=createProfileStore({config,actor,fetchApi:async url=>{
    requests.push(url);
    if(url.pathname.endsWith('/projects'))return Response.json(Array.from({length:PROFILE_PROJECT_PAGE+1},(_,index)=>({id:id(index+10),owner_id:userId,title:`Projeto ${index}`,deleted_at:at})));
    if(url.pathname.endsWith('/reference_signals'))return Response.json(Array.from({length:501},(_,index)=>({...signal,id:id(index+100),project_id:id(10),origin_url:source,reference_data:null})));
    return Response.json([]);
  }});
  const page=await store.read(25);
  assert.equal(requests[0].searchParams.get('offset'),'25');assert.equal(page.projects.length,25);assert.equal(page.nextOffset,50);
  assert.equal(page.signals.length,500);assert.deepEqual(page.limitedSources,['reference']);
  assert.equal(new Set(page.signals.map(value=>value.id)).size,500);
});

test('critérios locais preservam decisão e origem sem promover fatos ou público ao perfil geral',()=>{
  let state=createStudioState({userId,projectId:project});
  state=updateBrief(state,{audience:'Clientes da promoção',offer:'Café por R$ 10'});
  state=updateOfferFacts(state,[{id:id(50),label:'Preço',value:'R$ 10',status:'confirmed'}]);
  const criterion={id:id(8),viewpoint:'creator',dimension:'visual',statement:'Contraste suave',example:{description:'Creme e azul',referenceId:null},counterexample:{description:'Cores neon',referenceId:null},provenance:'creator_report',source:'Conversa de referências',tension:''};
  state=addCreativeCriterion(state,criterion);
  state=recordCreativeDecision(state,{id:id(9),criterionId:criterion.id,choice:'accept',reason:'É a direção desta cafeteria',at});
  const before=JSON.stringify(state),criteria=localProfileCriteria(state,userId,project);
  assert.equal(JSON.stringify(state),before);assert.equal(criteria.length,1);assert.equal(criteria[0].choice,'accept');assert.equal(criteria[0].projectId,project);assert.equal(criteria[0].pieceId,null);assert.deepEqual(criteria[0].criterion,criterion);
  assert.doesNotMatch(JSON.stringify(criteria),/R\$ 10|Clientes da promoção/);
  assert.throws(()=>localProfileCriteria(state,other,project),/invalid_local_profile_scope/);
  assert.throws(()=>localProfileCriteria(state,userId,id(11)),/invalid_local_profile_scope/);
  const original={kind:'reference',id:id(20),projectId:project,pieceId:null,action:'selected',comment:'',supersedes:null,createdAt:at,originUrl:source,title:'Café'};
  const corrected={...original,id:id(21),action:'rejected',supersedes:original.id};
  assert.deepEqual([...supersededProfileSignals([original,corrected])],[`reference:${project}:${original.id}`]);
});

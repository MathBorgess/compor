import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
import {createExplorationPlanner,createExplorationPlannerBindings,verifyExplorationPlan} from '../../packages/agents-api/src/exploration-planner.mjs';
import {createExplorationIntentRoute} from '../../apps/web/lib/exploration-intent-route.ts';
import {createExplorationIntentStore} from '../../apps/web/lib/exploration-intent-store.ts';
import {deriveExplorationIntent} from '../../apps/web/lib/exploration-intent.ts';
import {createExplorationPlannerRoute} from '../../apps/web/lib/exploration-planner-route.ts';
import {createExplorationPlannerStore} from '../../apps/web/lib/exploration-planner-store.ts';
import {createExplorationBatchRoute} from '../../apps/web/lib/exploration-batch-route.ts';
import {createExplorationBatchStore} from '../../apps/web/lib/exploration-batch-store.ts';

const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),other=id(2),projectId=id(3),pieceId=id(4),batchId=id(5),intentId=id(6),requestId=id(7),freshIntentId=id(8);
const actor={userId:owner,token:'owner-jwt-synthetic'},otherActor={userId:other,token:'other-jwt-synthetic'};
const key=`sk-synthetic-${'x'.repeat(30)}`,origin='https://compor.test';
const config={service:'https://example.supabase.co',app:origin,key:'sb_publishable_test'};
const context={idea:'Oficina sintética',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const inputs={projectId,conversationId:pieceId,batchId,context};
const mk=(body,headers={})=>new Request(origin+'/fixture',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const png=new Uint8Array([137,80,78,71,13,10,26,10]);

// This bridge reproduces relevant PostgREST scalar/table JSON shapes while
// executing the real SQL under auth.uid(). It is not an actual PostgREST server.
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(await readFile(new URL('../../supabase/migrations/20261117000034_exploration_revocable_intents.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query('insert into projects(id,owner_id) values($1,$2)',[projectId,owner]);
 await db.query('insert into project_posts(project_id,piece_id,name) values($1,$2,$3)',[projectId,pieceId,'Post sintético']);
 await db.exec('set role authenticated');
 let queue=Promise.resolve(),pauseReserve=null;const calls=[];
 const fetchApi=async(url,options)=>{
  const path=new URL(url).pathname,authorization=options.headers.authorization;
  const who=authorization===`Bearer ${actor.token}`?owner:authorization===`Bearer ${otherActor.token}`?other:null;
  if(!who)return new Response(null,{status:401});
  const name=path.split('/').at(-1);calls.push(name);
  if(name==='reserve_exploration_batch_proven'&&pauseReserve)await pauseReserve;
  const run=async()=>{
   try{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
    if(path==='/rest/v1/exploration_plans'){
     const value=JSON.parse(options.body);await db.query('insert into public.exploration_plans(image_id,project_id,composition,contrast) values($1,$2,$3,$4)',[value.image_id,value.project_id,value.composition,value.contrast]);return Response.json({});
    }
    if(path.startsWith('/storage/v1/object/compor-exploration-images/')){
     const name=path.split('/compor-exploration-images/')[1];await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['compor-exploration-images',name]);return Response.json({});
    }
    const allow=new Set(['get_exploration_intent_epoch','reserve_exploration_intent','revoke_exploration_intent','get_exploration_intent_state','reserve_exploration_plan','get_exploration_plan','bind_exploration_plan','finish_exploration_plan','reserve_exploration_batch_proven','get_exploration_batch','complete_exploration_image_proven','finish_exploration_image','reject_exploration_image']);
    if(!path.startsWith('/rest/v1/rpc/')||!allow.has(name))throw Error('unexpected route');
    const value=JSON.parse(options.body),names=Object.keys(value);if(names.some(n=>!/^p_[a-z_]+$/.test(n)))throw Error('unexpected argument');
    const args=names.map((n,i)=>`${n} => $${i+1}`).join(','),table=name==='reserve_exploration_batch_proven';
    const result=await db.query(table?`select * from public.${name}(${args})`:`select public.${name}(${args}) as value`,names.map(n=>value[n]));
    return Response.json(table?result.rows:result.rows[0].value);
   }catch{return Response.json({error:'synthetic_database_error'},{status:400});}
  };
  const next=queue.then(run,run);queue=next.then(()=>{},()=>{});return next;
 };
 return {db,fetchApi,calls,holdReserve:promise=>{pauseReserve=promise;}};
}

test('adapters reais, JSON PostgREST simulado e migrations preservam intenção e recibos', {timeout:60000},async t=>{
 const f=await fixture(t),bindings=createExplorationPlannerBindings({secret:Buffer.alloc(32,7),source:'byok',apiKey:key});
 const intentStore=createExplorationIntentStore(config,f.fetchApi),batchStore=createExplorationBatchStore(config,f.fetchApi);
 const auth={appOrigin:origin,apiKey:key,bindings,allowCreate:true,resolveActor:async()=>actor,ownsProject:async(a,p)=>a.userId===owner&&p===projectId};
 const intentRoute=createExplorationIntentRoute({...auth,store:intentStore});
 let starts=0,images=0;
 const provider={create:async()=>{starts++;return{sessionId:'sess_bridge'};},get:async()=>({status:'completed',turnId:'turn_bridge',plan:{version:1,items:[1,2,3].map(i=>({position:i,creativePrompt:`Caminho ${i}`,composition:`Composição ${i}`,contrast:`Contraste ${i}`,differenceFromOthers:`Diferença ${i}`}))}})};
 const plannerFor=intent=>createExplorationPlanner({store:createExplorationPlannerStore(config,f.fetchApi,intent),bindings,provider,authorize:async({actor:a,projectId:p})=>a.userId===owner&&p===projectId});
 const plannerRoute=createExplorationPlannerRoute({...auth,allowSubmit:true,plannerFor});
 const batchRoute=createExplorationBatchRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async(a,p)=>a.userId===owner&&p===projectId,
  verifyPlan:async value=>verifyExplorationPlan({bindings,input:{actor,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.requestId,context:value.context},plan:value.plan,token:value.token}),
  intentSecret:value=>deriveExplorationIntent(bindings,{...value,purpose:'batch'}).intentSecret,intentState:intentStore.state,store:batchStore,generate:async()=>{images++;return png;}});
 const initialEpoch=await intentRoute.epoch(mk({projectId}));assert.deepEqual(await initialEpoch.json(),{epoch:0});
 const initial=await intentRoute.create(mk({...inputs,intentId,purpose:'batch',expectedEpoch:0,apiKey:key}));assert.deepEqual(await initial.json(),{status:'created',epoch:1});
 const submit=await plannerRoute(mk({...inputs,intentId,requestId,op:'submit',apiKey:key}));assert.equal((await submit.json()).status,'running');
 const poll=await plannerRoute(mk({...inputs,requestId,op:'poll',apiKey:key})),out=await poll.json();assert.equal(out.status,'completed');
 const pollAgain=await plannerRoute(mk({...inputs,requestId,op:'poll',apiKey:key}));assert.equal((await pollAgain.json()).status,'completed');assert.equal(starts,1);
 const execute={...inputs,intentId,planRequestId:requestId,plan:out.plan,planBinding:out.planBinding,imageIds:[id(21),id(22),id(23)]},headers={'x-compor-openai-key':key};
 assert.equal((await batchRoute.post(mk({...execute,context:{...context,idea:'Alterado'}},headers))).status,403);assert.equal(images,0);
 let release;const gate=new Promise(resolve=>{release=resolve;});f.holdReserve(gate);
 const pending=batchRoute.post(mk(execute,headers));while(!f.calls.includes('reserve_exploration_batch_proven'))await new Promise(resolve=>setTimeout(resolve,1));
 const revoked=await intentRoute.revoke(mk({projectId,intentId,expectedEpoch:1}));assert.deepEqual(await revoked.json(),{status:'revoked',epoch:2});
 release();const stopped=await pending;assert.equal(stopped.status,409);assert.equal((await stopped.json()).status,'revoked');assert.equal(images,0);
 f.holdReserve(null);const stale=await intentRoute.create(mk({...inputs,intentId:freshIntentId,purpose:'batch',expectedEpoch:0,apiKey:key}));assert.equal(stale.status,409);
 const fresh=await intentRoute.create(mk({...inputs,intentId:freshIntentId,purpose:'batch',expectedEpoch:2,apiKey:key}));assert.deepEqual(await fresh.json(),{status:'created',epoch:3});
 const completed=await batchRoute.post(mk({...execute,intentId:freshIntentId},headers));assert.equal((await completed.json()).status,'completed');assert.equal(images,3);
 const batch=await batchStore.getBatch(actor,projectId,batchId);assert.equal(batch.state,'completed');assert.deepEqual(batch.images.map(image=>image.status),['completed','completed','completed']);assert.equal(Date.parse(batch.nextAt)-Date.parse(batch.completedAt),15000);
 const duplicate=await batchRoute.post(mk({...execute,intentId:freshIntentId},headers));assert.equal(duplicate.status,409);assert.equal(images,3);assert.equal(starts,1);
 assert.equal(await batchStore.getBatch(otherActor,projectId,batchId),null,'RLS impede leitura por outra conta');
});

test('revogação enquanto planos dos filhos aguardam impede os três envios usando as RPCs reais', {timeout:60000},async t=>{
 const f=await fixture(t),bindings=createExplorationPlannerBindings({secret:Buffer.alloc(32,7),source:'byok',apiKey:key});
 const intentStore=createExplorationIntentStore(config,f.fetchApi),batchStore=createExplorationBatchStore(config,f.fetchApi);
 const auth={appOrigin:origin,apiKey:key,bindings,allowCreate:true,resolveActor:async()=>actor,ownsProject:async(a,p)=>a.userId===owner&&p===projectId};
 const intentRoute=createExplorationIntentRoute({...auth,store:intentStore});
 assert.equal((await intentRoute.create(mk({...inputs,intentId,purpose:'batch',expectedEpoch:0,apiKey:key}))).status,200);
 const provider={create:async()=>({sessionId:'sess_bridge'}),get:async()=>({status:'completed',turnId:'turn_bridge',plan:{version:1,items:[1,2,3].map(i=>({position:i,creativePrompt:`Caminho ${i}`,composition:`Composição ${i}`,contrast:`Contraste ${i}`,differenceFromOthers:`Diferença ${i}`}))}})};
 const plannerFor=intent=>createExplorationPlanner({store:createExplorationPlannerStore(config,f.fetchApi,intent),bindings,provider,authorize:async()=>true});
 const plannerRoute=createExplorationPlannerRoute({...auth,allowSubmit:true,plannerFor});
 assert.equal((await (await plannerRoute(mk({...inputs,intentId,requestId,op:'submit',apiKey:key}))).json()).status,'running');
 assert.equal((await (await plannerRoute(mk({...inputs,requestId,op:'poll',apiKey:key}))).json()).status,'completed');
 let release,plans=0,images=0;const gate=new Promise(resolve=>{release=resolve;});
 const route=createExplorationBatchRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:auth.ownsProject,verifyPlan:async()=>true,
  intentSecret:value=>deriveExplorationIntent(bindings,{...value,purpose:'batch'}).intentSecret,intentState:intentStore.state,
  store:{...batchStore,plan:async(...args)=>{plans++;await gate;return batchStore.plan(...args);}},generate:async()=>{images++;return png;}});
 const plan={version:1,items:[1,2,3].map(position=>({position,creativePrompt:`Caminho ${position}`,composition:`Composição ${position}`,contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`,prompt:`Prompt ${position}`}))};
 const pending=route.post(mk({...inputs,intentId,planRequestId:requestId,plan,planBinding:'fixture',imageIds:[id(21),id(22),id(23)]},{'x-compor-openai-key':key}));
 for(let i=0;plans<3&&i<2000;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(plans,3,'a reserva deve atingir os três planos');
 assert.deepEqual(await (await intentRoute.revoke(mk({projectId,intentId,expectedEpoch:1}))).json(),{status:'revoked',epoch:2});
 release();assert.equal((await (await pending).json()).status,'unknown');assert.equal(images,0);
 const batch=await batchStore.getBatch(actor,projectId,batchId);assert.deepEqual(batch.images.map(image=>image.status),['unknown','unknown','unknown']);
});

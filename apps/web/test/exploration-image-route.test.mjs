import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationImageRoute, ExplorationCredentialsRejected } from '../lib/exploration-image-route.ts';
import { decodeExplorationImage } from '../lib/exploration-image-runtime.ts';
import { createHash } from 'node:crypto';

const project='00000000-0000-4000-8000-000000000001', requestId='00000000-0000-4000-8000-000000000002';
const actor={userId:'00000000-0000-4000-8000-000000000003',token:'token'};
const key=`sk-${'x'.repeat(24)}`;
function request(id=requestId,origin='http://localhost:3000') {
  return new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin,'content-type':'application/json','x-compor-openai-key':key},body:JSON.stringify({projectId:project,requestId:id,prompt:'Duas alternativas visuais'})});
}
function setup(generate=async()=>new Uint8Array([1,2,3])) {
  const records=new Map(); let calls=0;
  const store={
    async reserve(_actor,_project,id,digest,rejectionDigest) {
      const row=records.get(id);
      if(row) { if(row.digest!==digest)throw Error(); return {state:row.state,isNew:false}; }
      if([...records.values()].some(r=>r.state==='unknown'))return {state:'blocked',isNew:false};
      if([...records.values()].some(r=>r.state==='running'))return {state:'busy',isNew:false};
      records.set(id,{state:'running',digest,rejectionDigest});return {state:'running',isNew:true};
    },
    async finish(_actor,_project,id,state){records.get(id).state=state;},
    async reject(_actor,_project,id,secret){const row=records.get(id);assert.equal(createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex'),row.rejectionDigest);row.state='rejected';},
    async put(){},async list(){return [];},async read(){return new Response();},
  };
  const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async(...args)=>{calls++;return generate(...args);}});
  return {route,records,calls:()=>calls};
}
test('repetição do mesmo identificador não gera outra imagem',async()=>{
  const f=setup(); const first=await f.route.post(request());
  assert.deepEqual(await first.json(),{status:'completed',requestId,imageId:requestId});
  const second=await f.route.post(request());
  assert.deepEqual(await second.json(),{status:'completed',requestId,imageId:requestId}); assert.equal(f.calls(),1);
});
test('resultado incerto impede novas operações e repetição automática',async()=>{
  const f=setup(async()=>{throw Error('network');});
  const result=await f.route.post(request()); assert.equal(result.status,502);
  assert.deepEqual(await result.json(),{status:'unknown',requestId,retryAutomatically:false});
  const another=await f.route.post(request('00000000-0000-4000-8000-000000000004'));
  assert.equal((await another.json()).status,'blocked'); assert.equal(f.calls(),1);
});
test('recusa comprovada encerra reserva, sem repetir automaticamente e sem expor prova',async()=>{
 let reject=true;
 const f=setup(async()=>{if(reject)throw new ExplorationCredentialsRejected();return new Uint8Array([1]);});
 const first=await f.route.post(request());assert.equal(first.status,401);
 assert.deepEqual(await first.json(),{status:'rejected',requestId,retryAutomatically:false});
 const again=await f.route.post(request());assert.equal(again.status,409);assert.deepEqual(await again.json(),{status:'rejected',requestId,retryAutomatically:false});assert.equal(f.calls(),1);
 reject=false;const another=await f.route.post(request('00000000-0000-4000-8000-000000000004'));assert.equal(another.status,200);assert.equal(f.calls(),2);
});
test('persistência incerta da recusa mantém resultado desconhecido',async()=>{
 const events=[];
 const store={reserve:async()=>({state:'running',isNew:true}),reject:async()=>{events.push('reject');throw Error('lost response');},finish:async(_a,_p,_id,state)=>events.push(state),put:async()=>{throw Error('unexpected');},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>{throw new ExplorationCredentialsRejected();}});
 const response=await route.post(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{status:'unknown',requestId,retryAutomatically:false});assert.deepEqual(events,['reject','unknown']);
});
test('resposta perdida após recusa persistida não confirma recusa para o chamador',async()=>{
 let state='running';
 const store={reserve:async()=>({state:'running',isNew:true}),reject:async()=>{state='rejected';throw Error('lost response');},finish:async(_a,_p,_id,next)=>{if(state!=='running')throw Error('terminal');state=next;},put:async()=>{throw Error('unexpected');},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>{throw new ExplorationCredentialsRejected();}});
 const response=await route.post(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{status:'unknown',requestId,retryAutomatically:false});assert.equal(state,'rejected');
});
test('falha ao armazenar imagem não pode ser tratada como recusa de credencial',async()=>{
 const events=[];
 const store={reserve:async()=>({state:'running',isNew:true}),reject:async()=>events.push('reject'),finish:async(_a,_p,_id,state)=>events.push(state),put:async()=>{throw new ExplorationCredentialsRejected();},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>new Uint8Array([1])});
 const response=await route.post(request());assert.equal(response.status,502);assert.deepEqual(events,['unknown']);
});
test('somente resposta interna específica de recusa do fornecedor é definitiva',async()=>{
 for(const status of [401,403])await assert.rejects(()=>decodeExplorationImage(Response.json({error:'openai_credentials_rejected'},{status})),ExplorationCredentialsRejected);
 for(const [status,body] of [[401,{error:'unauthorized'}],[403,{error:'invalid_origin'}],[502,{error:'openai_credentials_rejected'}],[401,{error:'openai_credentials_rejected',extra:true}]]) {
  await assert.rejects(()=>decodeExplorationImage(Response.json(body,{status})),error=>!(error instanceof ExplorationCredentialsRejected));
 }
});
test('origem incorreta não chama geração',async()=>{
  const f=setup(); assert.equal((await f.route.post(request(requestId,'http://other.test'))).status,403); assert.equal(f.calls(),0);
});
test('pausa durável não envia imagem e retomada valida origem e titularidade',async()=>{
 let generated=0,resumed=0;
 const store={reserve:async()=>({state:'awaiting_feedback',isNew:false}),resume:async(a,p)=>{assert.deepEqual(a,actor);assert.equal(p,project);resumed++;return 'resumed';},status:async()=> 'awaiting_feedback',put:async()=>{},finish:async()=>{},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>{generated++;return new Uint8Array();}});
 const paused=await route.post(request());assert.equal(paused.status,409);assert.deepEqual(await paused.json(),{status:'awaiting_feedback',requestId,retryAutomatically:false});assert.equal(generated,0);
 const resume=(origin,body={projectId:project})=>new Request('http://localhost:3000/api/studio/explorations/resume',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.resume(resume('http://other.test'))).status,403);
 assert.equal((await route.resume(resume('http://localhost:3000',{projectId:project,extra:true}))).status,400);
 assert.deepEqual(await (await route.resume(resume('http://localhost:3000'))).json(),{status:'resumed'});assert.equal(resumed,1);
 assert.deepEqual(await (await route.status(resume('http://localhost:3000'))).json(),{status:'awaiting_feedback'});
});
test('plano visual é vinculado antes de chamar o provedor',async()=>{
 const events=[];
 const store={reserve:async()=>({state:'running',isNew:true}),plan:async(_actor,_project,_id,plan)=>events.push(plan.composition),put:async()=>{},finish:async()=>{},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>{events.push('geração');return new Uint8Array([1]);}});
 const input={projectId:project,requestId,prompt:'Ideia',plan:{composition:'grade editorial',contrast:'respiro'}};
 const response=await route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key},body:JSON.stringify(input)}));
 assert.equal(response.status,200);assert.deepEqual(events,['grade editorial','geração']);
});
test('histórico tem cursor por ordinal estável e rejeita páginas fora do projeto',async()=>{
 const records=Array.from({length:103},(_,index)=>({id:`00000000-0000-4000-8000-${String(index+100).padStart(12,'0')}`,project_id:project,state:'completed',created_at:'2026-11-06T12:00:00Z',ordinal:103-index,batch_id:null,batch_position:null}));
 let corrupt=false;
 const store={reserve:async()=>({state:'busy',isNew:false}),put:async()=>{},finish:async()=>{},read:async()=>new Response(),list:async(_actor,_project,before)=>{
   const items=records.filter(item=>before===undefined||item.ordinal<before).slice(0,101);
   return corrupt?items.map((item,index)=>index?item:{...item,project_id:'00000000-0000-4000-8000-000000000099'}):items;
 }};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>new Uint8Array()});
 const page=async(query='')=>route.get(new Request(`http://localhost:3000/api/studio/explorations?projectId=${project}${query}`));
 const first=await (await page()).json();assert.equal(first.images.length,100);assert.equal(first.nextBeforeOrdinal,4);
 const second=await (await page(`&beforeOrdinal=${first.nextBeforeOrdinal}`)).json();assert.deepEqual(second.images.map(item=>item.ordinal),[3,2,1]);assert.equal(second.nextBeforeOrdinal,null);
 assert.equal((await page('&beforeOrdinal=0')).status,400);corrupt=true;assert.equal((await page()).status,503);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationImageRoute, ExplorationCredentialsRejected } from '../lib/exploration-image-route.ts';
import { decodeExplorationImage } from '../lib/exploration-image-runtime.ts';
import { POST as explorationPost } from '../handlers/api/studio/explorations/route.ts';
import { createHash } from 'node:crypto';
import { createExplorationPrompt } from '@compor/agile-deliberation/exploration';
import { createImageHandler } from '../../../packages/images-api/src/index.mjs';

const project='00000000-0000-4000-8000-000000000001', requestId='00000000-0000-4000-8000-000000000002';
const actor={userId:'00000000-0000-4000-8000-000000000003',token:'token'};
const key=`sk-${'x'.repeat(24)}`;
function request(id=requestId,origin='http://localhost:3000') {
  return new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin,'content-type':'application/json','x-compor-openai-key':key},body:JSON.stringify({projectId:project,requestId:id,prompt:'Duas alternativas visuais'})});
}
function setup(generate=async()=>new Uint8Array([1,2,3]), options={}) {
  const records=new Map(); let calls=0,writes=0;
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
    async hold(_actor,_project,id,secret,reason){const row=records.get(id);assert.equal(createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex'),row.rejectionDigest);row.state='quality_held';row.qualityReason=reason;},
    async plan(){},async put(){writes++;},async list(){return [];},async read(){return new Response();},
  };
  const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:options.ownsProject??(async()=>true),generationAvailable:options.generationAvailable,store,generate:async(...args)=>{calls++;return generate(...args);}});
  return {route,records,calls:()=>calls,writes:()=>writes};
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
test('revisão local inconclusiva retém a exploração serial antes da gravação', async()=>{
  const imageBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
  const handler=createImageHandler({authenticate:async()=>actor,fetch:async()=>Response.json({data:[{b64_json:imageBase64}]}),reviewCandidate:async()=>({decision:'unsure',findings:[]})});
  const f=setup(async(_actor,apiKey,prompt)=>decodeExplorationImage(await handler(new Request('http://localhost/internal-image',{
    method:'POST',body:JSON.stringify({apiKey,prompt,authorizeGeneration:true}),
  }))));
  const result=await f.route.post(request());
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{status:'quality_held',requestId,qualityReason:'image_quality_inconclusive',retryAutomatically:false});
  const replay=await f.route.post(request());assert.equal(replay.status,409);
  assert.deepEqual(await replay.json(),{status:'quality_held',requestId,retryAutomatically:false});
  assert.equal(f.records.get(requestId).qualityReason,'image_quality_inconclusive');
  assert.equal(f.calls(),1);
  assert.equal(f.writes(),0);
});
test('a autorização para revisão serial reconfirma projeto e pedido após o despacho',async()=>{
 const incoming=request();let checks=0;
 const f=setup(async(who,_key,_prompt,{signal,authorizeReview})=>{
   assert.equal(who,actor);assert.equal(signal,incoming.signal);
   assert.equal(await authorizeReview(),false);
   return decodeExplorationImage(Response.json({error:'image_quality_inconclusive',retryAutomatically:false,usage:null},{status:503}));
 },{ownsProject:async(who,id)=>{assert.equal(who,actor);assert.equal(id,project);return ++checks===1;}});
 assert.deepEqual(await (await f.route.post(incoming)).json(),{status:'quality_held',requestId,qualityReason:'image_quality_inconclusive',retryAutomatically:false});
 assert.equal(checks,2);assert.equal(f.writes(),0);
});
test('indisponibilidade da revisão obrigatória barra geração serial antes da reserva',async()=>{
 const f=setup(undefined,{generationAvailable:false});
 const original=request(),headers=new Headers(original.headers);headers.set('x-compor-exploration-request-id',requestId);
 const result=await f.route.post(new Request(original,{headers}));
 assert.equal(result.status,503);
 assert.deepEqual(await result.json(),{status:'not_started',requestId,retryAutomatically:false});
 assert.equal(f.records.size,0);assert.equal(f.calls(),0);
 assert.equal((await f.route.get(new Request(`http://localhost:3000/test?projectId=${project}`))).status,200);
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
test('aceita contexto Unicode válido e escapes JSON até o limite de contrato',async()=>{
 for(const prompt of ['漢'.repeat(8000),'😀'.repeat(4000),'\u0001'.repeat(8000)]) {
  const f=setup(async(_actor,_key,actual)=>{assert.equal(actual,prompt);return new Uint8Array([1]);});
  const body=JSON.stringify({projectId:project,requestId,prompt,plan:{composition:'視'.repeat(300),contrast:'🎨'.repeat(150)},batch:{id:'00000000-0000-4000-8000-000000000005',position:1}});
  assert.ok(Buffer.byteLength(body)>16384);assert.ok(Buffer.byteLength(body)<65536);
  const result=await f.route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key},body}));
  assert.equal(result.status,200);assert.equal(f.calls(),1);
 }
});
test('prompt gerado de briefing multibyte real é aceito e enviado uma vez',async()=>{
 const f=setup();const {prompt,composition,contrast}=createExplorationPrompt({offer:'漢'.repeat(4000),audience:'字'.repeat(2000),goal:'人'.repeat(2000),direction:'新'.repeat(4000),accepted:[],rejected:[],feedback:[],sequence:0});
 const body=JSON.stringify({projectId:project,requestId,prompt,plan:{composition,contrast},batch:{id:'00000000-0000-4000-8000-000000000005',position:1}});
 assert.ok(prompt.length<=8000);assert.ok(Buffer.byteLength(body)>16384);
 const result=await f.route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':requestId},body}));
 assert.equal(result.status,200);assert.equal(f.calls(),1);
});
test('antes da reserva sinaliza falha correlacionada e preserva limite do corpo',async()=>{
 const f=setup();let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65536));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 const headers={origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':requestId};
 const result=await f.route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers,body:stream,duplex:'half'}));
 assert.equal(result.status,413);assert.deepEqual(await result.json(),{status:'not_started',requestId,retryAutomatically:false});assert.equal(cancelled,true);assert.equal(f.records.size,0);assert.equal(f.calls(),0);
 const status=await f.route.status(new Request('http://localhost:3000/api/studio/explorations/status',{method:'POST',headers,body:' '.repeat(16385)}));assert.equal(status.status,400);
});
test('aceita corpo válido no limite exato de 64 KiB',async()=>{
 const f=setup();const json=JSON.stringify({projectId:project,requestId,prompt:'Ideia'}),body=json+' '.repeat(65536-Buffer.byteLength(json));
 assert.equal(Buffer.byteLength(body),65536);
 const response=await f.route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':requestId},body}));
 assert.equal(response.status,200);assert.equal(f.calls(),1);
});
test('rejeita UTF-8 ou texto Unicode malformado e ID divergente antes da reserva',async()=>{
 const f=setup();const headers={origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':requestId};
 for(const body of [new Uint8Array([0xc3,0x28]),JSON.stringify({projectId:project,requestId,prompt:'\ud800'}),JSON.stringify({projectId:project,requestId,prompt:'texto',plan:{composition:'\udc00',contrast:'claro'}}),JSON.stringify({projectId:project,requestId:'00000000-0000-4000-8000-000000000099',prompt:'texto'})]) {
  const result=await f.route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers,body}));
  assert.equal(result.status,400);assert.deepEqual(await result.json(),{status:'not_started',requestId,retryAutomatically:false});
 }
 assert.equal(f.records.size,0);assert.equal(f.calls(),0);
});
test('falha em reserve é sempre unknown mesmo com cabeçalho correlacionado',async()=>{
 let calls=0;
 const store={reserve:async()=>{calls++;throw Error('response lost');},put:async()=>{},finish:async()=>{},reject:async()=>{},list:async()=>[],read:async()=>new Response()};
 const route=createExplorationImageRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>actor,ownsProject:async()=>true,store,generate:async()=>{throw Error('unexpected');}});
 const result=await route.post(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':requestId},body:JSON.stringify({projectId:project,requestId,prompt:'texto'})}));
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'unknown',requestId,retryAutomatically:false});assert.equal(calls,1);
});
test('runtime indisponível sinaliza que esta chamada não iniciou a reserva',async()=>{
 const previous=process.env.COMPOR_PRIVATE_IMAGES_ENABLED;process.env.COMPOR_PRIVATE_IMAGES_ENABLED='false';
 try {
  const result=await explorationPost(new Request('http://localhost:3000/api/studio/explorations',{method:'POST',headers:{'x-compor-exploration-request-id':requestId}}));
  assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'not_started',requestId,retryAutomatically:false});
 } finally {if(previous===undefined)delete process.env.COMPOR_PRIVATE_IMAGES_ENABLED;else process.env.COMPOR_PRIVATE_IMAGES_ENABLED=previous;}
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExplorationBatchRoute} from '../lib/exploration-batch-route.ts';
import {ExplorationBatchRejected} from '../lib/exploration-batch-coordinator.ts';
import {ExplorationCredentialsRejected} from '../lib/exploration-image-route.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'token-synthetic'},origin='https://compor.test',key='sk-synthetic_abcdefghijklmnopqrstuvwxyz';
const plan={version:1,items:[1,2,3].map(position=>({position,creativePrompt:`Caminho ${position}`,composition:`Composição ${position}`,contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`,prompt:`Prompt completo ${position}`}))};
const body={projectId:id(2),conversationId:'references',batchId:id(3),planRequestId:id(4),context:{idea:'Ideia sintética'},plan,planBinding:'signed-synthetic',imageIds:[id(5),id(6),id(7)]};
const request=(value=body,headers={})=>new Request(origin+'/api/studio/exploration-batches/execute',{method:'POST',headers:{origin,'content-type':'application/json','x-compor-openai-key':key,...headers},body:JSON.stringify(value)});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture(){const calls=[],pending=new Map(),state={reservation:{state:'running',isNew:true},permitted:true,proof:true};const store={
 reserveBatch:async(...args)=>{calls.push(['reserve',...args]);return state.reservation;},
 replaceRejected:async(...args)=>{calls.push(['replace',...args]);return state.reservation;},
 plan:async(a,p,id,value)=>{calls.push(['plan',id,value]);},put:async(a,p,id,bytes)=>{calls.push(['put',id,bytes.length]);},
 finish:async(a,p,id,value,proof)=>{calls.push(['finish',id,value,proof]);},reject:async(a,p,id,proof)=>{calls.push(['reject',id,proof]);},
 };const route=createExplorationBatchRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>state.permitted,verifyPlan:async()=>state.proof,store,generate:async(a,k,prompt)=>{calls.push(['generate',prompt]);const d=deferred();pending.set(prompt,d);return d.promise;}});return {route,calls,pending,state};}
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,1));}throw Error('condition not reached');};

test('uma reserva atômica válida inicia as três imagens e confirma independentemente',async()=>{
 const f=fixture(),promise=f.route.post(request());await wait(()=>f.pending.size===3);
 assert.equal(f.calls.filter(c=>c[0]==='reserve').length,1);assert.equal(f.calls.filter(c=>c[0]==='generate').length,3);
 for(const pos of [3,1,2])f.pending.get(`Prompt completo ${pos}`).resolve(new Uint8Array([137,80,78,71,13,10,26,10]));
 const response=await promise,result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'completed');assert.deepEqual(result.images.map(x=>x.status),['completed','completed','completed']);
 assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='completed').length,3);assert.doesNotMatch(JSON.stringify(result),/sk-synthetic|signed-synthetic|Prompt completo/);
 const reserved=f.calls.find(c=>c[0]==='reserve')[2];
 for(const [index,imageId] of body.imageIds.entries()){
  const proof=f.calls.find(c=>c[0]==='finish'&&c[1]===imageId)[3];
  assert.equal(reserved.rejectionDigests[index],createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'),'prova deve usar bytes originais como as RPCs');
 }
});

test('reposição explícita somente reserva um novo filho e não reenvia os demais',async()=>{
 const {imageIds,...base}=body;const f=fixture(),replacement={...base,position:2,previousId:imageIds[1],requestId:id(8)};
 const pending=f.route.replace(request(replacement));await wait(()=>f.pending.size===1);
 assert.deepEqual(f.calls.filter(call=>call[0]==='generate').map(call=>call[1]),['Prompt completo 2']);
 const reserved=f.calls.find(call=>call[0]==='replace')[2];assert.equal(reserved.previousId,id(6));assert.equal(reserved.requestId,id(8));
 f.pending.get('Prompt completo 2').resolve(new Uint8Array([1]));const response=await pending,result=await response.json();
 assert.equal(result.status,'completed');assert.equal(result.requestId,id(8));
 const proof=f.calls.find(call=>call[0]==='finish')[3];assert.equal(reserved.rejectionDigest,createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'));
 f.state.reservation={state:'running',isNew:false};const replay=await f.route.replace(request(replacement));assert.equal(replay.status,409);assert.equal(f.calls.filter(call=>call[0]==='generate').length,1);
});
test('reposição interrompe em prova inválida e preserva rejeição ou incerteza sem repetir',async()=>{
 const {imageIds,...base}=body,replacement={...base,position:2,previousId:imageIds[1],requestId:id(8)};
 const denied=fixture();denied.state.proof=false;assert.equal((await denied.route.replace(request(replacement))).status,403);assert.deepEqual(denied.calls,[]);
 for(const [error,expected] of [[new ExplorationCredentialsRejected(),'rejected'],[Error('transport uncertain'),'unknown']]){
  const f=fixture(),pending=f.route.replace(request(replacement));await wait(()=>f.pending.size===1);f.pending.get('Prompt completo 2').reject(error);
  assert.equal((await (await pending).json()).status,expected);assert.equal(f.calls.filter(call=>call[0]==='generate').length,1);
  assert.equal(f.calls.some(call=>call[0]===(expected==='rejected'?'reject':'finish')),true);
 }
});

test('reserva repetida nunca despacha nem reemite capacidade',async()=>{
 const f=fixture();f.state.reservation={state:'running',isNew:false};const response=await f.route.post(request()),result=await response.json();
 assert.equal(response.status,409);assert.equal(result.status,'running');assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);
});

test('prova ou propriedade incorreta não reserva nem gera',async()=>{
 for(const field of ['permitted','proof']){const f=fixture();f.state[field]=false;const response=await f.route.post(request());assert.ok([403,404].includes(response.status));assert.deepEqual(f.calls,[]);}
});

test('sucesso parcial e rejeição/unknown são preservados sem reenvio',async()=>{
 const f=fixture(),promise=f.route.post(request());await wait(()=>f.pending.size===3);
 f.pending.get('Prompt completo 1').resolve(new Uint8Array([1]));f.pending.get('Prompt completo 2').reject(new ExplorationBatchRejected());f.pending.get('Prompt completo 3').reject(Error('private provider details'));
 const response=await promise,result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'unknown');assert.deepEqual(result.images.map(x=>x.status),['completed','rejected','unknown']);
 assert.equal(f.calls.filter(c=>c[0]==='generate').length,3);assert.ok(f.calls.some(c=>c[0]==='reject'&&c[1]===id(6)));assert.doesNotMatch(JSON.stringify(result),/private provider/);
});

test('origem inválida e ids duplicados falham antes de reservar',async()=>{
 const f=fixture();assert.equal((await f.route.post(request(body,{origin:'https://evil.test'}))).status,403);
 assert.equal((await f.route.post(request({...body,imageIds:[id(5),id(5),id(7)]}))).status,400);assert.deepEqual(f.calls,[]);
});

test('resposta perdida da reserva ou forma inválida nunca autoriza geração',async()=>{
 const f=fixture();f.state.reservation={state:'completed',isNew:true};
 let response=await f.route.post(request());assert.equal(response.status,503);assert.equal((await response.json()).status,'unknown');
 assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);
 const g=fixture();g.state.reservation={state:'unexpected',isNew:true};
 response=await g.route.post(request());assert.equal(response.status,503);assert.equal((await response.json()).status,'unknown');
 assert.equal(g.calls.filter(c=>c[0]==='generate').length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExplorationPlanner,createExplorationPlannerBindings,verifyExplorationPlan,validateExplorationPlan,validateCompletedExplorationPlan} from '../src/exploration-planner.mjs';
import {createManagedExplorationPlanProvider} from '../src/exploration-plan-provider.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key='sk-synthetic-visual-credential-only',secret=Buffer.alloc(32,18);
const context={idea:'Oficina sintética',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const scope={actor:{userId:id(1),token:'synthetic'},projectId:id(2),conversationId:'references',batchId:id(3),requestId:id(4),context};
const plan={version:1,items:[1,2,3].map(position=>({position,creativePrompt:`Direção ${position}`,composition:`Composição ${position}`,contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`}))};
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
function visual(){
 const original={sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',byteLength:bytes.length};
 return {visualInput:{version:1,policy:'optimized-v1',entries:[1,2].map(n=>({id:id(n+10),ordinal:n,role:'reference',inputOrigin:'local-upload',original:{...original},transport:{...original,width:1,height:1},transformation:'none'}))},referenceImages:[1,2].map(n=>({id:id(n+10),mime:'image/png',data:bytes.toString('base64')}))};
}
function fixture(){
 let record=null,creates=0,reads=0,finishes=0,seen,observed={status:'completed',turnId:'turn_visual',plan};
 const bindings=createExplorationPlannerBindings({secret,source:'byok',apiKey:key});
 const store={async reserve(value){if(record)return record.inputDigest===value.inputDigest?{status:'existing',record}:{status:'conflict'};record={userId:value.userId,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.requestId,attemptId:id(5),inputDigest:value.inputDigest,state:'starting',binding:null};return{status:'reserved',record};},async get(){return record;},async bind(value){record.binding=value.binding;record.state='running';},async finish(value){assert.notEqual(record.state,'completed');finishes++;record.state=value.state;}};
 const provider={async create(value){creates++;seen=value;return{sessionId:'sess_visual'};},async get(){reads++;return observed;}};
 const build=(options={})=>createExplorationPlanner({store,provider,bindings,authorize:async()=>true,authorizeVisualInput:async()=>true,...options});
 return{bindings,build,provider,store,setObserved:x=>observed=x,get record(){return record;},get seen(){return seen;},get counts(){return{creates,reads,finishes};}};
}

test('planner visual envia todos os bytes e recupera plano sem blobs nem outro POST',async()=>{
 const f=fixture(),input={...scope,...visual()},p=f.build();assert.equal((await p.submit(input)).status,'running');
 assert.deepEqual(f.seen.referenceImages,input.referenceImages);assert.deepEqual(f.seen.visualInput,input.visualInput);
 const pollInput={...scope,visualInput:input.visualInput},result=await p.poll(pollInput);
 assert.equal(result.status,'completed');assert.equal(verifyExplorationPlan({bindings:f.bindings,input:pollInput,plan:result.plan,token:result.planBinding}),true);
 assert.equal((await p.poll(pollInput)).planBinding,result.planBinding);
 assert.deepEqual(f.counts,{creates:1,reads:2,finishes:1});assert.equal(JSON.stringify(f.record).includes(input.referenceImages[0].data),false);
});

test('manifesto não pode ser removido, vazio, reordenado ou mudado para reutilizar prova',async()=>{
 const f=fixture(),v=visual(),p=f.build();await p.submit({...scope,...v});const result=await p.poll({...scope,visualInput:v.visualInput});
 const reordered=structuredClone(v.visualInput);reordered.entries.reverse().forEach((e,i)=>e.ordinal=i+1);
 const changed=structuredClone(v.visualInput);changed.entries[0].original.sha256='f'.repeat(64);changed.entries[0].transformation='optimized-v1';
 for(const value of [undefined,{version:1,policy:'optimized-v1',entries:[]},reordered,changed]){
  const input={...scope,...(value===undefined?{}:{visualInput:value})};
  assert.equal(verifyExplorationPlan({bindings:f.bindings,input,plan:result.plan,token:result.planBinding}),false);
  assert.equal((await p.poll(input)).status,'unknown');
 }
 assert.equal(f.counts.reads,1);
 const wrong=createExplorationPlannerBindings({secret,source:'default',apiKey:key});
 assert.equal((await f.build({bindings:wrong}).poll({...scope,visualInput:v.visualInput})).status,'unknown');
});

test('bytes ausentes/adulterados e campos visuais sem manifesto não reservam',async()=>{
 const variants=[v=>delete v.referenceImages,v=>v.referenceImages=[],v=>v.referenceImages.reverse(),v=>v.referenceImages[0].data+='AAAA',v=>delete v.visualInput];
 for(const mutate of variants){const f=fixture(),v=visual();mutate(v);assert.equal((await f.build().submit({...scope,...v})).status,'unavailable');assert.equal(f.record,null);assert.equal(f.counts.creates,0);}
});

test('contexto e bytes são congelados antes de await de autorização',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),f=fixture(),input=structuredClone({...scope,...visual()});
 const original=structuredClone(input),p=f.build({authorize:async()=>{await gate;return true;}}),pending=p.submit(input);
 input.context.idea='Texto alterado';input.visualInput.entries.reverse();input.referenceImages[0].data='AAAA';release();
 assert.equal((await pending).status,'running');assert.equal(f.seen.context.idea,original.context.idea);assert.deepEqual(f.seen.referenceImages,original.referenceImages);
 assert.equal((await p.poll({...scope,visualInput:original.visualInput})).status,'completed');
});

test('unknown visual e replays não criam outra sessão',async()=>{
 const f=fixture(),v=visual(),p=f.build();await p.submit({...scope,...v});f.setObserved({status:'unknown'});
 assert.equal((await p.poll({...scope,visualInput:v.visualInput})).status,'unknown');assert.equal((await p.submit({...scope,...v})).status,'unknown');assert.equal(f.counts.creates,1);
});

test('provider gerenciado envia input_image ordenado sem tools e recusa pacote incompleto',async()=>{
 const calls=[],v=visual(),provider=createManagedExplorationPlanProvider({apiKey:key,fetch:async(url,options)=>{calls.push({url:String(url),...options});return Response.json({id:'sess_visual'});}});
 await provider.create({scope,context,...v});const body=JSON.parse(calls[0].body);
 assert.equal(body.agent.multi_agent.enabled,false);assert.deepEqual(body.agent.tools,[]);assert.equal(body.environment.type,'none');
 assert.deepEqual(body.input[0].content.filter(item=>item.type==='input_image').map(item=>item.image_url),v.referenceImages.map(image=>`data:${image.mime};base64,${image.data}`));
 assert.deepEqual(JSON.parse(body.input[0].content[0].text),{context,visualInput:v.visualInput});
 assert.equal(body.input[0].content[1].text.includes(v.referenceImages[0].id),true);
 await assert.rejects(()=>provider.create({scope,context,visualInput:v.visualInput,referenceImages:[]}));assert.equal(calls.length,1);
});

function candidates(){const v=visual();v.visualInput.version=2;v.visualInput.externalConsent=true;v.visualInput.entries[0].source=null;Object.assign(v.visualInput.entries[1],{inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}});return v;}
test('triagem v2 assina o subset com todos uploads e não permite alterar lote ou seleção',async()=>{
 const v=candidates(),f=fixture(),p=f.build(),raw={...plan,version:2,referenceIds:[v.visualInput.entries[0].id]};
 f.setObserved({status:'completed',turnId:'turn_visual',plan:raw});assert.equal((await p.submit({...scope,...v})).status,'running');
 const input={...scope,visualInput:v.visualInput},result=await p.poll(input);assert.equal(result.status,'completed');assert.deepEqual(result.plan.referenceIds,raw.referenceIds);
 assert.equal(verifyExplorationPlan({bindings:f.bindings,input,plan:result.plan,token:result.planBinding}),true);
 assert.equal(verifyExplorationPlan({bindings:f.bindings,input:{...input,batchId:id(99)},plan:result.plan,token:result.planBinding}),false);
 const all=v.visualInput.entries.map(e=>e.id),changed={...result.plan,referenceIds:all};assert.equal(validateCompletedExplorationPlan(changed,context,v.visualInput),true);assert.equal(verifyExplorationPlan({bindings:f.bindings,input,plan:changed,token:result.planBinding}),false);
 assert.equal(validateCompletedExplorationPlan(result.plan,context),false);assert.equal(validateExplorationPlan(raw,context),null);
 for(const referenceIds of [[],all.slice(1),[...all].reverse(),[all[0],id(99)]])assert.equal(validateExplorationPlan({...raw,referenceIds},context,v.visualInput),null);
 assert.equal((await p.poll(input)).status,'completed');assert.deepEqual(f.counts,{creates:1,reads:2,finishes:1});
});
test('omissão de upload ou resultado textual para manifesto v2 não vira plano executável',async()=>{
 for(const bad of [plan,{...plan,version:2,referenceIds:[]}]){const f=fixture(),v=candidates(),p=f.build();f.setObserved({status:'completed',turnId:'turn_visual',plan:bad});await p.submit({...scope,...v});assert.equal((await p.poll({...scope,visualInput:v.visualInput})).status,'failed');assert.equal((await p.submit({...scope,...v})).status,'failed');assert.equal(f.counts.creates,1);}
});
test('provider instrui triagem v2 no mesmo turno sem criar outra sessão de análise',async()=>{
 const calls=[],v=candidates(),provider=createManagedExplorationPlanProvider({apiKey:key,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'sess_triage'});}});
 await provider.create({scope,context,...v});assert.equal(calls.length,1);assert.match(calls[0].agent.instructions,/OBRIGATORIAMENTE/);assert.match(calls[0].agent.instructions,/"version":2/);assert.deepEqual(calls[0].agent.tools,[]);assert.equal(calls[0].input[0].content.filter(c=>c.type==='input_image').length,2);
});
test('cada imagem recebe a origem do seu item do manifesto em uma seleção mista',async()=>{
 const v=candidates();
 const generatedBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
 const original={sha256:createHash('sha256').update(generatedBytes).digest('hex'),mime:'image/png',byteLength:generatedBytes.length};
 const generated={...v.visualInput.entries[0],id:id(35),inputOrigin:'generated',source:{projectId:scope.projectId,imageId:id(36)},original,transport:{...original,width:1,height:1}};
 v.visualInput.entries.unshift(generated);
 v.visualInput.entries.forEach((entry,index)=>{entry.ordinal=index+1;});
 v.referenceImages.unshift({id:generated.id,mime:original.mime,data:generatedBytes.toString('base64')});
 let content;
 const provider=createManagedExplorationPlanProvider({apiKey:key,fetch:async(_url,options)=>{
  content=JSON.parse(options.body).input[0].content;
  return Response.json({id:'sess_mixed'});
 }});
 await provider.create({context,...v});
 for(const [index,entry] of v.visualInput.entries.entries()){
  const label=content[1+2*index];
  assert.equal(label.type,'input_text');
  assert.ok(label.text.includes(entry.inputOrigin),entry.inputOrigin);
  assert.ok(label.text.includes(entry.id),entry.id);
  assert.deepEqual(content[2+2*index],{type:'input_image',image_url:`data:image/png;base64,${v.referenceImages[index].data}`});
 }
});
test('extras sem autoridade no servidor não reservam; booleano não é autorização',async()=>{
 for(const authorizeVisualInput of [undefined,async()=>false,async()=>{throw Error('unavailable');}]){const f=fixture(),v=candidates(),p=f.build({authorizeVisualInput});assert.equal((await p.submit({...scope,...v})).status,'unavailable');assert.equal(f.record,null);assert.equal(f.counts.creates,0);}
});
test('autoridade perdida durante reserva bloqueia envio e mantém recibo incerto',async()=>{
 const f=fixture(),v=candidates();let checked=0;const p=f.build({authorizeVisualInput:async()=>++checked===1});assert.equal((await p.submit({...scope,...v})).status,'unknown');assert.equal(checked,2);assert.equal(f.record.state,'starting');assert.equal(f.counts.creates,0);
});
test('revogar admissão de extras não impede GET de plano já vinculado',async()=>{
 const f=fixture(),v=candidates(),raw={...plan,version:2,referenceIds:[v.visualInput.entries[0].id]};f.setObserved({status:'completed',turnId:'turn_visual',plan:raw});await f.build().submit({...scope,...v});
 const p=f.build({authorizeVisualInput:undefined});assert.equal((await p.poll({...scope,visualInput:v.visualInput})).status,'completed');assert.deepEqual(f.counts,{creates:1,reads:1,finishes:1});
});
test('plano textual legado nunca ganha prova visual ao acrescentar manifesto vazio',async()=>{
 const f=fixture(),p=f.build();await p.submit(scope);const result=await p.poll(scope),empty={version:1,policy:'optimized-v1',entries:[]};
 assert.equal(result.status,'completed');
 assert.equal(validateCompletedExplorationPlan(result.plan,context,empty),true,'validação estrutural não atesta a entrada do fornecedor');
 assert.equal(verifyExplorationPlan({bindings:f.bindings,input:{...scope,visualInput:empty},plan:result.plan,token:result.planBinding}),false);
 assert.equal((await p.poll({...scope,visualInput:empty})).status,'unknown');assert.equal(f.counts.creates,1);assert.equal(f.counts.reads,1);
});

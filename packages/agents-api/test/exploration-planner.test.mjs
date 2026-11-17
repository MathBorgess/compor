import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationPlanner,createExplorationPlannerBindings} from '../src/exploration-planner.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key=`sk-synthetic-${'x'.repeat(30)}`, secret=Buffer.alloc(32,7);
const context={idea:'Oficina aberta',offer:'Oficina sintética',audience:'Professores',goal:'Inscrever',direction:'Clara',accepted:[],rejected:[],feedback:[],offerFacts:[{id:'price',label:'Preço',value:'R$ 20',status:'confirmed'},{id:'date',label:'Data',value:'30 de abril',status:'pending'}]};
const scope={actor:{userId:id(1),token:'synthetic'},projectId:id(2),conversationId:id(3),batchId:id(4),requestId:id(5),context};
const plan={version:1,items:[1,2,3].map(n=>({position:n,creativePrompt:`Caminho visual ${['editorial','colagem','geometria'][n-1]}`,composition:`Composição ${n}`,contrast:`Contraste ${n}`,differenceFromOthers:`Diferença ${n}`}))};
function fixture(){
 let record=null,authorized=true,createCount=0,lookupCount=0,result={status:'completed',turnId:'turn_test',plan},createResult={sessionId:'sess_test'};
 const store={async reserve(c){if(record)return record.inputDigest===c.inputDigest?{status:'existing',record}:{status:'conflict'};record={...c,state:'starting',attemptId:id(6),binding:null};return{status:'reserved',record};},async get(){return record;},async bind(c){record.binding=c.binding;record.state='running';},async finish(c){record.state=c.state;}};
 const provider={async create(){createCount++;if(createResult instanceof Error)throw createResult;return createResult;},async get(){lookupCount++;return result;}};
 const bindings=createExplorationPlannerBindings({secret,source:'byok',apiKey:key});
 const build=(b=bindings)=>createExplorationPlanner({store,bindings:b,provider,authorize:async()=>authorized});
 return {build,store,get record(){return record;},get counts(){return {createCount,lookupCount};},setAuthorized(v){authorized=v;},setResult(v){result=v;},setCreate(v){createResult=v;}};
}
test('reserva e recupera exatamente um plano de três posições, sem salvar conteúdo',async()=>{
 const f=fixture(),p=f.build();const start=await p.submit(scope);assert.equal(start.status,'running');assert.equal(f.counts.createCount,1);
 assert.equal(JSON.stringify(f.record).includes('Oficina aberta'),false);assert.equal(JSON.stringify(f.record).includes('R$ 20'),false);
 const out=await p.poll(scope);assert.equal(out.status,'completed');assert.equal(out.plan.items.length,3);assert.match(out.plan.items[0].prompt,/R\$ 20/);assert.doesNotMatch(out.plan.items[0].prompt,/30 de abril/);assert.equal(out.retryAutomatically,false);
 assert.equal(f.counts.createCount,1);assert.ok(out.planBinding);
 const duplicate=await p.submit(scope);assert.notEqual(duplicate.status,'running');assert.equal(f.counts.createCount,1);
});
test('bloqueia fornecedor após falha de transporte ou reserva existente sem prova',async()=>{
 const f=fixture();f.setCreate(Error('timeout'));const p=f.build();assert.equal((await p.submit(scope)).status,'unknown');assert.equal((await p.submit(scope)).status,'unknown');assert.equal((await p.poll(scope)).status,'unknown');assert.deepEqual(f.counts,{createCount:1,lookupCount:0});
});
test('autoridade, escopo, lote, contexto e credenciais diferentes impedem consulta',async()=>{
 const f=fixture(),p=f.build();await p.submit(scope);f.setAuthorized(false);assert.equal((await p.poll(scope)).status,'unavailable');f.setAuthorized(true);
 for(const change of [{batchId:id(9)},{conversationId:id(9)},{projectId:id(9)},{actor:{userId:id(9),token:'other'}},{context:{...context,idea:'Alterada'}}])assert.equal((await p.poll({...scope,...change})).status,'unknown');
 for(const options of [{secret,source:'default',apiKey:key},{secret,source:'byok',apiKey:`${key}changed`}])assert.equal((await f.build(createExplorationPlannerBindings(options)).poll(scope)).status,'unknown');
 assert.equal(f.counts.lookupCount,0);
});
test('saídas malformadas, duplicadas, credencial e falhas não viram plano',async()=>{
 for(const value of [null,{...plan,extra:1},{...plan,items:[plan.items[0],plan.items[0],plan.items[2]]},{...plan,items:plan.items.map(x=>({...x,creativePrompt:'  MESMO  '}))},{...plan,items:plan.items.map((x,i)=>i?x:{...x,creativePrompt:key})}]){
  const f=fixture(),p=f.build();await p.submit(scope);f.setResult({status:'completed',turnId:'turn_test',plan:value});assert.equal((await p.poll(scope)).status,'failed');assert.equal(f.counts.createCount,1);
 }
 const f=fixture(),p=f.build();await p.submit(scope);f.setResult({status:'failed'});assert.equal((await p.poll(scope)).status,'failed');assert.equal((await p.submit(scope)).status,'failed');assert.equal(f.counts.createCount,1);
});

test('prova de plano vincula lote, contexto, origem e conteúdo sem conceder autorização',async()=>{
 const {verifyExplorationPlan}=await import('../src/exploration-planner.mjs');
 const f=fixture(),b=createExplorationPlannerBindings({secret,source:'byok',apiKey:key}),p=f.build(b);await p.submit(scope);const out=await p.poll(scope);
 assert.equal(verifyExplorationPlan({bindings:b,input:scope,plan:out.plan,token:out.planBinding}),true);
 assert.equal(verifyExplorationPlan({bindings:b,input:{...scope,batchId:id(10)},plan:out.plan,token:out.planBinding}),false);
 assert.equal(verifyExplorationPlan({bindings:b,input:scope,plan:{...out.plan,items:out.plan.items.map((item,i)=>i?item:{...item,prompt:'alterado'})},token:out.planBinding}),false);
 assert.equal(verifyExplorationPlan({bindings:createExplorationPlannerBindings({secret,source:'default',apiKey:key}),input:scope,plan:out.plan,token:out.planBinding}),false);
});

test('adaptador Agents cria somente uma sessão sem tools e lê turno e itens existentes',async()=>{
 const {createManagedExplorationPlanProvider}=await import('../src/exploration-plan-provider.mjs');const calls=[];
 const provider=createManagedExplorationPlanProvider({apiKey:key,fetch:async(url,options)=>{calls.push({url:String(url),options});
  if(options.method==='POST')return Response.json({id:'sess_test'});
  if(String(url).includes('/items?'))return Response.json({has_more:false,data:[{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:'turn_test',content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
  if(String(url).includes('/turns?'))return Response.json({has_more:false,data:[{id:'turn_test',session_id:'sess_test',subagent_id:null,status:'completed'}]});
  return Response.json({id:'sess_test',status:'idle',agent:{tools:[]},required_actions:[]});
 }});
 assert.deepEqual(await provider.create({scope,context}),{sessionId:'sess_test'});const payload=JSON.parse(calls[0].options.body);assert.deepEqual(payload.agent.tools,[]);assert.equal(payload.environment.type,'none');
 const value=await provider.get({sessionId:'sess_test'});assert.equal(value.status,'completed');assert.deepEqual(value.plan,plan);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});

test('o agente recebe apenas fatos confirmados e o envelope conserva valores literais',async()=>{
 const f=fixture(),p=f.build();let seen;f.provider=undefined;
 const bindings=createExplorationPlannerBindings({secret,source:'byok',apiKey:key});
 const custom=createExplorationPlanner({store:f.store,bindings,authorize:async()=>true,provider:{async create(input){seen=input;return{sessionId:'sess_test'};},async get(){return{status:'completed',turnId:'turn_test',plan};}}});
 await custom.submit({...scope,context:{...context,accepted:['Fundo claro'],rejected:['Sombras'],feedback:[{action:'selected',comment:'Gostei',composition:'editorial',contrast:'suave'}]}});
 assert.equal(seen.context.offer,'Oficina sintética');assert.equal(seen.context.goal,'Inscrever');assert.deepEqual(seen.context.accepted,['Fundo claro']);assert.deepEqual(seen.context.rejected,['Sombras']);assert.equal(seen.context.feedback[0].action,'selected');assert.deepEqual(seen.context.offerFacts,[context.offerFacts[0]]);
});

test('falhas de leitura, sessões ambíguas e ferramentas inesperadas não criam um plano',async()=>{
 const {createManagedExplorationPlanProvider}=await import('../src/exploration-plan-provider.mjs');
 for(const variant of ['fail','tools','action','ambiguous','missing']){
  const calls=[];const p=createManagedExplorationPlanProvider({apiKey:key,fetch:async(url,options)=>{calls.push(options.method);if(variant==='fail')return new Response('',{status:500});if(String(url).includes('/turns?'))return Response.json({has_more:variant==='missing',data:variant==='ambiguous'?[{id:'turn_1',session_id:'sess_test',subagent_id:null,status:'completed'},{id:'turn_2',session_id:'sess_test',subagent_id:null,status:'completed'}]:[]});return Response.json({id:'sess_test',status:'idle',agent:{tools:variant==='tools'?[{name:'forbidden'}]:[]},required_actions:variant==='action'?[{type:'function_call'}]:[]});}});
  await assert.rejects(()=>p.get({sessionId:'sess_test'}));assert.equal(calls.includes('POST'),false);
 }
});

test('contrato puro valida contexto e plano armazenado sem depender da prova',async()=>{
 const {validateExplorationContext,validateExplorationPlan,validateCompletedExplorationPlan}=await import('../src/exploration-plan-contract.mjs');
 assert.equal(validateExplorationContext(context),true);
 assert.equal(validateExplorationContext({...context,offer:key}),false);
 assert.equal(validateExplorationContext({...context,feedback:[{action:'selected',comment:'ok',composition:'ok',contrast:'ok',secret:'extra'}]}),false);
 const final=validateExplorationPlan(plan,context);assert.equal(validateCompletedExplorationPlan(final,context),true);
 assert.equal(validateCompletedExplorationPlan({...final,items:final.items.map((item,i)=>i?item:{...item,prompt:'alterado'})},context),false);
 assert.equal(validateExplorationPlan({...plan,items:plan.items.map((item,i)=>i?item:{...item,composition:plan.items[1].composition})},context),null);
});

test('negação de autorização e estado desconhecido não disparam nova sessão',async()=>{
 const f=fixture(),p=f.build();f.setAuthorized(false);assert.equal((await p.submit(scope)).status,'unavailable');assert.deepEqual(f.counts,{createCount:0,lookupCount:0});
 f.setAuthorized(true);await p.submit(scope);f.setResult({status:'unknown'});assert.equal((await p.poll(scope)).status,'unknown');assert.equal((await p.submit(scope)).status,'unknown');assert.equal(f.counts.createCount,1);
});

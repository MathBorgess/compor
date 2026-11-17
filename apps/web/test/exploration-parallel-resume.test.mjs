import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
import {createExplorationParallelResumeRoute} from '../lib/exploration-parallel-resume-route.ts';
import {createExplorationParallelResumeStore} from '../lib/exploration-parallel-resume-store.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='https://compor.test',key=`sk-synthetic-${'x'.repeat(30)}`,actor={userId:id(1),token:'synthetic-token'};
const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const input={projectId:id(2),conversationId:'references',batchId:id(3),intentId:id(4),expectedEpoch:1,context,apiKey:key};
const bindings=(source='byok',apiKey=key)=>createExplorationPlannerBindings({secret:Buffer.alloc(32,7),source,apiKey});
const req=(body,headers={},signal)=>new Request(origin+'/resume',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body),signal});
function fixture(){const calls=[],state={actor,owned:true,enabled:true,error:false,result:{status:'resumed',intentEpoch:1,reviewEpoch:3},receipt:null};const store={resume:async value=>{calls.push(['resume',value]);if(state.error)throw Error('sensitive');return state.result;},get:async value=>{calls.push(['get',value]);if(state.error)throw Error('sensitive');return state.receipt;}};return {calls,state,route:createExplorationParallelResumeRoute({appOrigin:origin,apiKey:key,bindings:bindings(),allowResume:()=>state.enabled,resolveActor:async()=>state.actor,ownsProject:async()=>state.owned,store})};}
test('retomada deriva capability do escopo e não divulga segredo',async()=>{
 const f=fixture();const response=await f.route.resume(req(input));assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'resumed',intentEpoch:1,reviewEpoch:3,retryAutomatically:false});
 const sent=f.calls[0][1];assert.equal(sent.actor,actor);assert.equal(sent.pieceId,null);assert.match(sent.intentSecret,/^[0-9a-f]{64}$/);assert.doesNotMatch(JSON.stringify(await (await f.route.resume(req(input))).json()),/sk-synthetic|intentSecret/);
});
test('autorização, origem, credencial, escopo e flag impedem RPC',async()=>{
 for(const mutation of [f=>{f.state.actor=null;},f=>{f.state.owned=false;},f=>{f.state.enabled=false;}]){const f=fixture();mutation(f);assert.ok([401,404,503].includes((await f.route.resume(req(input))).status));assert.equal(f.calls.length,0);}
 for(const value of [{...input,apiKey:key+'x'},{...input,context:{...context,idea:key}},{...input,expectedEpoch:-1},{...input,intentId:'invalid'}]){const f=fixture();assert.equal((await f.route.resume(req(value))).status,400);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.route.resume(req(input,{origin:'https://evil.test'}))).status,403);assert.equal(f.calls.length,0);
 const abort=new AbortController();abort.abort();assert.equal((await f.route.resume(req(input,{},abort.signal))).status,409);assert.equal(f.calls.length,0);
});
test('diferentes fontes e credenciais derivam provas distintas e falha de RPC não dispara repetição',async()=>{
 const first=fixture();await first.route.resume(req(input));const original=first.calls[0][1].intentSecret;
 for(const next of [bindings('default'),bindings('byok',key+'a')]){const f=fixture();const route=createExplorationParallelResumeRoute({appOrigin:origin,apiKey:key,bindings:next,allowResume:()=>true,resolveActor:async()=>actor,ownsProject:async()=>true,store:{resume:async value=>{assert.notEqual(value.intentSecret,original);return {status:'revoked'};},get:async()=>null}});assert.equal((await (await route.resume(req(input))).json()).status,'revoked');}
 const f=fixture();f.state.error=true;const result=await f.route.resume(req(input));assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'unknown',retryAutomatically:false});assert.equal(f.calls.length,1);
});
test('status recupera receipt sem reabrir gate e ausência difere de falha',async()=>{
 const f=fixture(),scope={projectId:input.projectId,intentId:input.intentId};let response=await f.route.status(req(scope));assert.deepEqual(await response.json(),{status:'absent',...scope});
 f.state.receipt={status:'not_paused',intentEpoch:1,reviewEpoch:4};response=await f.route.status(req(scope));assert.deepEqual(await response.json(),{...f.state.receipt,...scope});assert.equal(f.calls.filter(c=>c[0]==='resume').length,0);
 f.state.error=true;response=await f.route.status(req(scope));assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/sensitive|absent/);
});
test('resposta de retomada perdida é consultada sem reexecutar a mutação',async()=>{
 let receipt=null,mutations=0;const route=createExplorationParallelResumeRoute({appOrigin:origin,apiKey:key,bindings:bindings(),allowResume:()=>true,resolveActor:async()=>actor,ownsProject:async()=>true,store:{resume:async()=>{mutations++;receipt={status:'resumed',intentEpoch:1,reviewEpoch:3};throw Error('resposta perdida');},get:async()=>receipt}});
 const response=await route.resume(req(input));assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unknown',retryAutomatically:false});
 const result=await route.status(req({projectId:input.projectId,intentId:input.intentId}));assert.deepEqual(await result.json(),{...receipt,projectId:input.projectId,intentId:input.intentId});assert.equal(mutations,1);
});
test('adapter transmite token pessoal e valida respostas da RPC',async()=>{
 const calls=[];let result={status:'resumed',intentEpoch:1,reviewEpoch:3};const store=createExplorationParallelResumeStore({service:'https://supabase.test',key:'publishable'},async(url,options)=>{calls.push({url:String(url),...options,body:JSON.parse(options.body)});return Response.json(result);});
 const value={actor,projectId:input.projectId,pieceId:null,batchId:input.batchId,intentId:input.intentId,intentSecret:'a'.repeat(64),expectedEpoch:1};assert.deepEqual(await store.resume(value),result);assert.equal(calls[0].headers.authorization,`Bearer ${actor.token}`);assert.equal(calls[0].body.p_expected_epoch,1);assert.equal(calls[0].body.p_piece_id,null);
 result=null;assert.equal(await store.get({actor,projectId:input.projectId,intentId:input.intentId}),null);
 result={status:'resumed',intentEpoch:'1',reviewEpoch:3};await assert.rejects(()=>store.resume(value));
});

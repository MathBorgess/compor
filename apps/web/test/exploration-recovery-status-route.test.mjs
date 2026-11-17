import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationRecoveryStatusRoute} from '../lib/exploration-recovery-status-route.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='https://compor.test',actor={userId:id(1),token:'synthetic-token'},scope={projectId:id(2),conversationId:'references',batchId:id(3),requestId:id(4)};
const req=(body,headers={})=>new Request(origin+'/status',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
function fixture(){const calls=[],state={actor,owned:true,batch:null,plan:null,error:false};return {calls,state,route:createExplorationRecoveryStatusRoute({appOrigin:origin,resolveActor:async()=>state.actor,ownsProject:async()=>state.owned,getBatch:async(...args)=>{calls.push(['batch',...args]);if(state.error)throw Error('secret');return state.batch;},getPlan:async(value)=>{calls.push(['plan',value]);if(state.error)throw Error('secret');return state.plan;}})};}
test('ausência de lote e planner só após autenticar e verificar projeto',async()=>{
 const f=fixture();const batch=await f.route.batch(req({projectId:scope.projectId,batchId:scope.batchId}));assert.deepEqual(await batch.json(),{status:'absent',projectId:scope.projectId,batchId:scope.batchId});
 const plan=await f.route.plan(req(scope));assert.deepEqual(await plan.json(),{status:'absent',...scope});assert.deepEqual(f.calls[1][1],{actor,...scope});
 assert.equal(batch.headers.get('cache-control'),'no-store');
});
test('escopo inválido, erro e dados inválidos nunca provam ausência',async()=>{
 for(const method of ['batch','plan']){
  const value=method==='batch'?{projectId:scope.projectId,batchId:scope.batchId}:scope;
  let f=fixture();assert.equal((await f.route[method](req(value,{origin:'https://evil.test'}))).status,403);assert.deepEqual(f.calls,[]);
  f=fixture();f.state.actor=null;assert.equal((await f.route[method](req(value))).status,401);assert.deepEqual(f.calls,[]);
  f=fixture();f.state.owned=false;assert.equal((await f.route[method](req(value))).status,404);assert.deepEqual(f.calls,[]);
  f=fixture();f.state.error=true;let response=await f.route[method](req(value));assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/secret|absent/);
  f=fixture();response=await f.route[method](req({...value,projectId:'invalid'}));assert.equal(response.status,400);assert.deepEqual(f.calls,[]);
 }
});
test('planner presente é sanitizado e conflito de escopo falha fechado',async()=>{
 const f=fixture();f.state.plan={userId:actor.userId,...scope,attemptId:id(5),state:'running',inputDigest:'a'.repeat(64),binding:'provider-sensitive'};
 let response=await f.route.plan(req(scope));assert.deepEqual(await response.json(),{status:'running',...scope});
 f.state.plan={...f.state.plan,batchId:id(8)};response=await f.route.plan(req(scope));assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/provider-sensitive|absent/);
});
test('status de lote existente é preservado',async()=>{
 const f=fixture();f.state.batch={batchId:scope.batchId,projectId:scope.projectId,pieceId:null,state:'running',completedAt:null,nextAt:null,closedAt:null,images:[]};
 const response=await f.route.batch(req({projectId:scope.projectId,batchId:scope.batchId}));assert.deepEqual(await response.json(),f.state.batch);
});

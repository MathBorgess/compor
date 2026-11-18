import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationPlannerRoute} from '../lib/exploration-planner-route.ts';
import {createExplorationPlannerStore} from '../lib/exploration-planner-store.ts';
import {createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-user-token'},projectId=id(2),conversationId=id(3),batchId=id(4),requestId=id(5),apiKey=`sk-synthetic-${'x'.repeat(30)}`;
const context={idea:'Oficina',offer:'Oferta',audience:'Professores',goal:'Participar',direction:'Clara',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const data={op:'submit',projectId,conversationId,batchId,requestId,context,intentId:id(7),apiKey};
const request=(body,headers={})=>new Request('https://compor.test/api/studio/exploration-batches/plan',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
function fixture(){const calls=[];let actorValue=actor,allow=true;const h=createExplorationPlannerRoute({appOrigin:'https://compor.test',apiKey,allowSubmit:true,resolveActor:async()=>actorValue,ownsProject:async()=>allow,bindings:createExplorationPlannerBindings({secret:Buffer.alloc(32,7),source:'byok',apiKey}),plannerFor:()=>({submit:async input=>(calls.push(['submit',input]),{status:'running',retryAutomatically:false,requestId}),poll:async input=>(calls.push(['poll',input]),{status:'unknown',retryAutomatically:false})})});return{h,calls,setActor:v=>actorValue=v,setAllowed:v=>allow=v};}
test('valida intenção, escopo e contexto antes de acionar planejador, poll não exige intenção',async()=>{
 const f=fixture();for(const bad of [{...data,intentId:'bad'},{...data,extra:true},{...data,conversationId:'invalid'},{...data,context:{...context,offer:2}},{...data,apiKey:'bad'}])assert.equal((await f.h(request(bad))).status,400);
 assert.equal((await f.h(request(data,{origin:'https://evil.test'}))).status,403);assert.equal(f.calls.length,0);
 f.setActor(null);assert.equal((await f.h(request(data))).status,401);f.setActor(actor);f.setAllowed(false);assert.equal((await f.h(request(data))).status,404);assert.equal(f.calls.length,0);f.setAllowed(true);
 const started=await f.h(request(data));assert.equal(started.status,202);assert.equal((await started.json()).status,'running');assert.equal(f.calls[0][1].actor,actor);assert.equal(f.calls[0][1].context.offer,'Oferta');
 const {intentId,...poll}=data;assert.equal((await f.h(request({...poll,op:'poll'}))).status,202);assert.deepEqual(f.calls.map(x=>x[0]),['submit','poll']);
});
test('adapter usa JWT da pessoa, converte references em null e exige resposta validada',async()=>{
 const calls=[];const record={userId:actor.userId,projectId,conversationId:'references',batchId,requestId,attemptId:id(6),inputDigest:'a'.repeat(64),state:'starting',binding:null};
 const store=createExplorationPlannerStore({service:'https://example.supabase.co',key:'sb_publishable_test'},async(url,options)=>{calls.push({url:String(url),options,body:JSON.parse(options.body)});const name=String(url).split('/').at(-1);if(name==='reserve_exploration_plan')return Response.json({status:'reserved',record});if(name==='get_exploration_plan')return Response.json(record);return Response.json(true);},{intentId:id(7),intentSecret:'9'.repeat(64)});
 const scope={actor,projectId,conversationId:'references',batchId,requestId};const row=await store.reserve({...scope,userId:actor.userId,inputDigest:'a'.repeat(64),completionDigest:'b'.repeat(64)});assert.equal(row.status,'reserved');
 assert.equal(calls[0].body.p_piece_id,null);assert.equal(calls[0].options.headers.authorization,`Bearer ${actor.token}`);assert.equal(calls[0].body.p_completion_digest,'b'.repeat(64));assert.equal(JSON.stringify(calls).includes(apiKey),false);
 assert.deepEqual(await store.get(scope),record);await store.bind({...scope,binding:'proof',completionSecret:'c'.repeat(64)});await store.finish({...scope,state:'completed',completionSecret:'c'.repeat(64)});assert.equal(calls.length,4);
 const bad=createExplorationPlannerStore({service:'https://example.supabase.co',key:'sb_publishable_test'},async()=>Response.json({status:'reserved',record:{...record,userId:id(99)}}),{intentId:id(7),intentSecret:'9'.repeat(64)});await assert.rejects(()=>bad.reserve({...scope,userId:actor.userId,inputDigest:'a'.repeat(64),completionDigest:'b'.repeat(64)}));
});

test('wrapper BYOK/Vault preserva fonte, vínculo e recuperação somente por GET',async()=>{
 const {prepareOpenAiRequest}=await import('../lib/openai-credential.ts');
 const {createExplorationPlanner}=await import('@compor/agents-api/exploration-planner');
 let vault=0,creates=0,lookups=0,record=null;const secret=Buffer.alloc(32,7),defaultKey=`sk-default-${'y'.repeat(30)}`;
 const provider={create:async()=>{creates++;return{sessionId:'sess_test'};},get:async()=>{lookups++;return{status:'completed',turnId:'turn_test',plan:{version:1,items:[1,2,3].map(i=>({position:i,creativePrompt:`Direção ${i}`,composition:`Composição ${i}`,contrast:`Contraste ${i}`,differenceFromOthers:`Diferença ${i}`}))}};}};
 const store={reserve:async input=>{if(record)return{status:'existing',record};record={userId:input.actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,attemptId:id(6),inputDigest:input.inputDigest,state:'starting',binding:null};return{status:'reserved',record};},get:async()=>record,bind:async input=>{record={...record,binding:input.binding,state:'running'};},finish:async input=>{record={...record,state:input.state};}};
 const deps={appOrigin:'https://compor.test',defaultEnabled:true,resolveActor:async()=>actor,ownsProject:async()=>true,resolveDefault:async()=>{vault++;return defaultKey;}};
 async function handle(body,allowSubmit=true){const prepared=await prepareOpenAiRequest(request(body),deps,{bodyLimit:65536});if(prepared instanceof Response)return prepared;if(!prepared.apiKey)return new Response(null,{status:400});const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey}),planner=createExplorationPlanner({store,bindings,provider,authorize:async()=>true});return createExplorationPlannerRoute({appOrigin:deps.appOrigin,apiKey:prepared.apiKey,allowSubmit,resolveActor:async()=>actor,ownsProject:async()=>true,bindings,plannerFor:()=>planner})(prepared.request);}
 assert.equal((await handle({...data,apiKey:'invalid'})).status,400);assert.equal(vault,0,'BYOK inválida nunca usa fallback');
 assert.equal((await handle(data)).status,202);assert.equal(creates,1);assert.equal(vault,0);
 const {intentId,...poll}=data;const changed=await handle({...poll,op:'poll',apiKey:`sk-other-${'z'.repeat(30)}`});assert.equal((await changed.json()).status,'unknown');assert.equal(lookups,0);
 const defaultPoll={...poll,op:'poll'};delete defaultPoll.apiKey;assert.equal((await(await handle(defaultPoll)).json()).status,'unknown');assert.equal(vault,1);assert.equal(lookups,0);
 const completed=await handle({...poll,op:'poll'});assert.equal((await completed.json()).status,'completed');assert.equal(lookups,1);
 const recovered=await handle({...poll,op:'poll'},false);assert.equal((await recovered.json()).status,'completed');assert.equal(creates,1);assert.equal(lookups,2);
 const denied=await handle(data,false);assert.equal(denied.status,503);assert.equal(creates,1);assert.equal(lookups,2);
});

test('flag desligada permite apenas consultar planejamento existente sem novo submit',async()=>{
 const calls=[];const disabled=createExplorationPlannerRoute({appOrigin:'https://compor.test',apiKey,allowSubmit:false,resolveActor:async()=>actor,ownsProject:async()=>true,bindings:createExplorationPlannerBindings({secret:Buffer.alloc(32,7),source:'byok',apiKey}),plannerFor:()=>({submit:async()=>{calls.push('submit');return{status:'running',retryAutomatically:false};},poll:async()=>{calls.push('poll');return{status:'unknown',retryAutomatically:false};}})});
 const blocked=await disabled(request(data));assert.equal(blocked.status,503);assert.deepEqual(await blocked.json(),{status:'unavailable',retryAutomatically:false});assert.deepEqual(calls,[]);
 const {intentId,...rest}=data;const poll=await disabled(request({...rest,op:'poll'}));assert.equal(poll.status,202);assert.equal((await poll.json()).status,'unknown');assert.deepEqual(calls,['poll']);
});

test('contexto com chave efetiva é recusado antes de acionar o planejador',async()=>{
 const f=fixture();for(const bad of [{...context,offer:`prefixo ${apiKey} sufixo`},{...context,offerFacts:[{id:'id',label:'Preço',value:apiKey,status:'pending'}]},{...context,feedback:[{action:'comment',comment:apiKey,composition:'',contrast:''}]}]){const response=await f.h(request({...data,context:bad}));assert.equal(response.status,400);}assert.deepEqual(f.calls,[]);
});

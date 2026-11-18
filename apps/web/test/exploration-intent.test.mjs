import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
import {deriveExplorationIntent} from '../lib/exploration-intent.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key=`sk-synthetic-${'x'.repeat(30)}`,secret=Buffer.alloc(32,7),actor={userId:id(1),token:'fake'};
const context={idea:'Ideia',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const input={actor,projectId:id(2),conversationId:'references',batchId:id(3),intentId:id(4),purpose:'batch',context};
const binding=(source='byok',apiKey=key)=>createExplorationPlannerBindings({secret,source,apiKey});
test('intenção depende de identidade, projeto, conversa, lote, contexto, fonte e credencial',()=>{
 const a=deriveExplorationIntent(binding(),input);assert.match(a.intentSecret,/^[0-9a-f]{64}$/);assert.equal(a.intentProofDigest,createHash('sha256').update(Buffer.from(a.intentSecret,'hex')).digest('hex'));
 for(const next of [{...input,projectId:id(8)},{...input,batchId:id(8)},{...input,intentId:id(8)},{...input,conversationId:id(8)},{...input,actor:{...actor,userId:id(8)}},{...input,context:{...context,idea:'Mudou'}}])assert.notEqual(deriveExplorationIntent(binding(),next).intentSecret,a.intentSecret);
 assert.notEqual(deriveExplorationIntent(binding('default'),input).intentSecret,a.intentSecret);assert.notEqual(deriveExplorationIntent(binding('byok',`${key}x`),input).intentSecret,a.intentSecret);
 assert.notEqual(deriveExplorationIntent(binding(),{...input,purpose:'replacement',position:1,previousId:id(7)}).intentSecret,a.intentSecret);
});

test('rota cria autorização com CAS, sem revelar capability; revogação dispensa chave',async()=>{
 const {createExplorationIntentRoute}=await import('../lib/exploration-intent-route.ts');const calls=[];
 const store={create:async(value)=>{calls.push(['create',value]);return {status:'created',epoch:3};},revoke:async(value)=>{calls.push(['revoke',value]);return {status:'revoked',epoch:4};},epoch:async()=>({epoch:2})};
 const deps={appOrigin:'https://compor.test',apiKey:key,bindings:binding(),allowCreate:true,resolveActor:async()=>actor,ownsProject:async()=>true,store};const h=createExplorationIntentRoute(deps);
 const req=(body)=>new Request('https://compor.test/x',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(body)});
 const body={projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,purpose:'batch',context,expectedEpoch:2,apiKey:key};
 const response=await h.create(req(body));assert.equal(response.status,200);const output=await response.json();assert.deepEqual(output,{status:'created',epoch:3});assert.equal(JSON.stringify(output).includes(key),false);assert.equal(JSON.stringify(output).includes(calls[0][1].intentSecret),false);
 const denied=await h.create(req({...body,expectedEpoch:-1}));assert.equal(denied.status,400);assert.equal(calls.length,1);
 const control=createExplorationIntentRoute({...deps,apiKey:undefined,bindings:undefined,allowCreate:false});const revoked=await control.revoke(req({projectId:input.projectId,intentId:input.intentId,expectedEpoch:2}));assert.equal(revoked.status,200);assert.equal(calls.at(-1)[0],'revoke');
});

test('pedido de planejamento sem intenção identificada não alcança reserva nem fornecedor',async()=>{
 const {createExplorationPlannerRoute}=await import('../lib/exploration-planner-route.ts');let calls=0;
 const h=createExplorationPlannerRoute({appOrigin:'https://compor.test',apiKey:key,allowSubmit:true,bindings:binding(),resolveActor:async()=>actor,ownsProject:async()=>true,plannerFor:()=>({submit:async()=>{calls++;return {status:'running',retryAutomatically:false};},poll:async()=>({status:'unknown',retryAutomatically:false})})});
 const req=body=>new Request('https://compor.test/x',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(body)});
 const {actor:ignored,...fields}=input;const base={...fields,requestId:id(8),op:'submit',apiKey:key};delete base.purpose;delete base.intentId;
 assert.equal((await h(req(base))).status,400);assert.equal(calls,0);
 const accepted=await h(req({...base,intentId:input.intentId}));assert.equal(accepted.status,202);assert.equal(calls,1);
});

test('composição planner → prova → execução verifica fonte, contexto e revogação',async()=>{
 const {createExplorationIntentRoute}=await import('../lib/exploration-intent-route.ts');
 const {createExplorationPlanner,verifyExplorationPlan}=await import('@compor/agents-api/exploration-planner');
 const {createExplorationPlannerRoute}=await import('../lib/exploration-planner-route.ts');
 const {createExplorationBatchRoute}=await import('../lib/exploration-batch-route.ts');
 const bindings=binding();let state='none',expectedHash='',epoch=0,record=null,creates=0,images=0,waitReservation=null;
 const intentStore={create:async value=>{if(value.expectedEpoch!==epoch)return {status:'conflict'};expectedHash=value.intentProofDigest;epoch++;state='active';return{status:'created',epoch};},revoke:async value=>{if(value.expectedEpoch!==epoch)return{status:'conflict',epoch};state='revoked';epoch++;return{status:'revoked',epoch};},epoch:async()=>({epoch})};
 const auth={appOrigin:'https://compor.test',apiKey:key,bindings,allowCreate:true,resolveActor:async()=>actor,ownsProject:async()=>true};
 const h=createExplorationIntentRoute({...auth,store:intentStore});
 const mk=(body,headers={})=>new Request('https://compor.test/test',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
 const {actor:ignored,...rawIntent}=input;const createIntent=()=>h.create(mk({...rawIntent,expectedEpoch:epoch,apiKey:key}));
 const provider={create:async()=>{creates++;return{sessionId:'sess_test'};},get:async()=>({status:'completed',turnId:'turn_test',plan:{version:1,items:[1,2,3].map(i=>({position:i,creativePrompt:`Caminho ${i}`,composition:`Composição ${i}`,contrast:`Contraste ${i}`,differenceFromOthers:`Diferença ${i}`}))}})};
 const hash=value=>createHash('sha256').update(Buffer.from(value,'hex')).digest('hex');
 const plannerFor=cap=>createExplorationPlanner({bindings,provider,authorize:async()=>true,store:{reserve:async value=>{if(state!=='active'||hash(cap.intentSecret)!==expectedHash)return {status:'busy'};record={userId:actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:value.requestId,attemptId:id(12),inputDigest:value.inputDigest,state:'starting',binding:null};return{status:'reserved',record};},get:async()=>record,bind:async value=>{record={...record,binding:value.binding,state:'running'};},finish:async value=>{record={...record,state:value.state};}}});
 const planRoute=createExplorationPlannerRoute({...auth,allowSubmit:true,plannerFor});
 const routeKey=routeBindings=>createExplorationBatchRoute({appOrigin:auth.appOrigin,resolveActor:async()=>actor,ownsProject:async()=>true,verifyPlan:async value=>verifyExplorationPlan({bindings:routeBindings,input:{actor,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.requestId,context:value.context},plan:value.plan,token:value.token}),intentSecret:value=>deriveExplorationIntent(routeBindings,{...value,purpose:'batch'}).intentSecret,intentState:async()=>({state,epoch,revocationEpoch:state==='revoked'?epoch:null}),store:{reserveBatch:async(a,value)=>{if(waitReservation)await waitReservation;if(state!=='active'||hash(value.intentSecret)!==expectedHash)return{state:'busy',isNew:false};state='consumed';return{state:'running',isNew:true};},plan:async()=>{},put:async()=>{},finish:async()=>{},reject:async()=>{}},generate:async()=>{images++;return new Uint8Array([1]);}});
 async function prepare(){assert.equal((await createIntent()).status,200);const started=await planRoute(mk({op:'submit',projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,requestId:id(11),context,apiKey:key}));assert.equal(started.status,202);const result=await planRoute(mk({op:'poll',projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:id(11),context,apiKey:key}));return result.json();}
 const result=await prepare();assert.equal(result.status,'completed');
 const batch={projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,planRequestId:id(11),context,plan:result.plan,planBinding:result.planBinding,imageIds:[id(20),id(21),id(22)]};
 const headers={'x-compor-openai-key':key};
 assert.equal((await routeKey(binding('default')).post(mk(batch,headers))).status,403);assert.equal((await routeKey(bindings).post(mk({...batch,context:{...context,idea:'Alterada'}},headers))).status,403);assert.equal(images,0);
 let release;waitReservation=new Promise(resolve=>{release=resolve;});const blocked=routeKey(bindings).post(mk(batch,headers));await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await h.revoke(mk({projectId:input.projectId,intentId:input.intentId,expectedEpoch:epoch}))).status,200);release();assert.equal((await blocked).status,409);assert.equal(images,0);assert.equal(creates,1);
 // A fresh explicit intent may reuse the same recovered plan without re-planning.
 const fresh={...rawIntent,intentId:id(13)};assert.equal((await h.create(mk({...fresh,expectedEpoch:epoch,apiKey:key}))).status,200);waitReservation=null;
 const done=await routeKey(bindings).post(mk({...batch,intentId:fresh.intentId},headers));assert.equal((await done.json()).status,'completed');assert.equal(images,3);assert.equal(creates,1);
});

test('cancelamento enquanto a reserva aguarda não inicia sessão paga',async()=>{
 const {guardExplorationPlannerProvider}=await import('../lib/exploration-intent.ts');const {createExplorationPlanner}=await import('@compor/agents-api/exploration-planner');
 let release,entered,creates=0;const gate=new Promise(resolve=>{release=resolve;}),reserved=new Promise(resolve=>{entered=resolve;}),controller=new AbortController();
 const provider=guardExplorationPlannerProvider({create:async()=>{creates++;return{sessionId:'sess_test'};},get:async()=>({status:'unknown'})},controller.signal);
 const planner=createExplorationPlanner({bindings:binding(),provider,authorize:async()=>true,store:{reserve:async value=>{entered();await gate;return{status:'reserved',record:{userId:actor.userId,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.requestId,attemptId:id(9),inputDigest:value.inputDigest,state:'starting',binding:null}};},get:async()=>null,bind:async()=>{},finish:async()=>{}}});
 const submitted=planner.submit({...input,requestId:id(8)});await reserved;controller.abort();release();assert.equal((await submitted).status,'unknown');assert.equal(creates,0);
});

test('adapter de intenção usa token da pessoa e só grava hash da capability',async()=>{
 const {createExplorationIntentStore}=await import('../lib/exploration-intent-store.ts');const calls=[];
 const value=deriveExplorationIntent(binding(),input);
 const row={userId:actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,contextDigest:value.contextDigest,credentialDigest:value.credentialDigest,purpose:'batch',position:null,previousId:null,state:'active',epoch:1};
 const store=createExplorationIntentStore({service:'https://example.supabase.co',key:'sb_publishable_test'},async(url,options)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push({name,headers:options.headers,body:JSON.parse(options.body)});if(name==='reserve_exploration_intent')return Response.json({status:'reserved',intent:row});if(name==='get_exploration_intent_epoch')return Response.json(1);if(name==='get_exploration_intent_state')return Response.json({state:'active',epoch:1,revocationEpoch:null});return Response.json({status:'revoked',epoch:3,revocationEpoch:2});});
 const result=await store.create({...input,position:null,previousId:null,expectedEpoch:0,contextDigest:value.contextDigest,credentialDigest:value.credentialDigest,intentProofDigest:value.intentProofDigest});assert.deepEqual(result,{status:'created',epoch:1});
 assert.equal(calls[0].headers.authorization,`Bearer ${actor.token}`);assert.equal(calls[0].body.p_piece_id,null);assert.equal(calls[0].body.p_expected_epoch,0);assert.equal(calls[0].body.p_proof_digest,value.intentProofDigest);assert.equal(JSON.stringify(calls).includes(value.intentSecret),false);assert.equal(JSON.stringify(calls).includes(key),false);
 assert.deepEqual(await store.epoch({actor,projectId:input.projectId}),{epoch:1});assert.deepEqual(await store.state({actor,projectId:input.projectId,intentId:input.intentId}),{state:'active',epoch:1,revocationEpoch:null});assert.deepEqual(await store.revoke({actor,projectId:input.projectId,intentId:input.intentId,expectedEpoch:1}),{status:'revoked',epoch:3,revocationEpoch:2});assert.equal(calls.at(-1).body.p_expected_epoch,1);
});

test('perda de resposta de create ou revoke permanece incerta e não revela segredo',async()=>{
 const {createExplorationIntentRoute}=await import('../lib/exploration-intent-route.ts');const request=body=>new Request('https://compor.test/x',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(body)});
 const h=createExplorationIntentRoute({appOrigin:'https://compor.test',apiKey:key,bindings:binding(),allowCreate:true,resolveActor:async()=>actor,ownsProject:async()=>true,store:{create:async()=>{throw Error('sensitive');},revoke:async()=>{throw Error('sensitive');},epoch:async()=>({epoch:0}),state:async()=>null}});
 const {actor:ignored,...scope}=input;const create=await h.create(request({...scope,expectedEpoch:0,apiKey:key}));assert.deepEqual(await create.json(),{status:'unknown',retryAutomatically:false});
 const revoked=await h.revoke(request({projectId:input.projectId,intentId:input.intentId,expectedEpoch:0}));assert.deepEqual(await revoked.json(),{status:'unknown',retryAutomatically:false});
});

test('adapter preserva epoch de revogação imutável e rejeita metadados inconsistentes',async()=>{
 const {createExplorationIntentStore}=await import('../lib/exploration-intent-store.ts');let response;
 const store=createExplorationIntentStore({service:'https://example.supabase.co',key:'sb_publishable_test'},async()=>Response.json(response));
 const scope={actor,projectId:input.projectId,intentId:input.intentId};
 response={state:'revoked',epoch:8,revocationEpoch:2};assert.deepEqual(await store.state(scope),response);
 response={state:'revoked',epoch:8,revocationEpoch:null};assert.deepEqual(await store.state(scope),response);
 for(const value of [{state:'active',epoch:8,revocationEpoch:2},{state:'revoked',epoch:2,revocationEpoch:3},{state:'revoked',epoch:2},{state:'revoked',epoch:2,revocationEpoch:'2'}]){response=value;await assert.rejects(()=>store.state(scope));}
 response={status:'revoked',epoch:8,revocationEpoch:2};assert.deepEqual(await store.revoke({...scope,expectedEpoch:1}),response);
 response={status:'revoked',epoch:2,revocationEpoch:3};await assert.rejects(()=>store.revoke({...scope,expectedEpoch:1}));
 response={status:'conflict',epoch:8};assert.deepEqual(await store.revoke({...scope,expectedEpoch:1}),response);
});

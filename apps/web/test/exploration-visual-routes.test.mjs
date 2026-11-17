import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
import {createExplorationPlannerRoute} from '../lib/exploration-planner-route.ts';
import {createExplorationIntentRoute} from '../lib/exploration-intent-route.ts';
import {createExplorationParallelResumeRoute} from '../lib/exploration-parallel-resume-route.ts';
import {deriveExplorationIntent} from '../lib/exploration-intent.ts';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createExplorationParallelResumeStore} from '../lib/exploration-parallel-resume-store.ts';
import {createVisualAuthority} from '../lib/visual-authority.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic'},key='sk-synthetic-visual-routes-credential';
const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const scope={projectId:id(2),conversationId:'references',batchId:id(3),intentId:id(4),context};
const bindings=createExplorationPlannerBindings({secret:Buffer.alloc(32,21),source:'byok',apiKey:key});
const auth={appOrigin:'https://compor.test',apiKey:key,bindings,resolveActor:async()=>actor,ownsProject:async()=>true};
const request=value=>new Request('https://compor.test/synthetic',{method:'POST',headers:{origin:auth.appOrigin,'content-type':'application/json'},body:JSON.stringify(value)});
const prepareVisualAuthority=async value=>({requestId:value.requestId,manifestDigest:visualInputDigest(value.visualInput),consentSecret:null});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
function visual(bytes=png){
 const original={sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',byteLength:bytes.length};
 return {visualInput:{version:1,policy:'optimized-v1',entries:[{id:id(5),ordinal:1,role:'reference',inputOrigin:'local-upload',original,transport:{...original,width:1,height:1},transformation:'none'}]},referenceImages:[{id:id(5),mime:'image/png',data:bytes.toString('base64')}]};
}
function paddedPng(){
 const data=Buffer.from(`Note\0${'synthetic '.repeat(8000)}`),type=Buffer.from('tEXt'),chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);type.copy(chunk,4);data.copy(chunk,8);
 let crc=0xffffffff;for(const byte of Buffer.concat([type,data])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);
 return Buffer.concat([png.subarray(0,png.length-12),chunk,png.subarray(png.length-12)]);
}

test('plan valida bytes completos antes do planner; poll exige só manifesto',async()=>{
 const calls=[],intents=[],route=createExplorationPlannerRoute({...auth,allowSubmit:true,prepareVisualAuthority,plannerFor:intent=>{intents.push(intent);return{submit:async input=>{calls.push(input);return{status:'running',retryAutomatically:false};},poll:async input=>{calls.push(input);return{status:'unknown',retryAutomatically:false};}};}});
 const v=visual(paddedPng()),body={...scope,requestId:id(6),op:'submit',apiKey:key,...v};assert.ok(JSON.stringify(body).length>65536);
 assert.equal((await route(request(body))).status,202);assert.deepEqual(calls[0].referenceImages,v.referenceImages);
 assert.equal(intents[0].intentSecret,deriveExplorationIntent(bindings,{...scope,actor,purpose:'batch',visualInput:v.visualInput}).intentSecret);
 const {intentId,referenceImages,...poll}=body;
 assert.equal((await route(request({...poll,op:'poll'}))).status,202);assert.equal(calls[1].referenceImages,undefined);assert.deepEqual(calls[1].visualInput,v.visualInput);assert.equal(intents[1],undefined);
 for(const bad of [{...body,referenceImages:[]},{...body,visualInput:null},{...body,referenceImages:[{...referenceImages[0],data:'AAAA'}]},{...poll,op:'poll',referenceImages}])assert.equal((await route(request(bad))).status,400);
 assert.equal(calls.length,2);
 assert.equal((await route(new Request('https://compor.test/synthetic',{method:'POST',headers:{origin:auth.appOrigin,'content-type':'application/json'},body:' '.repeat(3*1024*1024+1)}))).status,400);assert.equal(calls.length,2);
});

test('capacidade da intenção diferencia legado/vazio/conteúdo e preserva CAS sem bytes',async()=>{
 const v=visual(),base={...scope,actor,purpose:'batch'},legacy=deriveExplorationIntent(bindings,base);
 const empty=deriveExplorationIntent(bindings,{...base,visualInput:{version:1,policy:'optimized-v1',entries:[]}}),full=deriveExplorationIntent(bindings,{...base,visualInput:v.visualInput});
 assert.notEqual(legacy.contextDigest,empty.contextDigest);assert.notEqual(empty.intentSecret,full.intentSecret);
 const calls=[],route=createExplorationIntentRoute({...auth,allowCreate:true,prepareVisualAuthority,store:{create:async input=>{calls.push(input);return{status:'created',epoch:8};}}});
 assert.equal((await route.create(request({...scope,purpose:'batch',expectedEpoch:7,apiKey:key,visualInput:v.visualInput,authorityRequestId:id(6)}))).status,200);
 assert.equal(calls[0].expectedEpoch,7);assert.equal(calls[0].intentProofDigest,full.intentProofDigest);assert.equal(JSON.stringify(calls).includes(v.referenceImages[0].data),false);
 assert.equal((await route.create(request({...scope,purpose:'batch',expectedEpoch:7,apiKey:key,...v}))).status,400);
 assert.equal((await route.create(request({...scope,purpose:'batch',expectedEpoch:7,apiKey:key,visualInput:{...v.visualInput,entries:[{...v.visualInput.entries[0],inputOrigin:'external'}]}}))).status,400);assert.equal(calls.length,1);
});

test('retomada usa exatamente o manifesto que autorizou a intenção',async()=>{
 const v=visual(),expected=deriveExplorationIntent(bindings,{...scope,actor,purpose:'batch',visualInput:v.visualInput}).intentSecret,calls=[];
 const route=createExplorationParallelResumeRoute({...auth,allowResume:()=>true,prepareVisualAuthority,store:{resume:async input=>{calls.push(input);return input.intentSecret===expected?{status:'resumed',intentEpoch:8,reviewEpoch:2}:{status:'revoked'};}}});
 const body={...scope,expectedEpoch:8,apiKey:key,visualInput:v.visualInput,authorityRequestId:id(6)};assert.equal((await route.resume(request(body))).status,200);
 const {visualInput,authorityRequestId,...legacy}=body;assert.equal((await route.resume(request(legacy))).status,409);
 assert.equal((await route.resume(request({...body,visualInput:{version:1,policy:'optimized-v1',entries:[]}}))).status,409);
 assert.equal(calls[0].expectedEpoch,8);assert.equal((await route.resume(request({...body,visualInput:{...visualInput,version:2}}))).status,400);assert.equal(calls.length,3);
 assert.deepEqual(calls[0].visualAuthority,{requestId:authorityRequestId,manifestDigest:visualInputDigest(visualInput),consentSecret:null});
});

test('adapters usam JWT da conta e RPC transacional de retomada para manifesto autorizado',async()=>{
 const calls=[],config={service:'https://synthetic.supabase.test',key:'public-synthetic'};
 const fetch=async(url,options)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push({name,headers:options.headers,body:JSON.parse(options.body)});return Response.json(name==='check_reference_authority'?true:{status:'resumed',intentEpoch:8,reviewEpoch:2});};
 const v=visual(),prepare=createVisualAuthority(config,true,fetch),proof=await prepare({...scope,actor,requestId:id(6),purpose:'parallel',visualInput:v.visualInput,consentHeader:null});
 assert.deepEqual(proof,{requestId:id(6),manifestDigest:visualInputDigest(v.visualInput),consentSecret:null});
 const store=createExplorationParallelResumeStore(config,fetch);await store.resume({actor,projectId:scope.projectId,pieceId:null,batchId:scope.batchId,intentId:scope.intentId,intentSecret:'a'.repeat(64),expectedEpoch:8,visualAuthority:proof});
 assert.deepEqual(calls.map(call=>call.name),['check_reference_authority','resume_exploration_parallel_review_authorized']);
 assert.ok(calls.every(call=>call.headers.authorization===`Bearer ${actor.token}`));
 assert.equal(calls[1].body.p_authority_request_id,id(6));assert.equal(calls[1].body.p_manifest_digest,proof.manifestDigest);assert.equal(calls[1].body.p_consent_secret,null);
 assert.equal(JSON.stringify(calls).includes(key),false);
 const disabled=createVisualAuthority(config,false,fetch);assert.equal(await disabled({...scope,actor,requestId:id(6),purpose:'parallel',visualInput:v.visualInput,consentHeader:null}),null);assert.equal(calls.length,2);
});

test('intent/resume/submit antigos sem porta autoritativa não admitem extras; poll continua',async()=>{
 const v=visual();v.visualInput.version=2;v.visualInput.externalConsent=true;Object.assign(v.visualInput.entries[0],{inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}});
 let effects=0,polls=0;
 const intent=createExplorationIntentRoute({...auth,allowCreate:true,store:{create:async()=>{effects++;return{status:'created',epoch:8};}}});
 const resume=createExplorationParallelResumeRoute({...auth,allowResume:()=>true,store:{resume:async()=>{effects++;return{status:'resumed',intentEpoch:8,reviewEpoch:2};}}});
 const plan=createExplorationPlannerRoute({...auth,allowSubmit:true,plannerFor:()=>({submit:async()=>{effects++;return{status:'running',retryAutomatically:false};},poll:async()=>{polls++;return{status:'unknown',retryAutomatically:false};}})});
 assert.equal((await intent.create(request({...scope,purpose:'batch',expectedEpoch:7,apiKey:key,visualInput:v.visualInput,authorityRequestId:id(7)}))).status,503);
 assert.equal((await resume.resume(request({...scope,expectedEpoch:8,apiKey:key,visualInput:v.visualInput,authorityRequestId:id(7)}))).status,503);
 assert.equal((await plan(request({...scope,op:'submit',requestId:id(7),apiKey:key,...v}))).status,503);assert.equal(effects,0);
 const {intentId,...pollScope}=scope;assert.equal((await plan(request({...pollScope,op:'poll',requestId:id(7),apiKey:key,visualInput:v.visualInput}))).status,202);assert.equal(polls,1);
 const generated=structuredClone(v.visualInput);Object.assign(generated.entries[0],{inputOrigin:'generated',source:{projectId:scope.projectId,imageId:id(90)}});
 assert.equal((await intent.create(request({...scope,purpose:'batch',expectedEpoch:7,apiKey:key,visualInput:generated,authorityRequestId:id(7)}))).status,503);assert.equal(effects,0);
});
test('porta do servidor recebe escopo e manifesto; projetos diferentes e falhas fecham antes do efeito',async()=>{
 const v=visual();v.visualInput.version=2;v.visualInput.externalConsent=false;Object.assign(v.visualInput.entries[0],{inputOrigin:'generated',source:{projectId:scope.projectId,imageId:id(90)}});
 let authorized=0,effects=0;const deps={...auth,allowCreate:true,prepareVisualAuthority,authorizeVisualInput:async input=>{authorized++;assert.equal(input.actor.userId,actor.userId);assert.equal(input.projectId,scope.projectId);assert.deepEqual(input.visualInput,v.visualInput);return true;},store:{create:async()=>{effects++;return{status:'created',epoch:1};}}};
 const body={...scope,purpose:'batch',expectedEpoch:0,apiKey:key,visualInput:v.visualInput,authorityRequestId:id(7)};assert.equal((await createExplorationIntentRoute(deps).create(request(body))).status,200);assert.equal(authorized,1);assert.equal(effects,1);
 assert.equal((await createExplorationIntentRoute({...deps,authorizeVisualInput:async()=>false}).create(request(body))).status,403);
 assert.equal((await createExplorationIntentRoute({...deps,authorizeVisualInput:async()=>{throw Error('offline');}}).create(request(body))).status,503);
 const bad=structuredClone(body);bad.visualInput.entries[0].source.projectId=id(99);assert.equal((await createExplorationIntentRoute(deps).create(request(bad))).status,400);assert.equal(effects,1);assert.equal(authorized,1);
});


test('capacidade visual impede planejar sem execução disponível e não bloqueia consultas legadas',async()=>{
 let submits=0,polls=0;const plannerFor=()=>({submit:async()=>{submits++;return{status:'running'};},poll:async()=>{polls++;return{status:'unknown'};}});
 const body={...scope,op:'submit',requestId:id(7),apiKey:key},v=visual();
 const disabled=createExplorationPlannerRoute({...auth,allowSubmit:true,visualMode:'disabled',plannerFor});
 assert.equal((await disabled(request({...body,...v}))).status,503);
 const required=createExplorationPlannerRoute({...auth,allowSubmit:true,visualMode:'required',prepareVisualAuthority,plannerFor});
 assert.equal((await required(request(body))).status,503);assert.equal((await required(request({...body,...v}))).status,202);
 const {intentId,...legacyPoll}=body;assert.equal((await required(request({...legacyPoll,op:'poll'}))).status,202);
 assert.equal(submits,1);assert.equal(polls,1);
});

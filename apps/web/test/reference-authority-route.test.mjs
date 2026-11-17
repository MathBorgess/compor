import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReferenceAuthorityRoute,referenceConsentSecret} from '../lib/reference-authority-route.ts';
import {createReferenceAuthorityStore} from '../lib/reference-authority-store.ts';
const id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-user-token'},projectId=id(2),commandId=id(3),consentId=id(4),requestId=id(6),batchId=id(7);
const origin='https://compor.test',config={service:'https://synthetic.supabase.test',key:'synthetic-public-key'};
const empty={version:1,references:[],projectReferenceIds:[],posts:[]};
const request=(value,headers={})=>new Request(`${origin}/api/studio/reference-authority/test`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value)});
function fixture(overrides={}){const calls=[];const store=new Proxy({}, {get:(_,method)=>async(...args)=>{calls.push({method,args});if(method==='revoke')return{status:'revoked',consentId};if(method==='grant')return{status:'granted',consentId};if(method==='consentState')return{state:'revoked',consentId};if(method==='read')return{status:'ready',revision:0,state:empty};if(method==='receipt'||method==='readSnapshot')return null;throw Error('unexpected call');}});return{calls,route:createReferenceAuthorityRoute({appOrigin:origin,enabled:true,resolveActor:async()=>actor,ownsProject:async()=>true,store,...overrides})};}
test('revoke succeeds without capability even with writes disabled; grant alone emits the secret',async()=>{
 const f=fixture(),grant=await f.route('consent',request({op:'grant',consentId}));assert.equal(grant.status,200);const granted=await grant.json();assert.match(granted.capability,/^[A-Za-z0-9_-]{43}$/);
 const proof=f.calls[0].args[2];assert.equal(proof,createHash('sha256').update(Buffer.from(granted.capability,'base64url')).digest('hex'));assert.equal(JSON.stringify(f.calls).includes(granted.capability),false);
 const off=fixture({enabled:false});const revoked=await off.route('consent',request({op:'revoke',consentId}));assert.equal(revoked.status,200);assert.deepEqual(await revoked.json(),{status:'revoked',consentId});assert.deepEqual(off.calls.map(x=>x.method),['revoke']);
 const repeat=fixture({store:{grant:async()=>({status:'existing',consentId})}});assert.deepEqual(await(await repeat.route('consent',request({op:'grant',consentId}))).json(),{status:'existing',consentId});
});
test('origin, identity, project, strict input and feature gate reject before store mutation',async()=>{
 const body={op:'write',projectId,commandId,expectedRevision:0,state:empty};
 for(const [overrides,headers,input,status] of [[{}, {origin:'https://other.test'},body,400],[{resolveActor:async()=>null},{},body,401],[{ownsProject:async()=>false},{},body,404],[{enabled:false},{},body,503],[{}, {},{...body,extra:true},400],[{}, {},{...body,state:{...empty,projectReferenceIds:[id(8),id(8)]}},400]]){const f=fixture(overrides);assert.equal((await f.route('selection',request(input,headers))).status,status);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.route('selection',request({...body,padding:'x'.repeat(512*1024)}))).status,400);assert.equal(f.calls.length,0);
});
test('reads and absent receipts work with writes disabled; uncertain responses never become absence',async()=>{
 const off=fixture({enabled:false});assert.deepEqual(await(await off.route('selection',request({op:'read',projectId}))).json(),{status:'ready',revision:0,state:empty});assert.deepEqual(await(await off.route('selection',request({op:'receipt',projectId,commandId}))).json(),{status:'absent'});
 const bad=fixture({store:{receipt:async()=>{throw Error('response lost');}}});const response=await bad.route('selection',request({op:'receipt',projectId,commandId}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unknown',retryAutomatically:false});
});
test('a response with missing or mismatched identifiers cannot be reported as success',async()=>{
 for(const result of [{status:'granted'},{status:'granted',consentId:id(99)},{status:'existing'},{status:'revoked',consentId:id(99)}]){const f=fixture({store:{grant:async()=>result,revoke:async()=>result}});assert.equal((await f.route('consent',request({op:result.status==='revoked'?'revoke':'grant',consentId}))).status,503);}
 const wrong=fixture({store:{receipt:async()=>({status:'applied',commandId:id(99),revision:2})}});assert.equal((await wrong.route('selection',request({op:'receipt',projectId,commandId}))).status,503);
});
test('capability parser accepts only canonical 32-byte base64url and never accepts an API key',()=>{
 const capability=Buffer.alloc(32,7).toString('base64url');assert.equal(referenceConsentSecret(capability),'07'.repeat(32));assert.equal(referenceConsentSecret(null),null);
 for(const value of ['',capability+'=',capability.slice(0,-1)+'x','sk-synthetic','a'.repeat(44)])assert.throws(()=>referenceConsentSecret(value));
});
test('adapter uses verified person JWT and rejects malformed response; dispatch state is explicit',async()=>{
 const calls=[];const store=createReferenceAuthorityStore(config,async(url,options)=>{calls.push({url:String(url),options,body:JSON.parse(options.body)});return Response.json(true);});
 const scope={projectId,conversationId:'references',requestId,batchId,purpose:'parallel',manifestDigest:'a'.repeat(64),consentSecret:null,intentId:id(8),intentEpoch:1,intentState:'active'};
 assert.equal(await store.checkDispatch(actor,scope),true);assert.equal(calls[0].options.headers.authorization,`Bearer ${actor.token}`);assert.equal(calls[0].body.p_piece_id,null);assert.equal(calls[0].body.p_intent_state,'active');assert.match(calls[0].url,/check_reference_exploration_dispatch$/);
 const malformed=createReferenceAuthorityStore(config,async()=>Response.json({status:'granted'}));await assert.rejects(malformed.grant(actor,consentId,'a'.repeat(64)));
 const unavailable=createReferenceAuthorityStore(config,async()=>new Response('unavailable',{status:503}));await assert.rejects(unavailable.read(actor,projectId));
});

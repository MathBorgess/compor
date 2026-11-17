import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {databaseSql} from '../../../scripts/quality/fixtures/exploration-parallel-db.mjs';
import {createReferenceAuthorityRoute,referenceConsentSecret} from '../lib/reference-authority-route.ts';
import {createReferenceAuthorityStore} from '../lib/reference-authority-store.ts';
import {parseVisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {visualInputDigest} from '@compor/agents-api/visual-input';
const id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-user-token'},projectId=id(2),commandId=id(3),consentId=id(4),sessionId=id(5),requestId=id(6),batchId=id(7);
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
async function bridge(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt()to authenticated;`);
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql','20261117000037_reference_authority.sql'])await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[actor.userId]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sessionId,actor.userId]);await db.query('insert into projects(id,owner_id)values($1,$2)',[projectId,actor.userId]);await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[actor.userId,JSON.stringify({sub:actor.userId,session_id:sessionId,exp:Math.floor(Date.now()/1000)+3600})]);
 const calls=[];let loseNext=false;
 const store=createReferenceAuthorityStore(config,async(url,options)=>{assert.equal(options.headers.authorization,`Bearer ${actor.token}`);const name=new URL(url).pathname.split('/').at(-1);assert.match(name,/^[a-z_]+$/);const body=JSON.parse(options.body);calls.push({name,body});const keys=Object.keys(body);for(const key of keys)assert.match(key,/^p_[a-z_]+$/);const args=keys.map(key=>typeof body[key]==='object'&&body[key]!==null?JSON.stringify(body[key]):body[key]);const {rows}=await db.query(`select public.${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) as value`,args);if(loseNext){loseNext=false;throw Error('response lost after commit');}return Response.json(rows[0].value);});
 return{db,store,calls,lose:()=>{loseNext=true;},route:createReferenceAuthorityRoute({appOrigin:origin,enabled:true,resolveActor:async()=>actor,ownsProject:async()=>true,store})};
}
test('HTTP → adapter → real SQL preserves CAS receipt, canonical snapshot and revocation without paid calls',async t=>{
 const f=await bridge(t),source={originUrl:'https://www.pinterest.com/pin/synthetic/',board:'synthetic/board'},reference={id:id(20),inputOrigin:'external',source};
 const value={version:1,references:[reference],projectReferenceIds:[reference.id],posts:[]},write={op:'write',projectId,commandId,expectedRevision:0,state:value};
 f.lose();const uncertain=await f.route('selection',request(write));assert.equal(uncertain.status,503);assert.equal((await uncertain.json()).status,'unknown');assert.equal(f.calls.length,1);
 assert.deepEqual(await(await f.route('selection',request({op:'receipt',projectId,commandId}))).json(),{status:'applied',commandId,revision:1});
 const read=await(await f.route('selection',request({op:'read',projectId}))).json();assert.equal(read.state.references[0].sourceDigest,createHash('sha256').update('compor-reference-source-v1\0').update(JSON.stringify({inputOrigin:'external',source})).digest('hex'));assert.equal(JSON.stringify(read).includes(source.originUrl),false);
 const granted=await(await f.route('consent',request({op:'grant',consentId}))).json();const headers={'x-compor-reference-consent':granted.capability};
 const original={sha256:'a'.repeat(64),mime:'image/png',byteLength:42};const visualInput=parseVisualInputManifest({version:2,policy:'optimized-v1',externalConsent:true,entries:[{...reference,ordinal:1,role:'reference',original,transport:{...original,width:1,height:1},transformation:'none'}]});
 const snapshot={op:'create',projectId,conversationId:'references',requestId,batchId,purpose:'parallel',selectionRevision:1,consentId,visualInput};
 const created=await f.route('snapshot',request(snapshot,headers));assert.equal(created.status,200);assert.equal((await created.json()).snapshot.manifestDigest,visualInputDigest(visualInput));
 const scope={projectId,conversationId:'references',requestId,batchId,purpose:'parallel',manifestDigest:visualInputDigest(visualInput),consentSecret:referenceConsentSecret(granted.capability)};assert.equal(await f.store.check(actor,scope),true);
 assert.equal((await f.route('snapshot',request({...snapshot,requestId:id(9)},{}))).status,403);assert.equal((await f.route('snapshot',request({...snapshot,requestId:id(10),visualInput:{...visualInput,entries:[{...visualInput.entries[0],id:id(99)}]}},headers))).status,409);
 assert.equal((await f.route('consent',request({op:'revoke',consentId}))).status,200);assert.equal(await f.store.check(actor,scope),false);
 assert.equal((await(await f.route('snapshot',request({op:'read',projectId,requestId}))).json()).status,'found');assert.equal((await f.route('snapshot',request({...snapshot,requestId:id(11)},headers))).status,403);
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int as count from exploration_planning_attempts')).rows[0].count,0);
});

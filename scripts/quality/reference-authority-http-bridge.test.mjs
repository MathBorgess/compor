import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
import {createReferenceAuthorityRoute,referenceConsentSecret} from '../../apps/web/lib/reference-authority-route.ts';
import {createReferenceAuthorityStore} from '../../apps/web/lib/reference-authority-store.ts';
import {parseVisualInputManifest} from '../../packages/agents-api/src/visual-input-contract.mjs';
import {visualInputDigest} from '../../packages/agents-api/src/visual-input.mjs';
const id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-user-token'},projectId=id(2),commandId=id(3),consentId=id(4),sessionId=id(5),requestId=id(6),batchId=id(7);
const origin='https://compor.test',config={service:'https://synthetic.supabase.test',key:'synthetic-public-key'};
const request=(value,headers={})=>new Request(`${origin}/api/studio/reference-authority/test`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value)});
async function bridge(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt()to authenticated;`);
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql','20261117000037_reference_authority.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
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

import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
import {parseVisualInputManifest} from '../../packages/agents-api/src/visual-input-contract.mjs';
import {visualInputDigest} from '../../packages/agents-api/src/visual-input.mjs';
const id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),other=id(2),project=id(3),otherProject=id(4),piece=id(5),session=id(6),secondSession=id(7),consent=id(8),request=id(9),batch=id(10),digest='a'.repeat(64),secret='12'.repeat(32),wrong='34'.repeat(32);
const proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex');
const sourceFor=x=>x.inputOrigin==='local-upload'?null:x.inputOrigin==='external'?{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}:{projectId:project,imageId:x.generatedImageId};
const reference=(n,inputOrigin='local-upload')=>{const x={id:id(n),inputOrigin,generatedImageId:inputOrigin==='generated'?id(30):null};return {...x,sourceDigest:createHash('sha256').update('compor-reference-source-v1\0').update(JSON.stringify({inputOrigin,source:sourceFor(x)})).digest('hex')};};
const state=(references=[reference(20)],projectReferenceIds=references.map(x=>x.id),posts=[])=>({version:1,references,projectReferenceIds,posts});
const entries=value=>value.references.filter(x=>value.projectReferenceIds.includes(x.id)).map(({generatedImageId,...entry})=>entry);
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt() to authenticated;`);
 if(process.env.COMPOR_REFERENCE_AUTHORITY_RED!=='1')await db.exec(await readFile(new URL('../../supabase/migrations/20261117000037_reference_authority.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query('insert into auth.sessions(id,user_id)values($1,$2),($3,$2),($4,$5)',[session,owner,secondSession,id(90),other]);
 await db.query('insert into projects(id,owner_id)values($1,$2),($3,$4)',[project,owner,otherProject,other]);await db.query("insert into project_posts(project_id,piece_id,name)values($1,$2,'Fixture')",[project,piece]);
 await db.query("insert into exploration_images(id,owner_id,project_id,prompt_digest,state)values($1,$2,$3,$4,'completed')",[id(30),owner,project,digest]);
 const actor=async(user=owner,sid=session,exp=Date.now()/1000+3600)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:sid,exp:Math.floor(exp)})]);};await actor();
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
 const read=(p=project)=>scalar('select get_reference_selection($1) as value',[p]);
 const write=(value=state(),expected=0,command=id(40),p=project)=>scalar('select write_reference_selection($1,$2,$3,$4) as value',[p,command,expected,JSON.stringify({...value,references:value.references.map(x=>({id:x.id,inputOrigin:x.inputOrigin,source:sourceFor(x)}))})]);
 const grant=(c=consent)=>scalar('select grant_reference_consent($1,$2) as value',[c,proof]);
 const revoke=(c=consent)=>scalar('select revoke_reference_consent($1) as value',[c]);
 let lastDigest=digest;
 const snapshot=async(value=state(),overrides={})=>{const v={projectId:project,pieceId:null,requestId:request,batchId:batch,purpose:'parallel',revision:1,entries:entries(value),consentId:null,secret:null,...overrides};const original={sha256:digest,mime:'image/png',byteLength:42};
  const manifest=overrides.manifest??parseVisualInputManifest({version:2,policy:'optimized-v1',externalConsent:v.entries.some(x=>x.inputOrigin==='external'),entries:v.entries.map((x,index)=>({...x,source:sourceFor(value.references.find(y=>y.id===x.id)??reference(99)),ordinal:index+1,role:'reference',original,transport:{...original,width:1,height:1},transformation:'none'})).map(({sourceDigest,...x})=>x)});
  const result=await scalar('select create_reference_snapshot($1,$2,$3,$4,$5,$6,$7,$8,$9) as value',[v.projectId,v.pieceId,v.requestId,v.batchId,v.purpose,v.revision,JSON.stringify(manifest),v.consentId,v.secret]);
  if(['created','existing'].includes(result.status)){lastDigest=visualInputDigest(manifest);assert.equal(result.snapshot.manifestDigest,lastDigest,'SQL and JS hash the same canonical bytes including the NUL domain separator');}return result;};
 const check=(overrides={})=>{const v={projectId:project,pieceId:null,requestId:request,batchId:batch,purpose:'parallel',digest:lastDigest,secret:null,...overrides};return scalar('select check_reference_authority($1,$2,$3,$4,$5,$6,$7) as value',[v.projectId,v.pieceId,v.requestId,v.batchId,v.purpose,v.digest,v.secret]);};
 const receipt=()=>scalar('select get_reference_snapshot($1,$2) as value',[project,request]);
 return {db,actor,scalar,read,write,grant,revoke,snapshot,check,receipt};
}
test('mirror starts empty; CAS, lost response receipt and replay never resurrect an old selection',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.read(),{status:'ready',revision:0,state:state([],[],[])});
 assert.equal((await f.write()).status,'applied');assert.equal((await f.read()).revision,1);
 assert.equal((await f.write(state([],[]),1,id(41))).revision,2);
 assert.deepEqual(await f.write(),{status:'existing',commandId:id(40),revision:1});assert.equal((await f.read()).revision,2);
 assert.deepEqual(await f.write(state(),1,id(42)),{status:'conflict',revision:2});assert.deepEqual((await f.read()).state,state([],[]));
 assert.equal((await f.write(state([reference(21)]),0,id(40))).status,'conflict');
 assert.deepEqual(await f.scalar('select get_reference_selection_command($1,$2) as value',[project,id(40)]),{status:'applied',commandId:id(40),revision:1});
 await f.actor(other,id(90));assert.equal(await f.read(),null);assert.equal((await f.write()).status,'not_found');
 for(const table of ['reference_selection_mirrors','reference_selection_commands','reference_consent_sessions','reference_authority_snapshots'])await assert.rejects(f.db.query(`select * from ${table}`),error=>error.code==='42501');
});
test('global, local and exclusion follow catalog order; unknown or foreign posts/images fail closed',async t=>{
 const f=await fixture(t),value=state([reference(20),reference(21),reference(22,'generated')],[id(20),id(21)],[{pieceId:piece,referenceIds:[id(22)],excludedReferenceIds:[id(20)]}]);
 assert.equal((await f.write(value)).status,'applied');
 const selected=value.references.slice(1).map(({generatedImageId,...x})=>x);
 assert.equal((await f.snapshot(value,{pieceId:piece,entries:selected})).status,'created');assert.equal(await f.check({pieceId:piece}),true);
 assert.equal((await f.snapshot(value,{requestId:id(50),pieceId:piece,entries:selected.toReversed()})).status,'conflict');
 const missing=structuredClone(value);missing.posts[0].pieceId=id(99);assert.equal((await f.write(missing,1,id(41))).status,'invalid');
 const forged=structuredClone(value);forged.references[2].generatedImageId=id(99);assert.equal((await f.write(forged,1,id(41))).status,'invalid');
 assert.equal(await f.check(),false);assert.equal(await f.check({pieceId:piece,digest:'b'.repeat(64)}),false);
});
test('consent needs capability and same live Auth session; replay never rotates proof',async t=>{
 const f=await fixture(t),value=state([reference(20,'external')]);await f.write(value);
 assert.equal((await f.snapshot(value,{consentId:consent,secret})).status,'unauthorized');
 assert.equal((await f.grant()).status,'granted');assert.equal((await f.grant()).status,'existing');
 assert.equal((await f.snapshot(value,{consentId:consent,secret:wrong})).status,'unauthorized');
 assert.equal((await f.snapshot(value,{consentId:consent,secret})).status,'created');assert.equal(await f.check({secret}),true);assert.equal(await f.check(),false);
 await f.actor(owner,secondSession);assert.equal(await f.check({secret}),false);assert.ok(await f.receipt(),'receipt remains readable in a new authenticated session');
 await f.actor(owner,session,Date.now()/1000-1);assert.equal(await f.check({secret}),false);
 await f.actor();await f.db.exec('reset role');await f.db.query('delete from auth.sessions where id=$1',[session]);await f.actor();assert.equal(await f.check({secret}),false);assert.ok(await f.receipt());
});
test('revocation before grant installs tombstone; revocation after snapshot blocks effects but preserves reads',async t=>{
 const f=await fixture(t),value=state([reference(20,'external')]);await f.write(value);
 assert.equal((await f.revoke()).status,'revoked');assert.equal((await f.grant()).status,'revoked');
 assert.equal((await f.grant(id(18))).status,'granted');await f.snapshot(value,{consentId:id(18),secret});assert.equal(await f.check({secret}),true);
 await f.revoke(id(18));assert.equal(await f.check({secret}),false);assert.ok(await f.receipt());
 assert.equal((await f.snapshot(value,{consentId:id(18),secret})).status,'existing','historical snapshot replay is not admission');
 assert.equal((await f.snapshot(value,{requestId:id(50),consentId:id(18),secret})).status,'unauthorized');
});
test('selection change and deleted scope invalidate admission without erasing frozen receipts',async t=>{
 const f=await fixture(t);await f.write();await f.snapshot();assert.equal(await f.check(),true);
 await f.write(state([],[]),1,id(41));assert.equal(await f.check(),false);assert.ok(await f.receipt());
 assert.equal((await f.snapshot(state(),{requestId:id(50)})).status,'conflict');
 await f.db.exec('reset role');await f.db.query('update projects set deleted_at=clock_timestamp() where id=$1',[project]);await f.actor();
 assert.equal(await f.check(),false);assert.ok(await f.receipt());assert.equal((await f.write(state(),2,id(42))).status,'not_found');
});
test('rollback restores mirror, command, consent and snapshot; no legacy signals become authority',async t=>{
 const f=await fixture(t);await f.db.exec('begin');await f.write();await f.grant();await f.snapshot();await f.db.exec('rollback');
 assert.equal((await f.read()).revision,0);assert.equal(await f.receipt(),null);
 assert.equal(await f.scalar('select get_reference_selection_command($1,$2) as value',[project,id(40)]),null);
 assert.equal((await f.scalar('select get_reference_consent($1) as value',[consent])).state,'absent');
 assert.equal((await f.snapshot(state(),{revision:0})).status,'conflict');
});

test('direct RPC cannot bind a foreign manifest to legitimate selected entries or forge generated provenance',async t=>{
 const f=await fixture(t);await f.write();
 const forged={version:2,policy:'optimized-v1',externalConsent:false,entries:[{id:id(99),inputOrigin:'local-upload',source:null}]};
 assert.equal((await f.snapshot(state(),{manifest:forged})).status,'conflict');assert.equal(await f.receipt(),null);
 const foreign={version:1,references:[{id:id(20),inputOrigin:'generated',source:{projectId:otherProject,imageId:id(30)}}],projectReferenceIds:[id(20)],posts:[]};
 assert.equal((await f.scalar('select write_reference_selection($1,$2,$3,$4) as value',[project,id(45),1,JSON.stringify(foreign)])).status,'invalid');
 const declared={version:1,references:[{...reference(20),sourceDigest:digest}],projectReferenceIds:[id(20)],posts:[]};
 assert.equal((await f.scalar('select write_reference_selection($1,$2,$3,$4) as value',[project,id(46),1,JSON.stringify(declared)])).status,'invalid','digest cannot replace source fields');
 await f.snapshot();assert.equal(await f.check(),true);
 assert.equal(await f.check({digest:createHash('sha256').update('compor-visual-input-v2\0').update(JSON.stringify(forged)).digest('hex')}),false);
});

test('authorized planning reservation checks mirror under the same lock and preserves an admitted receipt',async t=>{
 const f=await fixture(t);await f.write();const snap=await f.snapshot();const intent=id(70);
 await f.scalar("select reserve_exploration_intent($1,null,$2,$3,0,$4,$4,$5,'batch',null,null) as value",[project,batch,intent,digest,proof]);
 assert.equal(await f.scalar("select check_reference_exploration_dispatch($1,null,$2,$3,'parallel',$4,null,$5,1,'active') as value",[project,request,batch,snap.snapshot.manifestDigest,intent]),true);
 assert.equal(await f.scalar("select check_reference_exploration_dispatch($1,null,$2,$3,'parallel',$4,null,$5,1,'consumed') as value",[project,request,batch,snap.snapshot.manifestDigest,intent]),false);
 const reserve=()=>f.scalar('select reserve_exploration_plan_authorized($1,null,$2,$3,$4,$5,$6,$7,$8,null) as value',[project,batch,request,digest,proof,intent,secret,snap.snapshot.manifestDigest]);
 await f.db.exec('begin');await f.write(state([],[]),1,id(41));assert.equal((await reserve()).status,'conflict');await f.db.exec('rollback');
 assert.equal((await reserve()).status,'reserved');await f.write(state([],[]),1,id(41));assert.equal((await reserve()).status,'existing');
 assert.equal(await f.check(),false);assert.ok(await f.scalar('select get_exploration_plan($1,$2) as value',[project,request]));
});

test('artwork claim must belong to the same turn as its immutable snapshot',async t=>{
 const f=await fixture(t);await f.write();const snap=await f.snapshot(state(),{pieceId:piece,purpose:'artwork',batchId:null});
 const turn=await f.scalar('select reserve_studio_turn_authorized($1,$2,$3,$4,$5,null) as value',[project,request,digest,piece,snap.snapshot.manifestDigest]);assert.equal(turn.status,'reserved');
 await f.db.exec('reset role');await f.db.query("insert into image_tool_reservations(id,owner_id,project_id,piece_id,agent_attempt_id,state)values($1,$2,$3,$4,$5,'reserved')",[id(80),owner,project,piece,turn.turn.attempt_id]);await f.db.query('insert into image_consent_declarations(reservation_id,owner_id)values($1,$2)',[id(80),owner]);await f.actor();
 await assert.rejects(f.db.query('select * from claim_image_tool_execution_authorized($1,$2,$3,null)',[id(80),id(99),snap.snapshot.manifestDigest]),error=>error.code==='42501');
 const result=await f.db.query('select * from claim_image_tool_execution_authorized($1,$2,$3,null)',[id(80),request,snap.snapshot.manifestDigest]);assert.equal(result.rows[0].is_new,true);
 await f.write(state([],[]),1,id(41));const replay=await f.db.query('select * from claim_image_tool_execution_authorized($1,$2,$3,null)',[id(80),request,snap.snapshot.manifestDigest]);assert.equal(replay.rows[0].is_new,false);
});

test('batch and replacement reserve atomically; joint dispatch sees both intent and reference revocation',async t=>{
 const f=await fixture(t),intent=id(70),images=[id(81),id(82),id(83)],replacement=id(84);await f.write();const snap=await f.snapshot(),md=snap.snapshot.manifestDigest;
 await f.scalar("select reserve_exploration_intent($1,null,$2,$3,0,$4,$4,$5,'batch',null,null) as value",[project,batch,intent,digest,proof]);
 await f.scalar('select reserve_exploration_plan_authorized($1,null,$2,$3,$4,$5,$6,$7,$8,null) as value',[project,batch,request,digest,proof,intent,secret,md]);
 await f.scalar('select bind_exploration_plan($1,$2,$3,$4) as value',[project,request,'ep1.fixture.binding',secret]);await f.scalar("select finish_exploration_plan($1,$2,'completed',$3) as value",[project,request,secret]);
 const reserve=async()=>(await f.db.query('select * from reserve_exploration_batch_authorized($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,null)',[project,batch,digest,images,[digest,digest,digest],[proof,proof,proof],intent,secret,request,md])).rows[0];
 await f.db.exec('begin');await f.write(state([],[]),1,id(41));assert.deepEqual(await reserve(),{state:'revoked',is_new:false});await f.db.exec('rollback');
 assert.deepEqual(await reserve(),{state:'running',is_new:true});
 const dispatch=()=>f.scalar("select check_reference_exploration_dispatch($1,null,$2,$3,'parallel',$4,null,$5,1) as value",[project,request,batch,md,intent]);assert.equal(await dispatch(),true);
 await f.db.exec('begin');await f.write(state([],[]),1,id(41));assert.equal(await dispatch(),false);await f.db.exec('rollback');
 await f.db.exec('begin');await f.scalar('select revoke_exploration_intent($1,$2,1) as value',[project,intent]);assert.equal(await dispatch(),false);await f.db.exec('rollback');
 for(const image of images)await f.scalar('select reject_exploration_image($1,$2,$3) as value',[project,image,secret]);
 await f.scalar("select reserve_exploration_intent($1,null,$2,$3,1,$4,$4,$5,'replacement',1,$6) as value",[project,batch,id(71),digest,proof,images[0]]);
 const replace=async()=>(await f.db.query('select * from replace_exploration_slot_authorized($1,$2,1,$3,$4,$5,$6,$7,$8,$9,null)',[project,batch,images[0],replacement,digest,proof,id(71),secret,md])).rows[0];
 assert.deepEqual(await replace(),{state:'revoked',is_new:false});await f.snapshot(state(),{requestId:replacement,purpose:'replacement'});assert.deepEqual(await replace(),{state:'running',is_new:true});
 await f.write(state([],[]),1,id(41));assert.equal((await replace()).is_new,false);
});

test('deleting another post does not erase the mirror or revoke unrelated selected sources',async t=>{
 const f=await fixture(t),value=state([reference(20)],[id(20)],[{pieceId:piece,referenceIds:[],excludedReferenceIds:[]}]);await f.write(value);await f.snapshot(value);
 await f.scalar('select delete_project_post($1,$2) as value',[project,piece]);assert.equal(await f.check(),true);
 assert.equal((await f.read()).state.posts.length,1,'no automatic selection cleanup');
 assert.equal((await f.snapshot(value,{requestId:id(50),pieceId:piece})).status,'not_found');
});

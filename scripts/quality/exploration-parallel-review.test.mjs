import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';

const id=n=>`36000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),project=id(2),piece=id(3),batch=id(4),intent=id(5),digest='a'.repeat(64),secret='12'.repeat(32),wrong='34'.repeat(32);
const proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,id(90)]);
 await db.query('insert into projects(id,owner_id)values($1,$2),($3,$4),($5,$2)',[project,owner,id(91),id(90),id(92)]);
 await db.query("insert into project_posts(project_id,piece_id,name)values($1,$2,'Fixture')",[project,piece]);
 const authenticate=async(user=owner)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
 await authenticate();
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
 const create=(epoch=0,key=intent)=>scalar("select reserve_exploration_intent($1,$2,$3,$4,$5,$6,$6,$7,'batch',null,null) as value",[project,piece,batch,key,epoch,digest,proof]);
 const revoke=(epoch=1,key=intent)=>scalar('select revoke_exploration_intent($1,$2,$3) as value',[project,key,epoch]);
 const resume=(values={})=>scalar('select resume_exploration_parallel_review($1,$2,$3,$4,$5,$6) as value',[values.project??project,values.piece===undefined?piece:values.piece,values.batch??batch,values.intent??intent,values.secret??secret,values.epoch??1]);
 const receipt=(key=intent,scope=project)=>scalar('select get_exploration_parallel_review($1,$2) as value',[scope,key]);
 const gate=()=>scalar('select row_to_json(g) as value from exploration_review_gates g where owner_id=$1 and project_id=$2',[owner,project]);
 const pauseGate=async()=>{await db.exec('reset role');await db.query('select ensure_exploration_review_gate($1,$2)',[owner,project]);await db.query('update exploration_review_gates set awaiting_feedback=true,unattended_batches=2 where owner_id=$1 and project_id=$2',[owner,project]);await authenticate();};
 return{db,authenticate,scalar,create,revoke,resume,receipt,gate,pauseGate};
}

test('resume records one receipt; duplicate request cannot clear a later feedback cycle',async t=>{
 const f=await fixture(t);await f.pauseGate();await f.create();
 assert.equal(await f.receipt(),null);
 assert.deepEqual(await f.resume(),{status:'resumed',intentEpoch:1,reviewEpoch:2});
 assert.equal((await f.gate()).awaiting_feedback,false);
 assert.equal(await f.scalar('select get_exploration_intent_epoch() as value'),1);
 await f.pauseGate();const before=await f.gate();
 assert.deepEqual(await f.resume(),{status:'resumed',intentEpoch:1,reviewEpoch:2});
 assert.deepEqual(await f.gate(),before);
 assert.deepEqual(await f.receipt(),{status:'resumed',intentEpoch:1,reviewEpoch:2});
});

test('revocation before resume preserves feedback; resume before revocation cannot authorize paid admission',async t=>{
 const first=await fixture(t);await first.pauseGate();await first.create();await first.revoke();const before=await first.gate();
 assert.deepEqual(await first.resume(),{status:'revoked'});assert.deepEqual(await first.gate(),before);assert.equal(await first.receipt(),null);
 const second=await fixture(t);await second.pauseGate();await second.create();await second.resume();await second.revoke();
 assert.deepEqual(await second.resume(),{status:'revoked'});
 assert.deepEqual(await second.receipt(),{status:'resumed',intentEpoch:1,reviewEpoch:2});
 assert.equal((await second.scalar('select reserve_exploration_plan($1,$2,$3,$4,$5,$6,$7,$8) as value',[project,piece,batch,id(6),digest,proof,intent,secret])).status,'conflict');
});

test('capability, intent epoch and scope are required before any gate mutation',async t=>{
 const f=await fixture(t);await f.pauseGate();await f.create();const before=await f.gate();
 for(const input of [{secret:wrong},{intent:id(7)},{batch:id(7)},{piece:null}])assert.deepEqual(await f.resume(input),{status:'revoked'});
 assert.deepEqual(await f.resume({epoch:2}),{status:'conflict'});
 assert.deepEqual(await f.resume({piece:id(9)}),{status:'not_found'});
 assert.deepEqual(await f.resume({project:id(92),piece:null}),{status:'revoked'});
 assert.deepEqual(await f.gate(),before);assert.equal(await f.receipt(),null);
 await f.authenticate(id(90));assert.deepEqual(await f.resume(),{status:'not_found'});assert.equal(await f.receipt(),null);
 await assert.rejects(f.db.query('select review_resume_status from exploration_intents'),error=>error.code==='42501');
});

test('not-paused receipt is also idempotent, and existing serial resume remains compatible',async t=>{
 const f=await fixture(t);await f.create();
 assert.deepEqual(await f.resume(),{status:'not_paused',intentEpoch:1,reviewEpoch:1});
 await f.pauseGate();const before=await f.gate();
 assert.deepEqual(await f.resume(),{status:'not_paused',intentEpoch:1,reviewEpoch:1});assert.deepEqual(await f.gate(),before);
 assert.equal(await f.scalar('select resume_exploration_review($1) as value',[project]),'resumed');
 assert.equal(await f.scalar('select resume_exploration_review($1) as value',[project]),'not_paused');
});

test('active or unknown planner blocks reset and cannot create a resume receipt',async t=>{
 for(const state of ['starting','unknown']){
  const f=await fixture(t);await f.create();
  assert.equal((await f.scalar('select reserve_exploration_plan($1,$2,$3,$4,$5,$6,$7,$8) as value',[project,piece,batch,id(6),digest,proof,intent,secret])).status,'reserved');
  if(state==='unknown')await f.scalar("select finish_exploration_plan($1,$2,'unknown',null) as value",[project,id(6)]);
  await f.pauseGate();const before=await f.gate();
  assert.deepEqual(await f.resume(),{status:'blocked'});assert.deepEqual(await f.gate(),before);assert.equal(await f.receipt(),null);
 }
});

test('resume rollback restores gate and receipt; deleted scope cannot resume but existing receipt stays readable',async t=>{
 const f=await fixture(t);await f.pauseGate();await f.create();const before=await f.gate();
 await f.db.exec('begin');await f.resume();await f.db.exec('rollback');
 assert.deepEqual(await f.gate(),before);assert.equal(await f.receipt(),null);
 await f.resume();await f.scalar('select delete_project_post($1,$2) as value',[project,piece]);
 assert.deepEqual(await f.resume(),{status:'not_found'});
 assert.deepEqual(await f.receipt(),{status:'resumed',intentEpoch:1,reviewEpoch:2});
});

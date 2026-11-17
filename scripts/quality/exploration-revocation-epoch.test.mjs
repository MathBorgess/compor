import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';

const id=n=>`35000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),project=id(2),piece=id(3),batch=id(4),intent=id(5),digest='a'.repeat(64),secret='12'.repeat(32);
const proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex');
async function fixture(t,{legacy=false}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(await readFile(new URL('../../supabase/migrations/20261117000034_exploration_revocable_intents.sql',import.meta.url),'utf8'));
 const migrate=async()=>{await db.exec(await readFile(new URL('../../supabase/migrations/20261117000035_exploration_revocation_epoch.sql',import.meta.url),'utf8'));};
 if(!legacy)await migrate();
 await db.query('insert into auth.users values($1),($2)',[owner,id(90)]);
 await db.query('insert into projects(id,owner_id)values($1,$2),($3,$4)',[project,owner,id(91),id(90)]);
 await db.query("insert into project_posts(project_id,piece_id,name)values($1,$2,'Fixture')",[project,piece]);
 const authenticate=async(user=owner)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
 await authenticate();
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
 const create=(epoch=0,key=intent)=>scalar('select reserve_exploration_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null) as value',[project,piece,batch,key,epoch,digest,digest,proof,'batch']);
 const revoke=(epoch=0,key=intent,scope=project)=>scalar('select revoke_exploration_intent($1,$2,$3) as value',[scope,key,epoch]);
 const state=(key=intent,scope=project)=>scalar('select get_exploration_intent_state($1,$2) as value',[scope,key]);
 return{db,migrate,authenticate,scalar,create,revoke,state};
}

test('replay keeps the original revocation epoch after another intent and cannot grant stale CAS',async t=>{
 const f=await fixture(t);
 assert.deepEqual(await f.state(),{state:'absent',epoch:0,revocationEpoch:null});
 assert.deepEqual(await f.revoke(),{status:'revoked',epoch:1,revocationEpoch:1});
 assert.equal((await f.create(1,id(6))).intent.epoch,2);
 assert.deepEqual(await f.state(id(6)),{state:'active',epoch:2,revocationEpoch:null});
 assert.deepEqual(await f.revoke(2,id(6)),{status:'revoked',epoch:3,revocationEpoch:3});
 const replay=await f.revoke();
 assert.deepEqual(replay,{status:'revoked',epoch:3,revocationEpoch:1});
 assert.deepEqual(await f.state(),{state:'revoked',epoch:3,revocationEpoch:1});
 assert.equal((await f.create(replay.revocationEpoch,id(7))).status,'conflict');
 assert.equal(await f.scalar('select get_exploration_intent_epoch() as value'),3);
 assert.equal((await f.create(3,id(8))).status,'reserved','a separate explicit gesture may use the current epoch');
 assert.deepEqual(await f.revoke(),{status:'revoked',epoch:4,revocationEpoch:1});
 assert.deepEqual(await f.state(id(8)),{state:'active',epoch:4,revocationEpoch:null});
});

test('lost create response and duplicate revocations record exactly one revocation epoch',async t=>{
 const f=await fixture(t);await f.create();
 const results=await Promise.all([f.revoke(0),f.revoke(1)]);
 assert.deepEqual(results,[{status:'revoked',epoch:2,revocationEpoch:2},{status:'revoked',epoch:2,revocationEpoch:2}]);
 assert.deepEqual(await f.state(),{state:'revoked',epoch:2,revocationEpoch:2});
 assert.equal((await f.create()).intent.state,'revoked');
 assert.deepEqual(await f.revoke(1,id(6)),{status:'conflict',epoch:2});
});

test('pre-migration tombstones never gain an inferred epoch from replay or later account activity',async t=>{
 const f=await fixture(t,{legacy:true});await f.create();await f.revoke(1);
 await f.db.exec('reset role');await f.migrate();await f.authenticate();
 assert.deepEqual(await f.state(),{state:'revoked',epoch:2,revocationEpoch:null});
 assert.deepEqual(await f.revoke(),{status:'revoked',epoch:2,revocationEpoch:null});
 await f.create(2,id(6));await f.revoke(3,id(6));
 assert.deepEqual(await f.revoke(),{status:'revoked',epoch:4,revocationEpoch:null});
 assert.deepEqual(await f.state(),{state:'revoked',epoch:4,revocationEpoch:null});
 await f.db.exec('reset role');
 assert.equal(await f.scalar('select revocation_epoch as value from exploration_intent_revocations where intent_id=$1',[intent]),null);
});

test('logical deletion records the same immutable proof for post and project revocation',async t=>{
 for(const scope of ['post','project']){
  const f=await fixture(t);await f.create();
  const result=scope==='post'?await f.scalar('select delete_project_post($1,$2) as value',[project,piece]):await f.scalar('select delete_project_from_list($1,1) as value',[project]);
  assert.equal(result.status,'deleted');
  assert.deepEqual(await f.state(),{state:'revoked',epoch:2,revocationEpoch:2});
  assert.deepEqual(await f.revoke(1),{status:'revoked',epoch:2,revocationEpoch:2});
 }
});

test('rollback restores epoch and active authority; tombstone metadata is inaccessible across owners',async t=>{
 const f=await fixture(t);await f.create();
 await f.db.exec('begin');await f.revoke(1);await f.db.exec('rollback');
 assert.deepEqual(await f.state(),{state:'active',epoch:1,revocationEpoch:null});
 assert.deepEqual(await f.revoke(1),{status:'revoked',epoch:2,revocationEpoch:2});
 await assert.rejects(f.db.query('select revocation_epoch from exploration_intent_revocations'),error=>error.code==='42501');
 await assert.rejects(f.db.query('update exploration_intent_revocations set revocation_epoch=99'),error=>error.code==='42501');
 await f.authenticate(id(90));
 assert.equal(await f.state(),null);assert.deepEqual(await f.revoke(1),{status:'not_found'});
 assert.deepEqual(await f.state(intent,id(91)),{state:'absent',epoch:0,revocationEpoch:null});
 assert.equal(await f.scalar('select get_exploration_intent_epoch() as value'),0);
});

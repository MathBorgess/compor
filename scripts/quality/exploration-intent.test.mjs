import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),project=id(2),piece=id(3),batch=id(4),intent=id(5),request=id(6),digest='a'.repeat(64),secret='12'.repeat(32),wrong='34'.repeat(32);
const proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(await readFile(new URL('../../supabase/migrations/20261117000034_exploration_revocable_intents.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[owner]);await db.query('insert into projects(id,owner_id)values($1,$2)',[project,owner]);
 await db.query("insert into project_posts(project_id,piece_id,name)values($1,$2,'Fixture')",[project,piece]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
 const create=(epoch=0,key=intent,purpose='batch',position=null,previous=null)=>scalar('select reserve_exploration_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as value',[project,piece,batch,key,epoch,digest,digest,proof,purpose,position,previous]);
 const revoke=(epoch=0,key=intent)=>scalar('select revoke_exploration_intent($1,$2,$3) as value',[project,key,epoch]);
 const plan=(key=intent,cap=secret)=>scalar('select reserve_exploration_plan($1,$2,$3,$4,$5,$6,$7,$8) as value',[project,piece,batch,request,digest,proof,key,cap]);
 const finishPlan=async()=>{await scalar('select bind_exploration_plan($1,$2,$3,$4) as value',[project,request,'v4.fixture.binding',secret]);await scalar("select finish_exploration_plan($1,$2,'completed',$3) as value",[project,request,secret]);};
 const reserve=(key=intent,cap=secret)=>db.query('select * from reserve_exploration_batch_proven($1,$2,$3,$4,$5,$6,$7,$8,$9)',[project,batch,piece,digest,[id(11),id(12),id(13)],[digest,digest,digest],[proof,proof,proof],key,cap]).then(r=>r.rows[0]);
 return{db,scalar,create,revoke,plan,finishPlan,reserve};
}
test('revocation before create installs a tombstone and stale CAS cannot reauthorize',async t=>{
 const f=await fixture(t);assert.equal(await f.scalar('select get_exploration_intent_epoch() as value'),0);
 assert.deepEqual(await f.revoke(),{status:'revoked',epoch:1});assert.deepEqual(await f.revoke(),{status:'revoked',epoch:1});
 assert.deepEqual(await f.scalar('select get_exploration_intent_state($1,$2) as value',[project,intent]),{state:'revoked',epoch:1});assert.equal((await f.create()).status,'revoked');assert.equal((await f.create(0,id(50))).status,'conflict');
 assert.equal((await f.create(1,id(50))).intent.epoch,2);
 assert.equal((await f.revoke(0,intent)).epoch,2,'repeat revoke must not invalidate a newer intention');
 assert.equal((await f.revoke(0,id(99))).status,'conflict');assert.equal((await f.revoke(2,id(99))).status,'conflict','unknown ID cannot cancel another active intention even at the current epoch');assert.equal((await f.plan(id(50))).status,'reserved');
});
test('create winning with lost response may be revoked; replay never reactivates; original key is unnecessary',async t=>{
 const f=await fixture(t);const created=await f.create();assert.equal(created.intent.state,'active');assert.equal(created.intent.epoch,1);assert.equal('proofDigest' in created.intent,false);
 assert.equal((await f.plan(intent,wrong)).status,'conflict');
 assert.deepEqual(await f.revoke(0),{status:'revoked',epoch:2});
 assert.equal((await f.create()).intent.state,'revoked');assert.equal((await f.plan()).status,'conflict');
 await assert.rejects(f.db.query('select * from exploration_intents'));
 await assert.rejects(f.db.query('select reserve_exploration_plan($1,$2,$3,$4,$5,$6)',[project,piece,batch,request,digest,proof]));
});
test('pause after planning blocks dispatch; fresh explicit intent can reuse completed plan without paid replan',async t=>{
 const f=await fixture(t);await f.create();await f.plan();await f.finishPlan();await f.revoke(1);
 assert.deepEqual(await f.reserve(),{state:'revoked',is_new:false});assert.equal((await f.plan()).status,'existing');
 assert.equal((await f.create(2,id(51))).status,'reserved');assert.equal((await f.plan(id(51))).status,'existing');
 assert.deepEqual(await f.reserve(id(51)),{state:'running',is_new:true});
 assert.equal((await f.create(2,id(51))).intent.state,'consumed');
 assert.deepEqual(await f.revoke(3,id(51)),{status:'revoked',epoch:4});
 assert.deepEqual(await f.reserve(id(51)),{state:'running',is_new:false},'receipt replay survives pause and cannot resend');
 assert.equal((await f.scalar('select get_exploration_batch($1,$2) as value',[project,batch])).images.length,3);
 assert.equal((await f.revoke(1,id(52))).status,'conflict');
});
test('replacement requires a new position-specific intent; deletion revokes idle intent without blocking another scope',async t=>{
 const f=await fixture(t);await f.create();await f.plan();await f.finishPlan();await f.reserve();
 for(const image of [id(11),id(12),id(13)])await f.scalar('select reject_exploration_image($1,$2,$3) as value',[project,image,secret]);
 assert.equal((await f.create(1,id(52),'replacement',1,id(11))).status,'reserved');
 const replace=(pos,prior,image)=>f.db.query('select * from replace_rejected_exploration_batch_slot_proven($1,$2,$3,$4,$5,$6,$7,$8,$9)',[project,batch,pos,prior,image,digest,proof,id(52),secret]).then(r=>r.rows[0]);
 assert.deepEqual(await replace(2,id(12),id(14)),{state:'revoked',is_new:false});
 assert.deepEqual(await replace(1,id(11),id(14)),{state:'running',is_new:true});
 await f.scalar('select reject_exploration_image($1,$2,$3) as value',[project,id(14),secret]);
 assert.equal((await f.create(2,id(53),'replacement',1,id(14))).status,'reserved');
 assert.equal((await f.scalar('select delete_project_post($1,$2) as value',[project,piece])).status,'deleted');
 assert.equal((await f.create(2,id(53),'replacement',1,id(14))).intent.state,'revoked');
 assert.equal(await f.scalar('select get_exploration_intent_epoch() as value'),4);
});

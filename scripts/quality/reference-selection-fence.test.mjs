import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
const id=n=>`38000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),other=id(2),project=id(3),otherProject=id(4),sameOwnerProject=id(5),session=id(6),command=id(7);
const state={version:1,references:[],projectReferenceIds:[],posts:[]};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt()to authenticated;`);
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql','20261117000037_reference_authority.sql',...(process.env.COMPOR_REFERENCE_FENCE_RED==='1'?[]:['20261117000038_reference_selection_fence.sql'])])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,owner]);await db.query('insert into projects(id,owner_id)values($1,$2),($3,$4),($5,$2)',[project,owner,otherProject,other,sameOwnerProject]);
 const actor=async(user=owner)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})]);};await actor();
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
 const write=(c=command,revision=0,p=project)=>scalar('select write_reference_selection($1,$2,$3,$4) as value',[p,c,revision,JSON.stringify(state)]);
 const fence=(c=command,p=project)=>scalar('select fence_reference_selection_command($1,$2) as value',[p,c]);
 const receipt=(c=command,p=project)=>scalar('select get_reference_selection_command($1,$2) as value',[p,c]);
 return{db,actor,scalar,write,fence,receipt};
}
test('fence before an in-flight write prevents all late replays and preserves the empty mirror',async t=>{
 const f=await fixture(t);assert.equal(await f.receipt(),null);
 assert.deepEqual(await f.fence(),{status:'fenced',commandId:command});assert.deepEqual(await f.fence(),{status:'fenced',commandId:command});
 assert.deepEqual(await f.receipt(),{status:'fenced',commandId:command});assert.deepEqual(await f.write(),{status:'fenced',commandId:command});
 assert.equal((await f.scalar('select get_reference_selection($1) as value',[project])).revision,0);
 assert.equal((await f.write(id(8))).status,'applied');assert.equal((await f.write(command,1)).status,'fenced');assert.equal((await f.scalar('select get_reference_selection($1) as value',[project])).revision,1);
});
test('write before fence returns the original applied receipt, never cancels or advances another command',async t=>{
 const f=await fixture(t);assert.equal((await f.write()).revision,1);assert.equal((await f.write(id(8),1)).revision,2);
 assert.deepEqual(await f.fence(),{status:'applied',commandId:command,revision:1});assert.deepEqual(await f.receipt(),{status:'applied',commandId:command,revision:1});assert.equal((await f.write()).status,'existing');
 assert.equal((await f.scalar('select get_reference_selection($1) as value',[project])).revision,2);
});
test('fences isolate accounts/projects and the old unfenced function is private',async t=>{
 const f=await fixture(t);await f.fence();assert.equal((await f.fence(command,sameOwnerProject)).status,'conflict');assert.equal((await f.write(command,0,sameOwnerProject)).status,'conflict');
 assert.equal((await f.fence(id(9),otherProject)).status,'not_found');await f.actor(other);assert.equal((await f.fence()).status,'not_found');assert.equal(await f.receipt(),null);
 await assert.rejects(f.db.query('select write_reference_selection_before_fence($1,$2,0,$3)',[project,command,JSON.stringify(state)]),e=>e.code==='42501');await assert.rejects(f.db.exec('delete from reference_selection_fences'),e=>e.code==='42501');
 await f.actor();await f.db.exec('reset role');await f.db.query('delete from auth.sessions where id=$1',[session]);await f.actor();assert.equal((await f.fence(id(10))).status,'unavailable');assert.equal(await f.receipt(id(10)),null);assert.equal((await f.receipt()).status,'fenced');
});
test('rollback removes the uncommitted fence; receipt absence alone never installs one',async t=>{
 const f=await fixture(t);await f.db.exec('begin');await f.fence();await f.db.exec('rollback');assert.equal(await f.receipt(),null);assert.equal((await f.write()).status,'applied');
 await f.db.exec('begin');await f.write(id(8),1);await f.db.exec('rollback');assert.equal(await f.receipt(id(8)),null);assert.equal((await f.fence(id(8))).status,'fenced');
});

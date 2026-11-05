import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const p='22222222-2222-4222-8222-222222222222',q='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',piece='33333333-3333-4333-8333-333333333333',pieceB='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const attempt='44444444-4444-4444-8444-444444444444',attemptB='dddddddd-dddd-4ddd-8ddd-dddddddddddd',request='55555555-5555-4555-8555-555555555555',requestB='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const root=new URL('../../../supabase/migrations/',import.meta.url),hash='a'.repeat(64),other='b'.repeat(64);
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
  create schema storage;create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
 for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261103000002_agent_attempts.sql','20261103000004_image_tool_reservations.sql','20261103000005_image_consent_declarations.sql','20261103000006_image_tool_execution_claim.sql','20261103000007_image_tool_result_submission.sql','20261103000008_agent_attempt_state.sql','20261105000013_studio_turn_metadata.sql'])await db.exec(await readFile(new URL(name,root),'utf8'));
 await db.query('insert into auth.users(id)values($1),($2)',[a,b]);await db.query("insert into public.projects(id,owner_id,title)values($1,$2,'A'),($3,$4,'B')",[p,a,q,b]);
 await db.query("insert into public.piece_versions(project_id,piece_id,version,content)values($1,$2,1,'{}'),($3,$4,1,'{}'),($1,$2,2,'{}')",[p,piece,q,pieceB]);
 await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key)values($1,$2,$3,gen_random_uuid()),($4,$5,$6,gen_random_uuid())',[attempt,a,p,attemptB,b,q]);
 const as=owner=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
 const reserve=(call,project=p,part=piece,parent=attempt,version=1)=>db.query('select * from public.reserve_image_tool_call($1,$2,$3,$4,$5,$6,$7)',[project,part,version,parent,'sess_fixture','turn_fixture',call]);
 const claim=(call,project=p,req=request,turn='turn_fixture',action=hash,result=other)=>db.query('select public.claim_studio_action($1,$2,$3,$4,$5,$6)r',[project,req,turn,call,action,result]);
 await as(a);await db.query('select public.reserve_studio_turn($1,$2,$3)',[p,request,hash]);await db.query("select public.bind_studio_session($1,$2,'v4.synthetic.proof',now()+interval '4 minutes',null,0,0)",[p,request]);await db.query("select public.set_studio_turn_state($1,$2,'action_required','turn_fixture')",[p,request]);
 await reserve('call_historical');await claim('call_historical');await db.exec('reset role');
 const history=(await db.query("select 'image' kind,to_jsonb(r)row from public.image_tool_reservations r where call_id='call_historical' union all select 'studio',to_jsonb(s) from public.studio_action_submissions s where call_id='call_historical' order by kind")).rows;
 await db.exec(await readFile(new URL('20261105000016_provider_call_ids.sql',root),'utf8'));
 return{db,as,reserve,claim,history};
}

test('call and exec remain opaque, bounded and idempotent; historical call rows are unchanged',async t=>{
 const{db,as,reserve,claim,history}=await fixture(t);await as(a);
 const first=(await claim('exec_fixture')).rows[0].r;assert.equal(first.status,'claimed');
 assert.equal((await claim('exec_fixture')).rows[0].r.status,'existing');
 assert.equal((await claim('exec_fixture',p,request,'turn_fixture',other,other)).rows[0].r.status,'conflict');
 assert.equal((await claim('exec_fixture',p,request,'turn_fixture',hash,hash)).rows[0].r.status,'conflict');
 assert.equal((await claim('call_fixture')).rows[0].r.status,'claimed','prefixes are not normalized into an alias');
 assert.equal((await db.query('select public.get_studio_action($1,$2,$3,$4)r',[p,request,'turn_fixture','exec_fixture'])).rows[0].r.state,'sending');
 const image=(await reserve('exec_fixture')).rows[0];assert.equal(image.is_new,true);assert.equal((await reserve('exec_fixture')).rows[0].reservation_id,image.reservation_id);assert.equal((await reserve('exec_fixture')).rows[0].is_new,false);
 await assert.rejects(()=>reserve('exec_fixture',p,piece,attempt,2),'same call cannot be moved to another version');
 for(const prefix of ['call','exec']){
  assert.equal((await claim(prefix+'_'+'x'.repeat(128))).rows[0].r.status,'claimed');
  assert.equal((await reserve(prefix+'_'+'x'.repeat(128))).rows[0].is_new,true);
 }
 for(const id of ['exec_','call_','exec_a.b','exec_a b','exec_á','other_id','EXEC_id','exec_'+'x'.repeat(129),'call_'+'x'.repeat(129)]){
  await assert.rejects(()=>claim(id));await assert.rejects(()=>reserve(id));
 }
 await db.exec('reset role');
 const after=(await db.query("select 'image' kind,to_jsonb(r)row from public.image_tool_reservations r where call_id='call_historical' union all select 'studio',to_jsonb(s) from public.studio_action_submissions s where call_id='call_historical' order by kind")).rows;
 assert.deepEqual(after,history);
});

test('exec IDs survive consent, execution, exact result linkage and terminal receipts in the isolated fixture',async t=>{
 const{db,as,reserve}=await fixture(t);await as(a);const reservation=(await reserve('exec_result')).rows[0].reservation_id;
 await db.query('select * from public.declare_image_generation_consent($1,true)',[reservation]);
 const execution=(await db.query('select * from public.claim_image_tool_execution($1)',[reservation])).rows[0];
 await assert.rejects(()=>db.query('select public.complete_image_tool_execution($1)',[execution.execution_id]),'no fake completion without a private-object record');
 await db.exec('reset role');await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['compor-project-images',`${a}/${p}/${piece}/1/${execution.asset_id}.png`]);await as(a);
 assert.equal((await db.query('select public.complete_image_tool_execution($1)ok',[execution.execution_id])).rows[0].ok,true);
 const resultArgs=[execution.execution_id,p,piece,1,attempt,'sess_fixture','turn_fixture','exec_result'];
 const sql='select * from public.claim_image_tool_result_submission($1,$2,$3,$4,$5,$6,$7,$8)';
 await assert.rejects(()=>db.query(sql,[...resultArgs.slice(0,7),'call_result']),'prefix replacement cannot substitute the signed pending call');
 const result=(await db.query(sql,resultArgs)).rows[0];assert.equal(result.is_new,true);assert.equal((await db.query(sql,resultArgs)).rows[0].is_new,false);
 assert.equal((await db.query("select public.finish_image_tool_result_submission($1,'sent')ok",[result.submission_id])).rows[0].ok,true);
 await assert.rejects(()=>db.query("select public.finish_image_tool_result_submission($1,'unknown')",[result.submission_id]));
 await as(b);await assert.rejects(()=>db.query(sql,resultArgs));await assert.rejects(()=>db.query("select public.finish_image_tool_result_submission($1,'sent')",[result.submission_id]));
});

test('two identities cannot steal exec claims or write tables; anonymous callers remain denied',async t=>{
 const{db,as,reserve,claim}=await fixture(t);await as(a);const action=(await claim('exec_cross')).rows[0].r;await reserve('exec_cross');
 await as(b);assert.equal((await claim('exec_cross')).rows[0].r.status,'unavailable');
 assert.equal((await db.query('select public.get_studio_action($1,$2,$3,$4)r',[p,request,'turn_fixture','exec_cross'])).rows[0].r,null);
 assert.equal((await db.query("select public.finish_studio_action($1,$2,$3,'accepted')ok",[p,request,action.id])).rows[0].ok,false);
 await assert.rejects(()=>reserve('exec_cross'));
 await assert.rejects(()=>reserve('exec_cross',q,pieceB,attemptB),'global call collision cannot be claimed by another owner');
 assert.equal((await reserve('exec_owned_b',q,pieceB,attemptB)).rows[0].is_new,true);
 await db.query('select public.reserve_studio_turn($1,$2,$3)',[q,requestB,hash]);await db.query("select public.bind_studio_session($1,$2,'v4.synthetic.proof',now()+interval '4 minutes',null,0,0)",[q,requestB]);await db.query("select public.set_studio_turn_state($1,$2,'action_required','turn_fixture')",[q,requestB]);
 assert.equal((await claim('exec_owned_b',q,requestB)).rows[0].r.status,'claimed');
 await assert.rejects(()=>db.query("update public.image_tool_reservations set call_id='exec_bypass'"));await assert.rejects(()=>db.query("update public.studio_action_submissions set call_id='exec_bypass'"));
 await db.exec('reset role;set role anon');await assert.rejects(()=>reserve('exec_anonymous',q,pieceB,attemptB));await assert.rejects(()=>claim('exec_anonymous',q,requestB));
});

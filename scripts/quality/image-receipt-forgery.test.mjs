import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionBindings} from '../../packages/agents-api/src/session-binding.mjs';

test('titular que forja Storage e estados SQL não forja recibo de execução',async()=>{
 const db=new PGlite();
 const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',requestId='55555555-5555-4555-8555-555555555555';
 try {
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);create table storage.objects(bucket_id text not null,name text not null,primary key(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema auth,public,storage to public;grant select,insert on storage.objects to authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to public;`);
  const migrations=['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261103000002_agent_attempts.sql','20261103000003_private_project_images.sql','20261103000004_image_tool_reservations.sql','20261103000005_image_consent_declarations.sql','20261103000006_image_tool_execution_claim.sql','20261103000007_image_tool_result_submission.sql','20261103000008_agent_attempt_state.sql','20261105000013_studio_turn_metadata.sql','20261105000016_provider_call_ids.sql','20261106000024_confirm_closed_image_attempt.sql','20261106000026_image_execution_receipts.sql'];
  for(const file of migrations)await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1)',[userId]);
  await db.query('insert into public.projects(id,owner_id,title) values($1,$2,$3)',[projectId,userId,'Synthetic']);
  await db.query('insert into public.piece_versions(project_id,piece_id,version,content) values($1,$2,1,$3)',[projectId,pieceId,'{}']);
  await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key) values($1,$2,$3,$4)',[attemptId,userId,projectId,requestId]);
  await db.query("insert into public.studio_turns(request_id,owner_id,project_id,attempt_id,input_digest,state,turn_id) values($1,$2,$3,$4,$5,'action_required','turn_123')",[requestId,userId,projectId,attemptId,'a'.repeat(64)]);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userId]);
  const q=async(sql,args)=>(await db.query(sql,args)).rows;
  const reservation=(await q('select * from public.reserve_image_tool_call($1,$2,1,$3,$4,$5,$6)',[projectId,pieceId,attemptId,'sess_123','turn_123','call_123']))[0].reservation_id;
  await q('select * from public.declare_image_generation_consent($1,true)',[reservation]);
  const execution=(await q('select * from public.claim_image_tool_execution($1)',[reservation]))[0];
  await q('insert into storage.objects(bucket_id,name) values($1,$2)',['compor-project-images',`${userId}/${projectId}/${pieceId}/1/${execution.asset_id}.png`]);
  await q('select public.complete_image_tool_execution($1)',[execution.execution_id]);
  const submission=(await q('select * from public.claim_image_tool_result_submission($1,$2,$3,1,$4,$5,$6,$7)',[execution.execution_id,projectId,pieceId,attemptId,'sess_123','turn_123','call_123']))[0];
  await q("select public.finish_image_tool_result_submission($1,'sent')",[submission.submission_id]);
  await q("select public.set_studio_turn_state($1,$2,'completed','turn_123')",[projectId,requestId]);
  await q("select public.finish_agent_attempt($1,$2,'completed')",[projectId,attemptId]);
  assert.equal((await q('select public.confirm_closed_image_attempt($1,$2) as result',[projectId,requestId]))[0].result,'unverified');
  assert.deepEqual((await q('select public.get_completed_image_receipt($1,$2) as result',[projectId,requestId]))[0].result,{status:'unverified'});
  // The authenticated owner can write junk to its own slot, but cannot sign.
  assert.equal((await q('select public.store_image_execution_receipt($1,$2,$3,$4,$5) as result',[projectId,requestId,attemptId,execution.execution_id,'v7.payload.signature']))[0].result,true);
  const candidate=(await q('select public.get_completed_image_receipt($1,$2) as result',[projectId,requestId]))[0].result;
  assert.equal(candidate.status,'candidate');
  const bindings=createSessionBindings({secret:Buffer.alloc(32,17)});
  assert.equal(bindings.verifyImageReceipt({token:candidate.proof,userId,projectId,requestId,attemptId,pieceId,version:1,executionId:execution.execution_id,assetId:execution.asset_id}),null);
 } finally {await db.close();}
});

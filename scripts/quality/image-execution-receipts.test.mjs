import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('recibo opaco exige vínculo completo, não libera fence e permanece não confiável',async()=>{
 const db=new PGlite();
 const owner=id(1),other=id(2),project=id(3),otherProject=id(4),piece=id(5),attempt=id(6),request=id(7),reservation=id(8),execution=id(9),asset=id(10),submission=id(11);
 const proof='v7.payload.signature',different='v7.other.signature';
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
   create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
   create table public.piece_versions(project_id uuid,piece_id uuid,version integer,primary key(project_id,piece_id,version));
   create table public.agent_attempts(id uuid primary key,owner_id uuid,project_id uuid,state text);
   create table public.studio_turns(request_id uuid primary key,owner_id uuid,project_id uuid,attempt_id uuid unique,state text);
   create table public.image_tool_reservations(id uuid primary key,owner_id uuid,project_id uuid,piece_id uuid,piece_version integer,agent_attempt_id uuid,state text);
   create table public.image_tool_executions(id uuid primary key,owner_id uuid,reservation_id uuid unique,asset_id uuid,state text);
   create table public.image_tool_result_submissions(id uuid primary key,owner_id uuid,execution_id uuid unique,state text);
   create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261106000026_image_execution_receipts.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  await db.query('insert into public.projects values($1,$2),($3,$4)',[project,owner,otherProject,other]);
  await db.query('insert into public.piece_versions values($1,$2,1)',[project,piece]);
  await db.query("insert into public.agent_attempts values($1,$2,$3,'completed')",[attempt,owner,project]);
  await db.query("insert into public.studio_turns values($1,$2,$3,$4,'completed')",[request,owner,project,attempt]);
  await db.query("insert into public.image_tool_reservations values($1,$2,$3,$4,1,$5,'reserved')",[reservation,owner,project,piece,attempt]);
  await db.query("insert into public.image_tool_executions values($1,$2,$3,$4,'completed')",[execution,owner,reservation,asset]);
  await db.query("insert into public.image_tool_result_submissions values($1,$2,$3,'sent')",[submission,owner,execution]);
  const objectName=`${owner}/${project}/${piece}/1/${asset}.png`;
  await db.query("insert into storage.objects values('compor-project-images',$1)",[objectName]);
  await db.exec('set role authenticated');
  const actor=value=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[value]);
  const store=(scope=project,req=request,att=attempt,exec=execution,token=proof)=>db.query('select public.store_image_execution_receipt($1,$2,$3,$4,$5) as result',[scope,req,att,exec,token]);
  const lookup=(scope=project,req=request)=>db.query('select public.get_completed_image_receipt($1,$2) as result',[scope,req]);
  const asAdmin=async(fn)=>{await db.exec('reset role');try{await fn();}finally{await db.exec('set role authenticated');await actor(owner);}};
  await actor(owner);
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'sem prova não libera resultado');
  assert.equal((await store(project,id(12))).rows[0].result,false,'outro request não pode vincular execução');
  assert.equal((await store(project,request,id(12))).rows[0].result,false,'outro attempt não pode vincular execução');
  assert.equal((await store(otherProject)).rows[0].result,false,'outro projeto não pode vincular execução');
  await assert.rejects(store(project,request,attempt,execution,'v7.x.'+'x'.repeat(2049)),'limite de prova é obrigatório');
  await asAdmin(()=>db.query("update public.image_tool_executions set state='unknown' where id=$1",[execution]));
  assert.equal((await store()).rows[0].result,false,'resultado desconhecido não cria prova');
  await asAdmin(()=>db.query("update public.image_tool_executions set state='completed' where id=$1",[execution]));
  await asAdmin(()=>db.query("update public.image_tool_result_submissions set state='unknown' where id=$1",[submission]));
  assert.equal((await store()).rows[0].result,false,'envio desconhecido não cria prova');
  await asAdmin(()=>db.query("update public.image_tool_result_submissions set state='sent' where id=$1",[submission]));
  await asAdmin(async()=>{await db.query("update public.agent_attempts set state='started' where id=$1",[attempt]);await db.query("update public.studio_turns set state='action_required' where request_id=$1",[request]);});
  assert.equal((await store()).rows[0].result,true);
  assert.equal((await store()).rows[0].result,true,'repetição idêntica é idempotente');
  assert.equal((await store(project,request,attempt,execution,different)).rows[0].result,false,'não substitui prova existente');
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'recibo pode ser gravado antes do término, mas não recuperado enquanto a tentativa está aberta');
  await asAdmin(async()=>{await db.query("update public.agent_attempts set state='completed' where id=$1",[attempt]);await db.query("update public.studio_turns set state='completed' where request_id=$1",[request]);});
  await assert.rejects(db.query('select * from public.image_execution_receipts'));
  await assert.rejects(db.query('delete from public.image_execution_receipts'));
  const candidate=(await lookup()).rows[0].result;
  assert.deepEqual(candidate,{status:'candidate',requestId:request,attemptId:attempt,pieceId:piece,version:1,executionId:execution,assetId:asset,proof},'candidate é apenas dados para validação HMAC no servidor');
  await actor(other);
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'});
  assert.equal((await store()).rows[0].result,false,'outra conta não grava recibo');
  await actor(owner);
  for(const [sql,args] of [
   ["update public.studio_turns set state='unknown' where request_id=$1",[request]],
   ["update public.studio_turns set state='failed' where request_id=$1",[request]],
   ["update public.studio_turns set state='cancelled' where request_id=$1",[request]],
   ["update public.agent_attempts set state='unknown' where id=$1",[attempt]],
   ["update public.agent_attempts set state='failed' where id=$1",[attempt]],
   ["update public.image_tool_reservations set state='unknown' where id=$1",[reservation]],
   ["update public.image_tool_executions set state='unknown' where id=$1",[execution]],
   ["update public.image_tool_result_submissions set state='unknown' where id=$1",[submission]],
  ]){
   await asAdmin(()=>db.query(sql,args));assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'estado ambíguo não retorna candidato');
   const table=sql.match(/update public\.([a-z_]+)/)[1];
   const restore={studio_turns:'completed',agent_attempts:'completed',image_tool_reservations:'reserved',image_tool_executions:'completed',image_tool_result_submissions:'sent'}[table];
   await asAdmin(()=>db.query(`update public.${table} set state=$2 where ${table==='studio_turns'?'request_id':'id'}=$1`,[args[0],restore]));
  }
  await asAdmin(()=>db.query("delete from storage.objects where bucket_id='compor-project-images' and name=$1",[objectName]));
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'objeto ausente não retorna candidato');
  await asAdmin(()=>db.query("insert into storage.objects values('compor-project-images',$1)",[objectName]));
  await asAdmin(()=>db.query("insert into public.image_tool_reservations values($1,$2,$3,$4,1,$5,'reserved')",[id(20),owner,project,piece,attempt]));
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'múltiplas reservas são ambíguas');
  await asAdmin(async()=>{await db.query('delete from public.image_tool_reservations where id=$1',[id(20)]);await db.query('update public.projects set owner_id=$1 where id=$2',[other,project]);});
  assert.deepEqual((await lookup()).rows[0].result,{status:'unverified'},'perda de titularidade impede consulta');
  await db.exec('reset role; set role anon');await assert.rejects(lookup());
 } finally {await db.close();}
});

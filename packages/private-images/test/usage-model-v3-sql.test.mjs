import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../../supabase/migrations/',import.meta.url);
const a='11111111-1111-4111-8111-111111111111',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const p='22222222-2222-4222-8222-222222222222',q='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.objects(bucket_id text,name text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
 for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261103000002_agent_attempts.sql','20261103000004_image_tool_reservations.sql','20261103000005_image_consent_declarations.sql','20261103000006_image_tool_execution_claim.sql','20261103000007_image_tool_result_submission.sql','20261103000008_agent_attempt_state.sql','20261103000009_usage_measurements.sql','20261105000012_image_model_26.sql'])await db.exec(await readFile(new URL(name,root),'utf8'));
 await db.query('insert into auth.users(id)values($1),($2)',[a,b]);
 await db.query("insert into public.projects(id,owner_id,title)values($1,$2,'Synthetic A'),($3,$4,'Synthetic B')",[p,a,q,b]);
 const attempt=async(owner=a,project=p)=>(await db.query('insert into public.agent_attempts(owner_id,project_id,idempotency_key)values($1,$2,gen_random_uuid())returning id',[owner,project])).rows[0].id;
 const initial=await attempt();
 await db.query("insert into public.usage_measurements(owner_id,project_id,attempt_id,part,part_id,model,state,input_tokens)values($1,$2,$3,'agent',$3,'gpt-6-astra','completed',17),($1,$2,$3,'image',gen_random_uuid(),'gpt-image-2.5-flare','completed',19),($1,$2,$3,'image',gen_random_uuid(),'gpt-image-2.6-flare','completed',23)",[a,p,initial]);
 const history=(await db.query('select to_jsonb(m)row from public.usage_measurements m order by part,part_id')).rows;
 const oldFunctions=(await db.query("select proname,prosrc from pg_proc where proname in('start_usage_measurement','start_usage_measurement_v2','finish_usage_measurement') order by proname")).rows;
 await db.exec(await readFile(new URL('20261105000015_usage_model_v3.sql',root),'utf8'));
 const as=async owner=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
 const execution=async(parent,state='running')=>{
  await db.exec('reset role');
  const piece=(await db.query("insert into public.piece_versions(project_id,piece_id,version,content)values($1,gen_random_uuid(),1,'{}')returning piece_id",[p])).rows[0].piece_id;
  const reservation=(await db.query("insert into public.image_tool_reservations(owner_id,project_id,piece_id,piece_version,agent_attempt_id,session_id,turn_id,call_id)values($1,$2,$3,1,$4,'sess_synthetic','turn_synthetic','call_'||gen_random_uuid())returning id",[a,p,piece,parent])).rows[0].id;
  const id=(await db.query('insert into public.image_tool_executions(owner_id,reservation_id,state)values($1,$2,$3)returning id',[a,reservation,state])).rows[0].id;
  const submission=state==='completed'?(await db.query('insert into public.image_tool_result_submissions(owner_id,execution_id)values($1,$2)returning id',[a,id])).rows[0].id:null;
  return{id,submission};
 };
 return{db,attempt,as,execution,history,oldFunctions,initial};
}

test('v3 accepts explicit models, preserves old rows/RPCs and never reclassifies duplicate measurements',async t=>{
 const{db,attempt,as,execution,history,oldFunctions,initial}=await fixture(t);
 assert.deepEqual((await db.query('select to_jsonb(m)row from public.usage_measurements m order by part,part_id')).rows,history);
 assert.deepEqual((await db.query("select proname,prosrc from pg_proc where proname in('start_usage_measurement','start_usage_measurement_v2','finish_usage_measurement') order by proname")).rows,oldFunctions);
 const terra=await attempt(),astra=await attempt(),legacy=await attempt();
 const images=[];for(let i=0;i<4;i++)images.push(await execution(terra));
 const resumes=[await execution(terra,'completed'),await execution(terra,'completed')];
 await as(a);
 const start=async(parent,part,id,model)=>(await db.query('select public.start_usage_measurement_v3($1,$2,$3,$4,$5)ok',[p,parent,part,id,model])).rows[0].ok;
 assert.equal(await start(terra,'agent',terra,'gpt-6.1-terra'),true);
 assert.equal(await start(terra,'agent',terra,'gpt-6.1-terra'),false);
 assert.equal(await start(terra,'agent',terra,'gpt-6-astra'),false);
 assert.equal(await start(astra,'agent',astra,'gpt-6-astra'),true);
 assert.equal((await db.query("select public.start_usage_measurement_v2($1,$2,'agent',$2)ok",[p,legacy])).rows[0].ok,true);
 for(const [index,model]of [[0,'gpt-image-2.5-flare'],[1,'gpt-image-2.6-flare']])assert.equal(await start(terra,'image',images[index].id,model),true);
 assert.equal((await db.query("select public.start_usage_measurement($1,$2,'image',$3)ok",[p,terra,images[2].id])).rows[0].ok,true);
 assert.equal((await db.query("select public.start_usage_measurement_v2($1,$2,'image',$3)ok",[p,terra,images[3].id])).rows[0].ok,true);
 for(const [index,model]of [[0,'gpt-6.1-terra'],[1,'gpt-6-astra']])assert.equal(await start(terra,'agent_resume',resumes[index].submission,model),true);
 for(const [part,id,model]of [['agent',terra,null],['agent',terra,'gpt-image-2.6-flare'],['image',images[0].id,'gpt-6.1-terra'],['agent_resume',resumes[0].submission,'gpt-image-2.5-flare'],['agent',terra,'unexpected-model'],['agent',astra,'gpt-6.1-terra']])await assert.rejects(()=>start(terra,part,id,model));
 const actual=(await db.query('select part_id,model from public.usage_measurements where attempt_id=$1',[terra])).rows;
 assert.equal(actual.find(row=>row.part_id===terra).model,'gpt-6.1-terra');
 assert.equal(actual.find(row=>row.part_id===images[2].id).model,'gpt-image-2.5-flare');
 assert.equal(actual.find(row=>row.part_id===images[3].id).model,'gpt-image-2.6-flare');
 assert.deepEqual((await db.query('select to_jsonb(m)row from public.usage_measurements m where attempt_id=$1 order by part,part_id',[initial])).rows,history);
 assert.equal((await db.query("select public.finish_usage_measurement($1,$2,'agent',$2,'completed',11,13,24,null,null,null)ok",[p,terra])).rows[0].ok,true);
 const finished=(await db.query("select model,estimated_cost_usd,pricing_version from public.usage_measurements where attempt_id=$1 and part='agent'",[terra])).rows[0];
 assert.deepEqual(finished,{model:'gpt-6.1-terra',estimated_cost_usd:null,pricing_version:null});
});

test('v3 denies foreign accounts, direct writes, terminal attempts and anonymous invocation',async t=>{
 const{db,attempt,as,execution}=await fixture(t);const parent=await attempt(),ownB=await attempt(b,q),image=await execution(parent),resume=await execution(parent,'completed');
 const start=(project,id,part,partId,model)=>db.query('select public.start_usage_measurement_v3($1,$2,$3,$4,$5)ok',[project,id,part,partId,model]);
 await as(b);assert.equal((await start(q,ownB,'agent',ownB,'gpt-6.1-terra')).rows[0].ok,true);
 for(const [part,id,model]of [['agent',parent,'gpt-6.1-terra'],['image',image.id,'gpt-image-2.6-flare'],['agent_resume',resume.submission,'gpt-6-astra']])await assert.rejects(()=>start(p,parent,part,id,model));
 assert.equal((await db.query('select count(*)::int n from public.usage_measurements where project_id=$1',[p])).rows[0].n,0);
 await assert.rejects(()=>db.query("update public.usage_measurements set model='gpt-6.1-terra'"));
 await as(a);await db.query("select public.finish_agent_attempt($1,$2,'unknown')",[p,parent]);
 await assert.rejects(()=>start(p,parent,'agent',parent,'gpt-6.1-terra'));
 await db.exec('reset role;set role anon');await assert.rejects(()=>start(q,ownB,'agent',ownB,'gpt-6.1-terra'));
});

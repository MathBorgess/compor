// Explicit local-only proof; never targets a Supabase URL or host port.
// Container must be a newly created, task-owned PostgreSQL 17 instance.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {databaseSql} from '../../scripts/quality/fixtures/exploration-parallel-db.mjs';
const container=process.env.COMPOR_PARALLEL_PG_CONTAINER;
if(!container?.startsWith('compor-parallel-sql-'))throw Error('Set COMPOR_PARALLEL_PG_CONTAINER to a task-owned isolated container.');
const database=`parallel_proof_${process.pid}`;
function connection(db=database){
 const child=spawn('docker',['--context','colima','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{stdio:['pipe','pipe','pipe']});
 let output='',error='';const listeners=[];
 child.stdout.on('data',chunk=>{output+=chunk;for(const fn of listeners)fn(output);});child.stderr.on('data',chunk=>{error+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(error||`psql exited ${code}`)));});
 return {child,done,wait:marker=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Barrier timed out')),5000);const check=text=>{if(text.includes(marker)){clearTimeout(timer);resolve();}};listeners.push(check);check(output);done.catch(reject);})};
}
function sql(query,db=database){const c=connection(db);c.child.stdin.end(query);return c.done;}
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),project=id(2),piece=id(3),digest='a'.repeat(64),secret='12'.repeat(32);
const proof="encode(sha256(decode('"+secret+"','hex')),'hex')";
const actor=`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`;
const reservePlan=(batch,request,scope=project)=>`select reserve_exploration_plan('${scope}','${piece}','${batch}','${request}','${digest}',${proof});`;
const finishPlan=request=>`select bind_exploration_plan('${project}','${request}','v4.fixture.binding','${secret}');select finish_exploration_plan('${project}','${request}','completed','${secret}');`;
const reserve=(batch,images)=>`select row_to_json(r) from reserve_exploration_batch_proven('${project}','${batch}','${piece}','${digest}',array[${images.map(x=>`'${x}'::uuid`).join(',')}],array['${digest}','${digest}','${digest}'],array[${proof},${proof},${proof}]) r;`;
async function heldRace(first,second){
 const c=connection();c.child.stdin.write(`begin;${actor}${first}select 'proof-lock-held';\n`);await c.wait('proof-lock-held');
 const competing=sql(`${actor}set application_name='compor-parallel-contender';${second}`);
 try{
  let blocked=false;for(let i=0;i<100;i++){const observed=await sql("select count(*) from pg_stat_activity where application_name='compor-parallel-contender' and wait_event='advisory';");if(observed.trim()==='1'){blocked=true;break;}await delay(10);}
  assert.equal(blocked,true,'independent transaction must wait on the owner advisory lock');
 }finally{c.child.stdin.end('commit;\n');}
 return {first:await c.done,second:await competing};
}
await sql(`create database ${database};`,'postgres');
try{
 await sql((await databaseSql()).replace('create role anon; create role authenticated;', ()=>"do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end$$;"));
 await sql(`insert into auth.users values('${owner}');insert into projects(id,owner_id)values('${project}','${owner}');insert into project_posts(project_id,piece_id,name)values('${project}','${piece}','Fixture');`);
 const plannerRace=await heldRace(reservePlan(id(10),id(11)),reservePlan(id(20),id(21)));
 assert.match(plannerRace.first,/"status": "reserved"/);assert.match(plannerRace.second,/"status": "busy"/);
 const deleteRace=await heldRace(`select get_exploration_plan('${project}','${id(11)}');select pg_advisory_xact_lock(hashtextextended('${owner}',0));`,`select delete_project_post('${project}','${piece}');`);
 assert.match(deleteRace.second,/"status": "pending"/);
 await sql(actor+finishPlan(id(11))+reservePlan(id(20),id(21))+finishPlan(id(21)));
 const images=[id(101),id(102),id(103)],batch=id(10);
 const batchRace=await heldRace(reserve(batch,images),reserve(batch,images));
 assert.match(batchRace.first,/"is_new":true/);assert.match(batchRace.second,/"is_new":false/);
 const otherBatch=await heldRace(reserve(batch,images),reserve(id(20),[id(201),id(202),id(203)]));assert.match(otherBatch.second,/"state":"busy"/);
 assert.equal((await sql('select count(*) from exploration_images;')).trim(),'3');
 const completed=await Promise.all([...images].reverse().map(image=>sql(`${actor}insert into storage.objects(bucket_id,name)values('compor-exploration-images','${owner}/${project}/${image}.png');select complete_exploration_image_proven('${project}','${image}','${secret}');`)));
 assert.equal(completed.length,3);
 const state=JSON.parse((await sql(`${actor}select get_exploration_batch('${project}','${batch}');`)).trim().split('\n').at(-1));
 assert.equal(state.state,'completed');assert.deepEqual(state.images.map(x=>x.revision),[2,2,2]);assert.equal(Date.parse(state.next_at)-Date.parse(state.completed_at),15000);
 assert.equal((await sql('select unattended_batches from exploration_review_gates;')).trim(),'1');
 await sql("update exploration_batches set completed_at=now()-interval '16 seconds',next_at=now()-interval '1 second';");
 const deletedFirst=await heldRace(`select delete_project_post('${project}','${piece}');`,reservePlan(id(30),id(31)));
 assert.match(deletedFirst.second,/"status": "not_found"/);
 await sql(await readFile(new URL('../migrations/20261117000034_exploration_revocable_intents.sql',import.meta.url),'utf8'));
 const intentPiece=id(3001),intentBatch=id(3002),intentRequest=id(3003);
 await sql(`insert into project_posts(project_id,piece_id,name)values('${project}','${intentPiece}','Intent fixture');`);
 const createIntent=(intent,epoch)=>`select reserve_exploration_intent('${project}','${intentPiece}','${intentBatch}','${intent}',${epoch},'${digest}','${digest}',${proof},'batch',null,null);`;
 const revokeIntent=(intent,epoch)=>`select revoke_exploration_intent('${project}','${intent}',${epoch});`;
 const planIntent=intent=>`select reserve_exploration_plan('${project}','${intentPiece}','${intentBatch}','${intentRequest}','${digest}',${proof},'${intent}','${secret}');`;
 const dispatchIntent=intent=>`select row_to_json(r) from reserve_exploration_batch_proven('${project}','${intentBatch}','${intentPiece}','${digest}',array['${id(3101)}'::uuid,'${id(3102)}'::uuid,'${id(3103)}'::uuid],array['${digest}','${digest}','${digest}'],array[${proof},${proof},${proof}],'${intent}','${secret}')r;`;
 const beforeCreate=await heldRace(revokeIntent(id(3010),0),createIntent(id(3010),0));assert.match(beforeCreate.second,/'?revoked'?/);
 const afterCreate=await heldRace(createIntent(id(3011),1),revokeIntent(id(3011),1));assert.match(afterCreate.second,/"status": "revoked"/);
 const newer=await heldRace(createIntent(id(3012),3),revokeIntent(id(3099),2));assert.match(newer.second,/"status": "conflict"/);
 await sql(actor+planIntent(id(3012))+finishPlan(intentRequest));
 const beforeDispatch=await heldRace(revokeIntent(id(3012),4),dispatchIntent(id(3012)));assert.match(beforeDispatch.second,/"state":"revoked"/);
 assert.equal((await sql(`select count(*) from exploration_images where parallel_batch_id='${intentBatch}';`)).trim(),'0');
 await sql(actor+createIntent(id(3013),5));
 const afterDispatch=await heldRace(dispatchIntent(id(3013)),revokeIntent(id(3013),6));assert.match(afterDispatch.first,/"is_new":true/);assert.match(afterDispatch.second,/"status": "revoked"/);
 assert.equal((await sql(`select count(*) from exploration_images where parallel_batch_id='${intentBatch}' and state='running';`)).trim(),'3');
 await sql(await readFile(new URL('../migrations/20261117000035_exploration_revocation_epoch.sql',import.meta.url),'utf8'));
 const resultOf=output=>JSON.parse(output.trim().split('\n').filter(line=>line.startsWith('{')).at(-1));
 assert.deepEqual(resultOf(await sql(actor+revokeIntent(id(3013),6))),{status:'revoked',epoch:7,revocationEpoch:null},'historical tombstone has no invented epoch');
 await sql(actor+createIntent(id(3020),7));
 const duplicateRevokes=await heldRace(revokeIntent(id(3020),8),revokeIntent(id(3020),7));
 assert.deepEqual(resultOf(duplicateRevokes.first),{status:'revoked',epoch:9,revocationEpoch:9});
 assert.deepEqual(resultOf(duplicateRevokes.second),{status:'revoked',epoch:9,revocationEpoch:9});
 const newerThenReplay=await heldRace(createIntent(id(3021),9),revokeIntent(id(3020),8));
 assert.equal(resultOf(newerThenReplay.first).status,'reserved');
 assert.deepEqual(resultOf(newerThenReplay.second),{status:'revoked',epoch:10,revocationEpoch:9});
 assert.deepEqual(resultOf(await sql(`${actor}select get_exploration_intent_state('${project}','${id(3021)}');`)),{state:'active',epoch:10,revocationEpoch:null});
 await sql(actor+revokeIntent(id(3021),10));
 assert.equal(resultOf(await sql(actor+createIntent(id(3022),9))).status,'conflict','old revocation proof cannot adopt a newer idle epoch');
 assert.deepEqual(resultOf(await sql(`${actor}select get_exploration_intent_state('${project}','${id(3020)}');`)),{state:'revoked',epoch:11,revocationEpoch:9});
 const revokeBeforeCreate35=await heldRace(revokeIntent(id(3030),11),createIntent(id(3030),11));
 assert.deepEqual(resultOf(revokeBeforeCreate35.first),{status:'revoked',epoch:12,revocationEpoch:12});
 assert.equal(resultOf(revokeBeforeCreate35.second).status,'revoked');
 const createBeforeRevoke35=await heldRace(createIntent(id(3031),12),revokeIntent(id(3031),12));
 assert.deepEqual(resultOf(createBeforeRevoke35.second),{status:'revoked',epoch:14,revocationEpoch:14});
 await sql(await readFile(new URL('../migrations/20261117000036_exploration_parallel_review.sql',import.meta.url),'utf8'));
 for(const image of [id(3101),id(3102),id(3103)])await sql(`${actor}select reject_exploration_image('${project}','${image}','${secret}');`);
 await sql(`${actor}select delete_project_post('${project}','${intentPiece}');`);
 const reviewPiece=id(4001),reviewBatch=id(4002);
 await sql(`insert into project_posts(project_id,piece_id,name)values('${project}','${reviewPiece}','Review fixture');`);
 const createReview=(intent,epoch)=>`select reserve_exploration_intent('${project}','${reviewPiece}','${reviewBatch}','${intent}',${epoch},'${digest}','${digest}',${proof},'batch',null,null);`;
 const resumeReview=(intent,epoch)=>`select resume_exploration_parallel_review('${project}','${reviewPiece}','${reviewBatch}','${intent}','${secret}',${epoch});`;
 const pauseReview=()=>sql(`update exploration_review_gates set awaiting_feedback=true,unattended_batches=2 where owner_id='${owner}' and project_id='${project}';`);
 await pauseReview();await sql(actor+createReview(id(4010),14));
 const revokeBeforeResume=await heldRace(revokeIntent(id(4010),15),resumeReview(id(4010),15));
 assert.deepEqual(resultOf(revokeBeforeResume.second),{status:'revoked'});
 assert.equal((await sql(`select awaiting_feedback from exploration_review_gates where owner_id='${owner}' and project_id='${project}';`)).trim(),'t');
 await sql(actor+createReview(id(4011),16));
 const resumeBeforeRevoke=await heldRace(resumeReview(id(4011),17),revokeIntent(id(4011),17));
 assert.deepEqual(resultOf(resumeBeforeRevoke.first),{status:'resumed',intentEpoch:17,reviewEpoch:2});
 assert.equal(resultOf(resumeBeforeRevoke.second).status,'revoked');
 assert.equal(resultOf(await sql(`${actor}select reserve_exploration_plan('${project}','${reviewPiece}','${reviewBatch}','${id(4003)}','${digest}',${proof},'${id(4011)}','${secret}');`)).status,'conflict');
 assert.deepEqual(resultOf(await sql(`${actor}select get_exploration_parallel_review('${project}','${id(4011)}');`)),{status:'resumed',intentEpoch:17,reviewEpoch:2});
 await pauseReview();await sql(actor+createReview(id(4012),18));
 const duplicateResume=await heldRace(resumeReview(id(4012),19),resumeReview(id(4012),19));
 assert.deepEqual(resultOf(duplicateResume.first),{status:'resumed',intentEpoch:19,reviewEpoch:3});
 assert.deepEqual(resultOf(duplicateResume.second),resultOf(duplicateResume.first));
 await pauseReview();assert.deepEqual(resultOf(await sql(actor+resumeReview(id(4012),19))),resultOf(duplicateResume.first));
 assert.equal((await sql(`select awaiting_feedback from exploration_review_gates where owner_id='${owner}' and project_id='${project}';`)).trim(),'t');
 console.log('Parallel review: revoke-before-resume, resume-before-revoke, denied later admission, duplicate resume and later feedback-cycle replay passed.');
 console.log('Revocation epoch: legacy unknown, duplicate revoke, newer intent versus replay, stale CAS, revoke-before-create and create-before-revoke races passed.');
 console.log('Revocable intent: revoke-before-create, create-before-revoke, stale revoke, revoke-before-dispatch and admitted-dispatch-before-revoke races passed.');
 console.log('PostgreSQL 17: planner race, delete race, batch replay race, three concurrent completions and deleted-scope race passed.');
}finally{await sql(`drop database ${database} with (force);`,'postgres');}

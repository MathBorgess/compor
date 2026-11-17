// Local-only: an exclusively task-owned PostgreSQL container, no host port.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {databaseSql} from '../../scripts/quality/fixtures/exploration-parallel-db.mjs';
import {parseVisualInputManifest} from '../../packages/agents-api/src/visual-input-contract.mjs';
import {visualInputDigest} from '../../packages/agents-api/src/visual-input.mjs';
const container=process.env.COMPOR_REFERENCE_PG_CONTAINER;
if(!container?.startsWith('compor-reference-authority-sql-'))throw Error('Use an exclusively task-owned local container.');
const database=`reference_proof_${process.pid}`,id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),project=id(2),session=id(3),consent=id(4),batch=id(5),request=id(6),intent=id(7),secret='12'.repeat(32),proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex'),digest='a'.repeat(64);
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const reference={id:id(20),inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}};
const state={version:1,references:[reference],projectReferenceIds:[reference.id],posts:[]};
const original={sha256:digest,mime:'image/png',byteLength:42};
const manifest=parseVisualInputManifest({version:2,policy:'optimized-v1',externalConsent:true,entries:[{...reference,ordinal:1,role:'reference',original,transport:{...original,width:1,height:1},transformation:'none'}]});
const manifestDigest=visualInputDigest(manifest);
const actor=`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);select set_config('request.jwt.claims',${quote(JSON.stringify({sub:owner,session_id:session,exp:Math.floor(Date.now()/1000)+3600}))},false);`;
function connection(db=database){
 const child=spawn('docker',['--context','colima','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{stdio:['pipe','pipe','pipe']});let output='',error='';const listeners=[];
 child.stdout.on('data',chunk=>{output+=chunk;for(const fn of listeners)fn(output);});child.stderr.on('data',chunk=>{error+=chunk;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(error||`psql ${code}`)));});
 return {child,done,wait:marker=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('barrier timeout')),10000);listeners.push(text=>{if(text.includes(marker)){clearTimeout(timer);resolve();}});done.catch(reject);})};
}
function sql(query,db=database){const c=connection(db);c.child.stdin.end(query);return c.done;}
async function race(first,second){
 const holder=connection();holder.child.stdin.write(`begin;${actor}${first}select 'reference-lock-held';\n`);await holder.wait('reference-lock-held');
 const contender=sql(`${actor}set application_name='reference-authority-contender';${second}`);
 try{let blocked=false;for(let i=0;i<100;i++){if((await sql("select count(*) from pg_stat_activity where application_name='reference-authority-contender' and wait_event='advisory';")).trim()==='1'){blocked=true;break;}await delay(10);}assert.equal(blocked,true,'second connection waits on the same account lock');}
 finally{holder.child.stdin.end('commit;\n');}return {first:await holder.done,second:await contender};
}
const write=(command,revision,value=state)=>`select write_reference_selection('${project}','${id(command)}',${revision},${quote(JSON.stringify(value))}::jsonb);`;
const snapshot=`select create_reference_snapshot('${project}',null,'${request}','${batch}','parallel',1,${quote(JSON.stringify(manifest))},'${consent}','${secret}');`;
const check=`select check_reference_authority('${project}',null,'${request}','${batch}','parallel','${manifestDigest}','${secret}');`;
await sql(`create database ${database};`,'postgres');
try{
 // Roles are cluster-wide; the task-owned container may host a second run.
 const fixture=(await databaseSql()).replace('create role anon; create role authenticated;', ()=>"do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;end$$;");
 await sql(fixture);
 await sql(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt()to authenticated;`);
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql','20261117000037_reference_authority.sql','20261117000038_reference_selection_fence.sql'])await sql(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 await sql(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id)values('${session}','${owner}');insert into projects(id,owner_id)values('${project}','${owner}');`);
 const cas=await race(write(40,0),write(41,0,{version:1,references:[],projectReferenceIds:[],posts:[]}));assert.match(cas.first,/"status": "applied"/);assert.match(cas.second,/"status": "conflict"/);
 await sql(`${actor}select grant_reference_consent('${consent}','${proof}');${snapshot}`);
 const admitted=await race(check,`select revoke_reference_consent('${consent}');`);assert.match(admitted.first,/\nt\n/);assert.match(admitted.second,/"status": "revoked"/);
 assert.match(await sql(actor+check),/\nf\n/);
 // An admitted observation is not a paid effect; a revoked state must fail the
 // actual reservation before any attempt/child can be inserted.
 await sql(`${actor}select reserve_exploration_intent('${project}',null,'${batch}','${intent}',0,'${digest}','${digest}','${proof}','batch',null,null);`);
 const reservation=`select reserve_exploration_plan_authorized('${project}',null,'${batch}','${request}','${digest}','${proof}','${intent}','${secret}','${manifestDigest}','${secret}');`;
 const revoked=await race(`select revoke_reference_consent('${consent}');`,reservation);assert.match(revoked.second,/"status": "conflict"/);
 assert.equal((await sql('select count(*) from exploration_planning_attempts;')).trim(),'0');
 const fenced=await race(`select fence_reference_selection_command('${project}','${id(60)}');`,write(60,1));assert.match(fenced.first,/"status": "fenced"/);assert.match(fenced.second,/"status": "fenced"/);
 assert.equal((await sql(`select revision from reference_selection_mirrors where project_id='${project}';`)).trim(),'1');
 const written=await race(write(61,1),`select fence_reference_selection_command('${project}','${id(61)}');`);assert.match(written.first,/"status": "applied"/);assert.match(written.second,/"status": "applied"/);assert.match(written.second,/"revision": 2/);
 assert.match(await sql(`${actor}select get_reference_selection_command('${project}','${id(60)}');`),/"status": "fenced"/);
 console.log('PASS: fence/write and write/fence serialize on independent connections; delayed writes never override the tombstone.');
 console.log('PASS: independent connections serialized CAS, admission/revoke and revoke/reserve; zero paid-attempt rows after refusal.');
}finally{await sql(`drop database ${database};`,'postgres');}

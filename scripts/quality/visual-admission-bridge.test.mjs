import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {databaseSql} from './fixtures/exploration-parallel-db.mjs';
import {createReferenceAuthorityStore} from '../../apps/web/lib/reference-authority-store.ts';
import {createVisualAuthority} from '../../apps/web/lib/visual-authority.ts';
import {createExplorationPlannerStore} from '../../apps/web/lib/exploration-planner-store.ts';
import {createExplorationBatchStore} from '../../apps/web/lib/exploration-batch-store.ts';
import {createExplorationParallelResumeStore} from '../../apps/web/lib/exploration-parallel-resume-store.ts';
import {createStudioStore} from '../../packages/agents-api/src/studio-chat-store.mjs';
import {createImageToolReservationStore} from '../../packages/agents-api/src/image-tool-reservation.mjs';
import {parseVisualInputManifest} from '../../packages/agents-api/src/visual-input-contract.mjs';

const id=n=>`37000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-token'},projectId=id(2),sessionId=id(3),pieceId=id(4),requestId=id(5),batchId=id(6),intentId=id(7),referenceId=id(8);
const secret='12'.repeat(32),proof=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex'),digest='a'.repeat(64);
const config={app:'https://compor.test',service:'https://synthetic.supabase.test',key:'sb_publishable_synthetic'};
const original={sha256:digest,mime:'image/png',byteLength:42};
const visualInput={version:2,policy:'optimized-v1',externalConsent:false,entries:[{id:referenceId,ordinal:1,role:'reference',inputOrigin:'local-upload',source:null,original,transport:{...original,width:1,height:1},transformation:'none'}]};

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await databaseSql());
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant execute on function auth.jwt() to authenticated;`);
 for(const name of ['20261117000034_exploration_revocable_intents.sql','20261117000035_exploration_revocation_epoch.sql','20261117000036_exploration_parallel_review.sql','20261117000037_reference_authority.sql','20261117000039_authorize_visual_parallel_review.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[actor.userId]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sessionId,actor.userId]);await db.query('insert into projects(id,owner_id)values($1,$2)',[projectId,actor.userId]);await db.query("insert into project_posts(project_id,piece_id,name)values($1,$2,'Fixture')",[projectId,pieceId]);
 const auth=async()=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[actor.userId,JSON.stringify({sub:actor.userId,session_id:sessionId,exp:Math.floor(Date.now()/1000)+3600})]);};await auth();
 const table=new Set(['reserve_exploration_batch_authorized','replace_exploration_slot_authorized','claim_image_tool_execution_authorized']);const calls=[];
 const fetch=async(url,options)=>{assert.equal(options.headers.authorization,`Bearer ${actor.token}`);const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);calls.push(name);assert.match(name,/^[a-z_]+$/);const keys=Object.keys(body);for(const key of keys)assert.match(key,/^p_[a-z_]+$/);const values=keys.map(key=>Array.isArray(body[key])?body[key]:body[key]!==null&&typeof body[key]==='object'?JSON.stringify(body[key]):body[key]);const args=keys.map((key,index)=>`${key}=>$${index+1}`).join(',');const result=await db.query(table.has(name)?`select * from public.${name}(${args})`:`select public.${name}(${args}) as value`,values);return Response.json(table.has(name)?result.rows:result.rows[0].value);};
 const store=createReferenceAuthorityStore(config,fetch),selection={version:1,references:[{id:referenceId,inputOrigin:'local-upload',source:null}],projectReferenceIds:[referenceId],posts:[]};
 assert.equal((await store.write(actor,{projectId,commandId:id(9),expectedRevision:0,state:selection})).status,'applied');
 const makeSnapshot=(conversationId,request,purpose,batch)=>store.snapshot(actor,{projectId,conversationId,requestId:request,batchId:batch,purpose,selectionRevision:1,manifestJson:JSON.stringify(parseVisualInputManifest(visualInput)),consentId:null,consentSecret:null});
 const prepare=createVisualAuthority(config,true,fetch);
 const authority=(conversationId,request,purpose,batch)=>prepare({actor,projectId,conversationId,requestId:request,batchId:batch,purpose,visualInput,consentHeader:null});
 return {db,auth,store,fetch,calls,makeSnapshot,authority};
}

test('adapters reais: snapshot e intenção autorizam plano e lote, alteração da seleção bloqueia recheck',async t=>{
 const f=await fixture(t);assert.equal((await f.makeSnapshot('references',requestId,'parallel',batchId)).status,'created');
 const visualAuthority=await f.authority('references',requestId,'parallel',batchId);assert.ok(visualAuthority);
 await f.db.query("select reserve_exploration_intent($1,null,$2,$3,0,$4,$4,$5,'batch',null,null)",[projectId,batchId,intentId,digest,proof]);
 const resume=createExplorationParallelResumeStore(config,f.fetch),resumeInput={actor,projectId,pieceId:null,batchId,intentId,intentSecret:secret,expectedEpoch:1,visualAuthority};
 await f.db.exec('begin');await f.store.write(actor,{projectId,commandId:id(11),expectedRevision:1,state:{version:1,references:[],projectReferenceIds:[],posts:[]}});
 assert.equal((await resume.resume(resumeInput)).status,'revoked');assert.equal(await resume.get({actor,projectId,intentId}),null);await f.db.exec('rollback');
 assert.equal((await resume.resume(resumeInput)).status,'not_paused');
 const planner=createExplorationPlannerStore(config,f.fetch,{intentId,intentSecret:secret,visualAuthority});
 const scope={actor,projectId,conversationId:'references',batchId,requestId};
 assert.equal((await planner.reserve({...scope,userId:actor.userId,inputDigest:digest,completionDigest:proof})).status,'reserved');
 await planner.bind({...scope,binding:'ep1.fixture.binding',completionSecret:secret});await planner.finish({...scope,state:'completed',completionSecret:secret});
 const batch=createExplorationBatchStore(config,f.fetch),children=[id(20),id(21),id(22)];
 assert.deepEqual(await batch.reserveBatch(actor,{projectId,batchId,pieceId:null,planDigest:digest,intentId,intentSecret:secret,imageIds:children,promptDigests:children.map(()=>digest),rejectionDigests:children.map(()=>proof),visualAuthority}),{state:'running',isNew:true});
 const check={projectId,conversationId:'references',requestId,batchId,purpose:'parallel',manifestDigest:visualAuthority.manifestDigest,consentSecret:null,intentId,intentEpoch:1,intentState:'consumed'};
 assert.equal(await f.store.checkDispatch(actor,check),true);
 assert.equal((await f.store.write(actor,{projectId,commandId:id(10),expectedRevision:1,state:{version:1,references:[],projectReferenceIds:[],posts:[]}})).status,'applied');
 assert.equal(await f.store.checkDispatch(actor,check),false);assert.equal(await f.authority('references',requestId,'parallel',batchId),null);
 assert.ok(f.calls.includes('resume_exploration_parallel_review_authorized'));assert.ok(f.calls.includes('reserve_exploration_plan_authorized'));assert.ok(f.calls.includes('reserve_exploration_batch_authorized'));
});

test('adapters reais: claim visual pertence ao turno e revogação da seleção bloqueia nova execução',async t=>{
 const f=await fixture(t);assert.equal((await f.makeSnapshot(pieceId,requestId,'artwork',null)).status,'created');
 const authority=await f.authority(pieceId,requestId,'artwork',null);assert.ok(authority);
 const studio=createStudioStore({url:config.service,anonKey:config.key,fetch:f.fetch});
 const turn=await studio.reserve({actor,projectId,requestId,inputDigest:digest,visualAuthority:{pieceId,manifestDigest:authority.manifestDigest,consentSecret:null}});assert.equal(turn.status,'reserved');
 await f.db.exec('reset role');await f.db.query("insert into image_tool_reservations(id,owner_id,project_id,piece_id,agent_attempt_id,state)values($1,$2,$3,$4,$5,'reserved')",[id(30),actor.userId,projectId,pieceId,turn.turn.attemptId]);await f.db.query('insert into image_consent_declarations(reservation_id,owner_id)values($1,$2)',[id(30),actor.userId]);await f.auth();
 const images=createImageToolReservationStore({url:config.service,anonKey:config.key,fetch:f.fetch});
 await assert.rejects(()=>images.claimExecution({actor,reservationId:id(30),visualAuthority:{...authority,requestId:id(99)}}));
 assert.equal((await f.store.write(actor,{projectId,commandId:id(10),expectedRevision:1,state:{version:1,references:[],projectReferenceIds:[],posts:[]}})).status,'applied');
 assert.deepEqual(await images.claimExecution({actor,reservationId:id(30),visualAuthority:authority}),{state:'blocked'});
 assert.ok(f.calls.includes('reserve_studio_turn_authorized'));assert.ok(f.calls.includes('claim_image_tool_execution_authorized'));
});

import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,chmod,chown} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {startInfra,FIXTURE_JWT_SECRET} from './infra/stack.mjs';
import {startFixtureService,tokenFor,ACTORS} from './fixture-service.mjs';
import {digestJson,sha256,validateGoal,validateManifest} from './contracts.mjs';
import {evaluate} from './evaluate.mjs';

const root='/workspace',origin='http://127.0.0.1:3000';
const selected=process.argv[2]??'all';
const mode=process.argv[3]??'regression';
const anchor=JSON.parse(await readFile('/evidence/anchor.json','utf8'));
const baked=JSON.parse(await readFile('/workspace/verification-source.json','utf8'));
if(anchor.snapshotDigest!==baked.snapshotDigest||anchor.suiteDigest!==baked.suiteDigest||anchor.trustedSuiteDigest!==baked.suiteDigest)throw Error('snapshot_anchor_mismatch');
for(const entry of baked.entries){if(sha256(await readFile(join(root,entry.path)))!==entry.sha256)throw Error(`source_digest_mismatch:${entry.path}`);}
let infra,fixture,next,activeBudget,effectsStopped=false;
const suiteStart=Date.now(),summary={runId:anchor.runId,profile:'offline',status:'interrupted',goals:[],cleanup:{status:'pending'}};
let idSequence=0;
const newId=()=>{const bytes=createHash('sha256').update(`${anchor.runId}:${++idSequence}`).digest();bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=bytes.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function count(kind){if(effectsStopped)throw Error('budget_exhausted:closed');if(!activeBudget)return;activeBudget.usage[kind]++;if(activeBudget.usage[kind]>activeBudget.limits[kind]){effectsStopped=true;activeBudget.abort.abort();throw Error(`budget_exhausted:${kind}`);}if(Date.now()-activeBudget.started>activeBudget.limits.wallTimeMs){effectsStopped=true;activeBudget.abort.abort();throw Error('budget_exhausted:wallTimeMs');}}
function cookie(actor){const session={access_token:tokenFor(FIXTURE_JWT_SECRET,actor),refresh_token:'synthetic-refresh-not-used',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:actor}};return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;}
async function stopNext(){
  if(!next||next.exitCode!==null||next.signalCode!==null)return;
  process.kill(-next.pid,'SIGTERM');
  await Promise.race([once(next,'exit'),delay(5000)]);
  if(next.exitCode===null&&next.signalCode===null){process.kill(-next.pid,'SIGKILL');await once(next,'exit');}
}
async function rawRequest(actor,path,options={}) {
  if(mode!=='explore')count('actions');count('requests');
  if(!path.startsWith('/api/')||path.includes('://'))throw Error('driver_path_denied');
  const binary=options.body instanceof Uint8Array;
  const headers={Cookie:cookie(actor),Origin:origin,...(options.body&&!binary?{'content-type':'application/json'}:{}),...options.headers};
  return fetch(new URL(path,origin),{method:options.method??'GET',headers,...(options.body!==undefined?{body:binary?options.body:JSON.stringify(options.body)}:{}),signal:AbortSignal.any([AbortSignal.timeout(30000),activeBudget.abort.signal]),redirect:'error'});
}

try {
  const ephemeral=`/tmp/compor-goals-${anchor.runId}`;await mkdir(ephemeral,{recursive:true});
  infra=await startInfra({repoRoot:root,runDir:join(ephemeral,'infra')});
  fixture=await startFixtureService({runDir:join(ephemeral,'fixture'),jwtSecret:FIXTURE_JWT_SECRET,onRequest:()=>count('requests')});
  if(anchor.fault==='omit-persistence')fixture.setFault('omitPersistence');
  let rejectedWithoutCa=false;
  try{await fetch('https://127.0.0.1:3443/health');}catch(error){rejectedWithoutCa=['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(error.cause?.code);}
  if(!rejectedWithoutCa)throw Error('tls_negative_control_failed');
  summary.tlsWithoutCa='rejected';
  const ca='/tmp/compor-verification-ca.pem';await copyFile(fixture.cert,ca);await chmod(ca,0o444);
  await mkdir('/workspace/apps/web/.next',{recursive:true});await chown('/workspace/apps/web/.next',65534,65534);
  await chown('/workspace/apps/web/next-env.d.ts',65534,65534).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const nextLog=createWriteStream('/evidence/next.log');
  const env={PATH:process.env.PATH,HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',NEXT_TELEMETRY_DISABLED:'1',NODE_EXTRA_CA_CERTS:ca,NODE_OPTIONS:'--max-old-space-size=768 --import=/workspace/scripts/verification/provider-transport.mjs',COMPOR_VERIFICATION_RUN_ID:anchor.runId,COMPOR_VERIFICATION_GATEWAY:'https://127.0.0.1:3443',SUPABASE_URL:'https://127.0.0.1:3443',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_verification',SUPABASE_SERVER_KEY:tokenFor(FIXTURE_JWT_SECRET,ACTORS.a,'service_role'),APP_ORIGIN:origin,COMPOR_DEFAULT_OPENAI_ENABLED:'true',COMPOR_PRIVATE_IMAGES_ENABLED:'true',COMPOR_STUDIO_CHAT_ENABLED:'true',COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:Buffer.alloc(32,42).toString('base64url')};
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','3000'],{cwd:join(root,'apps/web'),env,uid:65534,gid:65534,detached:true,stdio:['ignore','pipe','pipe']});
  next.stdout.pipe(nextLog);next.stderr.pipe(nextLog);
  const startup=Date.now();let ready=false;
  while(Date.now()-startup<45000){if(next.exitCode!==null)throw Error('next_start_failed');try{const response=await fetch(`${origin}/api/projects`,{signal:AbortSignal.timeout(1000)});if(response.status===401){ready=true;break;}}catch{}await delay(100);}
  if(!ready)throw Error('next_start_timeout');
  summary.startupMs=Date.now()-suiteStart;
  const query=async sql=>JSON.parse(await infra.sql(`select coalesce(json_agg(verification_row),'[]'::json) from (${sql.replace(/;\s*$/,'')}) verification_row`));
  for(const id of selected==='all'?['G01','G02','G03']:[selected]) {
    const goal=validateGoal(JSON.parse(await readFile(join(root,`scripts/verification/goals/${id}.json`),'utf8')));
    const runDir=join('/evidence',id);await mkdir(runDir);
    const startedAt=new Date().toISOString(),started=Date.now(),httpTrace=[];
    activeBudget={limits:goal.budgets,started,abort:new AbortController(),usage:{actions:0,requests:0,wallTimeMs:0,cycles:1,candidates:1,concurrency:1,modelTokens:null,modelCostUsd:null}};
    let status='completed',result={observations:{},files:[]},failure=null,timer;
    const request=async(actor,path,options)=>{const response=await rawRequest(actor,path,options);const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={unparsed:text.slice(0,300)};}const entry={status:response.status,body};httpTrace.push({actor,path,method:options?.method??'GET',...entry});return entry;};
    const readBytes=async(actor,path)=>{const response=await rawRequest(actor,path);const bytes=Buffer.from(await response.arrayBuffer());httpTrace.push({actor,path,status:response.status,byteLength:bytes.length,sha256:sha256(bytes)});return {status:response.status,bytes};};
    try {
      const ctx={request,readBytes,query,fixture,runDir,newId,origin,actorA:ACTORS.a,actorB:ACTORS.b};
      const operation=mode==='explore'
        ?(await import('./explore.mjs')).serveExploration(ctx,{goal,runId:anchor.runId,onControl:count})
        :(await import(`./scenarios/${id}.mjs`))[`run${id}`](ctx);
      result=await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{effectsStopped=true;activeBudget.abort.abort();reject(Error('budget_exhausted:wallTimeMs'));},goal.budgets.wallTimeMs);})]);
      const errors=result.errors??result.observations.errors;
      if(errors?.length){failure=errors;status=effectsStopped||errors.some(error=>error.message.startsWith('budget_exhausted'))?'exhausted':'interrupted';}
    }catch(error){failure=error.stack??error.message;status=error.message.startsWith('budget_exhausted:')?'exhausted':'interrupted';}
    finally{clearTimeout(timer);}
    activeBudget.usage.wallTimeMs=Date.now()-started;
    await save(join(runDir,'observations.json'),result.observations);
    await save(join(runDir,'http-trace.json'),httpTrace);
    if(failure)await save(join(runDir,'failure.json'),failure);
    const artifacts=[{id:'observations',kind:'observations',path:'observations.json',sha256:sha256(await readFile(join(runDir,'observations.json')))}];
    for(const file of result.files??[])artifacts.push({...file,kind:'file',sha256:sha256(await readFile(join(runDir,file.path)))});
    const manifest=validateManifest({schemaVersion:'run/v1',runId:`${anchor.runId}-${id}`,goalId:goal.id,goalRevision:goal.revision,goalDigest:digestJson(goal),suiteDigest:anchor.suiteDigest,appRevision:anchor.appRevision,snapshotDigest:anchor.snapshotDigest,profile:'offline',status,budgets:goal.budgets,usage:activeBudget.usage,startedAt,endedAt:new Date().toISOString(),artifacts});
    await save(join(runDir,'manifest.json'),manifest);
    const report=await evaluate(runDir,{goal,expectedGoalDigest:digestJson(goal),expectedSuiteDigest:anchor.suiteDigest,expectedAppRevision:anchor.appRevision,expectedSnapshotDigest:anchor.snapshotDigest,expectedRunId:manifest.runId});
    await save(join(runDir,'evaluation.json'),report);
    summary.goals.push({id,status:report.status,passed:report.passed,durationMs:manifest.usage.wallTimeMs,failure:failure?true:false});
    console.log(JSON.stringify(summary.goals.at(-1)));
    activeBudget=null;
    if(status!=='completed'||effectsStopped)break;
  }
  summary.status=summary.goals.length===(selected==='all'?3:1)&&summary.goals.every(goal=>goal.passed)?'passed':'failed';
} catch(error){summary.error=error.stack??error.message;console.error(error.message);}
finally {
  effectsStopped=true;
  activeBudget?.abort.abort();
  activeBudget=null;
  const failures=[];
  try{await stopNext();}catch(error){failures.push(`next:${error.message}`);}
  try{await fixture?.close();}catch(error){failures.push(`fixture:${error.message}`);}
  try{if(infra){await infra.close();await mkdir('/evidence/infra',{recursive:true});for(const name of ['infra-manifest.json','infra-preflight.json','infra-stop.json'])await copyFile(`/tmp/compor-goals-${anchor.runId}/infra/${name}`,`/evidence/infra/${name}`);}}catch(error){failures.push(`infra:${error.message}`);}
  summary.cleanup={status:failures.length?'failed':'completed',failures};
  summary.totalMs=Date.now()-suiteStart;
  for(const [key,path]of [['containerMemoryPeakBytes','/sys/fs/cgroup/memory.peak'],['containerCpuStat','/sys/fs/cgroup/cpu.stat']])summary[key]=await readFile(path,'utf8').then(value=>value.trim()).catch(()=>null);
  await save('/evidence/summary.json',summary);
  console.log(JSON.stringify({status:summary.status,cleanup:summary.cleanup.status,totalMs:summary.totalMs}));
  if(summary.status!=='passed'||failures.length)process.exitCode=1;
}

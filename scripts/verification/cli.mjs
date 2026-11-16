#!/usr/bin/env node
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {digestJson,validateGoal} from './contracts.mjs';
import {freezeSuite,trustedSuite} from './trust.mjs';
import {controlCommand} from './control-cli.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=join(root,'quality-results/verification');
const context=process.env.COMPOR_DOCKER_CONTEXT??(process.platform==='darwin'?'colima':'default');
const dockerArgs=['--context',context];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowed=/^(?:package(?:-lock)?\.json$|apps\/web\/|packages\/|supabase\/(?:migrations|tests)\/|scripts\/verification\/)/;
async function sources(destination) {
  const list=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root}).toString().split('\0').filter(Boolean);
  const entries=[];
  const canonicalRoot=await realpath(root);
  for(const path of [...new Set(list)].sort()){
    if(!allowed.test(path)||/(?:^|\/)(?:node_modules|\.next|\.git)(?:\/|$)/.test(path)||/(?:^|\/)\.env(?:\.|$)/.test(path)||/\.tsbuildinfo$/.test(path))continue;
    const sourcePath=join(root,path),stat=await lstat(sourcePath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)continue;
    if(!stat.isFile()||stat.isSymbolicLink()||await realpath(sourcePath)!==join(canonicalRoot,path))throw Error(`snapshot_source_not_regular:${path}`);
    const bytes=await readFile(join(root,path));entries.push({path,sha256:digest(bytes)});
    if(destination){const target=join(destination,path);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,path),target);}
  }
  return {entries,snapshotDigest:digestJson(entries),suiteDigest:digestJson(entries.filter(entry=>entry.path.startsWith('scripts/verification/'))),appRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim()};
}
function run(command,args,options={}) {
  return new Promise((res,rej)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',...options});child.once('error',rej);child.once('exit',(code,signal)=>code===0?res():rej(Error(`${command} failed (${code??signal})`)));});
}
async function prepared(){return JSON.parse(await readFile(join(output,'prepared.json'),'utf8'));}

async function main() {
  let [command='doctor',goal='all',...extra]=process.argv.slice(2);
  let replayAnchor;
  await mkdir(output,{recursive:true});
  if(command==='freeze-suite'){console.log(JSON.stringify(await freezeSuite(root,await sources())));return;}
  if(['inspect','act','close','evaluate','negative-controls'].includes(command)){await controlCommand(command,goal,extra,{root,output,dockerArgs,sources});return;}
  if(command==='replay'){
    if(!/^[a-f0-9-]{36}$/.test(goal)||extra.length)throw Error('usage: replay RUN_ID');
    replayAnchor=JSON.parse(await readFile(join(output,goal,'anchor.json'),'utf8'));
    if(replayAnchor.runId!==goal||replayAnchor.mode!=='regression')throw Error('only_regression_replay_supported');
    command='run';goal=replayAnchor.selected;extra=replayAnchor.fault?['--negative-persistence']:[];
  }
  if(command==='prepare') {
    const directory=await mkdtemp(join(output,'source-'));
    const source=await sources(directory);
    await trustedSuite(root,source);
    await writeFile(join(directory,'verification-source.json'),JSON.stringify(source,null,2)+'\n');
    const started=Date.now();
    await run('docker',[...dockerArgs,'build','-t','compor-verification:issue51','-f',join(directory,'scripts/verification/infra/Dockerfile'),directory]);
    const imageId=execFileSync('docker',[...dockerArgs,'image','inspect','compor-verification:issue51','--format','{{.Id}}']).toString().trim();
    const result={...source,imageId,dockerContext:context,preparedAt:new Date().toISOString(),preparationMs:Date.now()-started,directory};
    await writeFile(join(output,'prepared.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:'prepared',imageId,snapshotDigest:source.snapshotDigest,preparationMs:result.preparationMs}));return;
  }
  if(command==='doctor') {
    const source=await sources(),image=await prepared();
    await trustedSuite(root,source);
    execFileSync('docker',[...dockerArgs,'image','inspect',image.imageId],{stdio:'ignore'});
    console.log(JSON.stringify({status:source.snapshotDigest===image.snapshotDigest?'ready':'source_changed',dockerContext:context,imageId:image.imageId,snapshotDigest:source.snapshotDigest,preparedSnapshotDigest:image.snapshotDigest}));
    if(source.snapshotDigest!==image.snapshotDigest)process.exitCode=1;return;
  }
  if(command==='list-goals') {
    for(const id of ['G01','G02','G03']){const item=validateGoal(JSON.parse(await readFile(new URL(`./goals/${id}.json`,import.meta.url),'utf8')));console.log(JSON.stringify({id,objective:item.objective,budgets:item.budgets,goalDigest:digestJson(item),criteria:item.criteria.map(criterion=>criterion.id),read:`show-goal ${id}`}));}return;
  }
  if(command==='show-goal'){
    if(!['G01','G02','G03'].includes(goal)||extra.length)throw Error('usage: show-goal G01|G02|G03');
    const contract=validateGoal(JSON.parse(await readFile(new URL(`./goals/${goal}.json`,import.meta.url),'utf8')));
    console.log(JSON.stringify({goal:contract,goalDigest:digestJson(contract)}));return;
  }
  if(command==='run'||command==='open') {
    const exploring=command==='open';
    const fault=extra[0]==='--negative-persistence'?'omit-persistence':null;
    if(!['all','G01','G02','G03'].includes(goal)||extra.length>(fault?1:0)||fault&&goal!=='G01'||exploring&&(goal!=='G01'||fault))throw Error('usage: run [all|G01|G02|G03] [--negative-persistence for G01], or open G01');
    const current=await sources(),source=replayAnchor??current,image=replayAnchor??await prepared();
    const trust=await trustedSuite(root,current);
    if(source.suiteDigest!==trust.suiteDigest)throw Error('replay_suite_changed');
    if(source.snapshotDigest!==image.snapshotDigest)throw Error('source_changed: run prepare before evaluating this snapshot');
    const runId=randomUUID(),runDir=join(output,runId);await mkdir(runDir);
    const anchor={...source,runId,imageId:image.imageId,profile:'offline',trustedSuiteDigest:trust.suiteDigest,selected:goal,mode:exploring?'explore':'regression',fault,...(replayAnchor?{parentRunId:replayAnchor.runId}:{})};
    await writeFile(join(runDir,'anchor.json'),JSON.stringify(anchor,null,2)+'\n');
    try {
      await run('docker',[...dockerArgs,'run',...(exploring?['--detach']:[]),'--rm','--init','--name',`compor-goals-${runId}`,'--network','none','--cpus','2','--memory','1750m','--pids-limit','512','--security-opt','no-new-privileges','--mount',`type=bind,source=${runDir},target=/evidence`,image.imageId,'timeout','--signal=TERM','--kill-after=10s',goal==='all'?'660s':'300s','node','--import','/workspace/apps/web/node_modules/tsx/dist/loader.mjs','scripts/verification/inside.mjs',goal,anchor.mode]);
      if(exploring){
        const deadline=Date.now()+60000;
        while(Date.now()<deadline){
          const ready=await readFile(join(runDir,goal,'control-ready.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
          if(ready){console.log(JSON.stringify({status:'ready',...ready}));return;}
          const failed=await readFile(join(runDir,'summary.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
          if(failed)throw Error(`exploration_start_failed:${failed.error??failed.status}`);
          await new Promise(resolve=>setTimeout(resolve,200));
        }
        throw Error('exploration_start_timeout: inspect the recorded run; watchdog will close it');
      }
    } finally {console.log(JSON.stringify({runId,evidence:runDir}));}
    return;
  }
  throw Error('commands: freeze-suite, prepare, doctor, list-goals, show-goal, run, replay, open, inspect, act, close, evaluate, negative-controls');
}
main().catch(error=>{console.error(JSON.stringify({status:'error',error:error.message}));process.exitCode=1;});

import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {digestJson} from './contracts.mjs';
import {evaluate} from './evaluate.mjs';
import {trustedSuite} from './trust.mjs';
import {captureNegativeControls} from './negative-controls.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export async function controlCommand(command,runId,extra,{root,output,dockerArgs,sources}){
  if(!uuid.test(runId))throw Error('invalid_run_id');
  const runDir=join(output,runId),anchor=JSON.parse(await readFile(join(runDir,'anchor.json'),'utf8'));
  if(anchor.runId!==runId)throw Error('run_scope_mismatch');
  if(command==='negative-controls'){
    const source=await sources();await trustedSuite(root,source);
    if(source.suiteDigest!==anchor.suiteDigest)throw Error('suite_changed');
    const goal=JSON.parse(await readFile(join(root,'scripts/verification/goals/G01.json'),'utf8'));
    console.log(JSON.stringify(await captureNegativeControls(join(runDir,'G01'),{goal,anchors:{expectedGoalDigest:digestJson(goal),expectedSuiteDigest:anchor.suiteDigest,expectedAppRevision:anchor.appRevision,expectedSnapshotDigest:anchor.snapshotDigest,expectedRunId:`${runId}-G01`}})));return;
  }
  if(command==='evaluate'){
    const source=await sources();await trustedSuite(root,source);
    if(source.suiteDigest!==anchor.suiteDigest)throw Error('suite_changed: use the trusted baseline for this run');
    const summary=JSON.parse(await readFile(join(runDir,'summary.json'),'utf8'));
    const expectedIds=anchor.selected==='all'?['G01','G02','G03']:[anchor.selected];
    if(!expectedIds.every(id=>['G01','G02','G03'].includes(id))||JSON.stringify(summary.goals.map(item=>item.id))!==JSON.stringify(expectedIds))throw Error('required_scenario_missing');
    if(summary.cleanup?.status!=='completed')throw Error('cleanup_not_completed');
    const reports=[];
    for(const id of expectedIds){
      if(!['G01','G02','G03'].includes(id))throw Error('unexpected_goal');
      const goal=JSON.parse(await readFile(join(root,`scripts/verification/goals/${id}.json`),'utf8'));
      reports.push(await evaluate(join(runDir,id),{goal,expectedGoalDigest:digestJson(goal),expectedSuiteDigest:anchor.suiteDigest,expectedAppRevision:anchor.appRevision,expectedSnapshotDigest:anchor.snapshotDigest,expectedRunId:`${runId}-${id}`}));
    }
    console.log(JSON.stringify({runId,reports}));
    if(!reports.length||reports.some(report=>!report.passed))process.exitCode=1;
    return;
  }
  if(command==='inspect'){
    const summary=await readFile(join(runDir,'summary.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(summary){console.log(JSON.stringify(summary));return;}
  }
  const request=command==='act'?JSON.parse(extra[0]??'null'):{action:command};
  if(!request||typeof request!=='object'||Array.isArray(request)||extra.length>(command==='act'?1:0))throw Error('invalid_control_request');
  if(request.runId&&request.runId!==runId)throw Error('run_scope_mismatch');
  const args=[...dockerArgs,'exec',`compor-goals-${runId}`,'node','scripts/verification/client-control.mjs',JSON.stringify({...request,runId})];
  let reply;
  try{reply=execFileSync('docker',args,{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']});}
  catch(error){
    // Rejections carry revision/retry information on stdout. Never echo argv.
    try{const value=JSON.parse(String(error.stdout));if(!Number.isInteger(value.status)||!value.body)throw Error('invalid_control_response',{cause:error});reply=JSON.stringify(value);process.exitCode=1;}
    catch{throw Error('control_transport_failed: result unknown; inspect before any new effect');}
  }
  console.log(reply.trim());
}

import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {parseCandidateOutput} from '../planner/candidate.mjs';
import {judgeDivergence,labelRows,read,save,seed} from './group.mjs';
import {judgeTriage} from './triage.mjs';

function failure(record) {
  if(record.plan)return null;
  const evidence=[];
  const raw=record.raw;
  const plan=raw?.plan??raw;
  if(!raw)evidence.push('Não houve JSON de saída recuperável.');
  else {
    if(!Array.isArray(plan.items)||plan.items.length!==3)evidence.push('O agente não retornou três itens de plano.');
    else for(const field of ['creativePrompt','composition','contrast']) {
      const values=plan.items.map(item=>typeof item?.[field]==='string'?item[field].trim().toLowerCase():'');
      if(values.includes(''))evidence.push('Campo ausente ou vazio: '+field);
      else if(new Set(values).size!==values.length)evidence.push('Valores repetidos em '+field);
    }
    if(!Array.isArray(plan?.referenceIds))evidence.push('A seleção de IDs não foi registrada no plano.');
    if(raw?.plan&&!Array.isArray(raw.referenceReadings))evidence.push('As leituras individuais estão ausentes.');
  }
  return {state:record.state,evidence:evidence.length?evidence:['A estrutura, a seleção ou as leituras foram recusadas pelo contrato.']};
}
function readRows(roundDir,arm) {
  return cases.map(c=>{
    const dir=join(roundDir,c.id,arm);
    const path=join(dir,'plan.json');
    if(!existsSync(path))throw Error('plan_missing: '+path);
    const record=read(path);
    const p=packet(c.id,arm),plan=record.plan??null;
    if(plan&&!validateCompletedExplorationPlan(plan,p.context,p.visualInput))throw Error('stored_plan_not_validated: '+path);
    if(plan&&record.referenceReadings!=null) {
      const raw={plan:{version:plan.version,referenceIds:plan.referenceIds,
        items:plan.items.map(({prompt,...item})=>item)},referenceReadings:record.referenceReadings};
      if(!parseCandidateOutput(raw,p.context,p.visualInput))throw Error('stored_readings_not_validated');
    }
    return {id:c.id,split:c.split,dir,arm,plan,readings:record.referenceReadings??null,
      context:p.context,packet:p,invalid:failure(record)};
  });
}

function totals(rows) {
  const all=rows.flatMap(row=>row.triage.references);
  const scores=Object.fromEntries(['intent','characteristic','use'].map(key=>{
    const graded=all.map(r=>r[key]).filter(x=>x!==null);
    return [key,{points:graded.reduce((a,b)=>a+b,0),graded:graded.length,unknown:all.length-graded.length}];
  }));
  return {plansObserved:rows.filter(row=>row.triage.available).length,plannedCases:rows.length,
    gatesAdmitted:rows.filter(row=>row.gate.decision==='admit').length,referenceDecisionsCorrect:all.filter(ref=>ref.correct).length,
    referencesWithPlan:all.length,referencesExpected:rows.reduce((n,r)=>n+r.referenceCount,0),scores};
}

export function runRound(root,round,prepare=false) {
  const roundDir=join(resolve(root),'round-'+round),privateDir=join(roundDir,'plan-panel-private');
  const random=seed(privateDir);
  const groups=['with','without'].map(arm=>{
    const key=random+'/'+arm;
    return {arm,rows:labelRows(readRows(roundDir,arm),key),
      divergenceDir:join(privateDir,arm,'divergence'),triageDir:join(privateDir,arm,'triage')};
  });
  const all=[];
  for(const g of groups) {
    const result=judgeDivergence(g.divergenceDir,g.rows,prepare);
    if(!prepare)for(const row of g.rows) {
      row.gate=result.get(row.id);
      save(join(row.dir,'review.json'),{...row.gate,critique:row.gate.critique??null,subject:row.gate.subject??null});
    }
  }
  for(const g of groups) {
    const relabeled=labelRows(g.rows,random+'/triage/'+g.arm);
    const result=judgeTriage(g.triageDir,relabeled,prepare);
    if(!prepare)for(const row of relabeled) {
      const triage=result.get(row.id);
      save(join(row.dir,'triage-judgment.json'),triage);
      all.push({caseId:row.id,arm:row.arm,split:row.split,referenceCount:row.packet.visualInput.entries.length,
        gate:{decision:row.gate.decision,reason:row.gate.reason??null,details:row.gate.details??null},triage,invalid:row.invalid});
    }
  }
  if(prepare)return {prepared:groups.length*2};
  for(const split of ['dev','holdout']) {
    const rows=all.filter(row=>row.split===split);
    const dst=split==='dev'?join(roundDir,'plan-feedback-dev.json'):join(privateDir,'plan-feedback-holdout.json');
    save(dst,{round,split,groups:Object.fromEntries(groups.map(g=>[g.arm,totals(rows.filter(row=>row.arm===g.arm))])),cases:rows});
  }
  return {reviewed:all.length,developmentFeedback:join(roundDir,'plan-feedback-dev.json')};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [root,round,flag,...extra]=process.argv.slice(2);
  if(!root||!/^\d+$/.test(round)||extra.length||flag&&flag!=='--prepare')throw Error('Uso: node round.mjs DIR R [--prepare]');
  console.log(JSON.stringify(runRound(root,round,flag==='--prepare')));
}

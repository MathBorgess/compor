import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cases,packet} from '../dataset/packets.mjs';
import {judgeDivergence,labelRows,order,read,save,seed} from './group.mjs';

export function runControls(root,prepare=false) {
  const base=join(resolve(root),'plan-controls-private');
  const random=seed(base);
  const controls=read(fileURLToPath(new URL('../dataset/contrasts.json',import.meta.url)));
  const columns=cases.map(c=>order(controls.filter(row=>row.caseId===c.id),random+'/'+c.id));
  if(columns.some(col=>col.length!==3)||controls.length!==15||columns.length!==5)throw Error('unexpected_control_dataset');
  const results=[];
  for(let n=0;n<3;n++) {
    // One control per briefing, mixing duplicate, eligible and off-direction examples across panels.
    const batch=columns.map(col=>col[n]).map(row=>({id:row.id,context:packet(row.caseId,'with').context,plan:{items:row.items},source:row}));
    const rows=labelRows(batch,random+'/panel/'+n);
    const outcomes=judgeDivergence(join(base,'panel-'+n),rows,prepare);
    if(prepare)continue;
    for(const row of rows) {
      const decision=outcomes.get(row.id);
      const wanted=row.source;
      const judged=decision.reason==='literal_duplicate'||decision.reason==='insufficient_divergence'||
        decision.reason==='direction'||decision.decision==='admit';
      const correctDecision=judged&&decision.decision===(wanted.expected==='accept'?'admit':'hold');
      const correctDiagnosis=correctDecision&&(!wanted.duplicatePair||
        JSON.stringify([decision.details?.left,decision.details?.right])===JSON.stringify(wanted.duplicatePair))&&
        (!wanted.driftPosition||decision.details?.position===wanted.driftPosition);
      results.push({id:row.id,split:wanted.split,expected:wanted.expected,decision:decision.decision,reason:decision.reason??null,
        correctDecision,correctDiagnosis,judged,details:decision.details??null});
    }
  }
  if(prepare)return {prepared:3,controls:15};
  for(const split of ['dev','holdout']) {
    const rows=results.filter(row=>row.split===split);
    const score={assessed:rows.filter(r=>r.judged).length,correct:rows.filter(r=>r.correctDecision).length,
      correctDiagnosis:rows.filter(r=>r.correctDiagnosis).length,total:rows.length,rows};
    const target=split==='dev'?join(resolve(root),'plan-controls-dev.json'):join(base,'holdout-results.json');
    save(target,score);
  }
  return {assessed:results.length,development:join(resolve(root),'plan-controls-dev.json')};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [root,flag,...extra]=process.argv.slice(2);
  if(!root||extra.length||flag&&flag!=='--prepare')throw Error('Uso: node controls.mjs DIR [--prepare]');
  console.log(JSON.stringify(runControls(root,flag==='--prepare')));
}

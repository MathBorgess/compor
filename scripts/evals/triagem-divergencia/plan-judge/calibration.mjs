import {spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {packet} from '../dataset/packets.mjs';
import {assessDivergence,buildDivergenceReview} from '../planner/candidate.mjs';
import {hash,judgeDivergence,labelRows,order,read,seed} from './group.mjs';

const script=fileURLToPath(import.meta.url);
const controls=read(fileURLToPath(new URL('../dataset/contrasts.json',import.meta.url)));
const baseline='';
function freeze(file,value) {
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const json=JSON.stringify(value,null,2)+'\n';
  try {writeFileSync(file,json,{flag:'wx',mode:0o600});}
  catch(error) {if(error.code!=='EEXIST'||readFileSync(file,'utf8')!==json)throw error;}
  return hash(json);
}
const sha=file=>hash(readFileSync(file));
const refined=(root,n)=>join(root,'r'+n,'revision.json');
const summary=(root,n,split='dev')=>join(root,'r'+n,split+'-score.json');

function protocol(root) {
  const sample=controls[0], ctx=packet(sample.caseId,'with').context;
  const rubric=buildDivergenceReview(ctx,{items:sample.items}).instructions;
  const definitions={version:1,rounds:5,model:'gpt-6.2-astra',effort:'medium',panels:3,devCount:9,heldCount:6,
    fixtureSha256:hash(JSON.stringify(controls)),
    inputHash:hash(JSON.stringify(controls.map(row=>buildDivergenceReview(packet(row.caseId,'with').context,{items:row.items}).subject))),
    criticSha256:hash(rubric),
    gateModuleSha256:sha(fileURLToPath(new URL('../planner/candidate.mjs',import.meta.url))),
    admission:'Preserve the frozen direction, literal evidence and distinct mechanism and structure in all three pairs.',
    primary:'Number of correct admit/hold decisions, false accepts, false holds, abstentions and localized diagnoses.',
    selection:'Five sequential revisions use development results, then compare revision five with a fresh original-critic repeat on the six sealed controls.'};
  return freeze(join(root,'protocol.json'),definitions);
}
function describe(gold,verdict) {
  const judged=verdict.decision==='admit'||['literal_duplicate','insufficient_divergence','direction'].includes(verdict.reason);
  const correct=judged&&((verdict.decision==='admit')===(gold.expected==='accept'));
  const diagnosed=correct&&(!gold.duplicatePair||JSON.stringify([verdict.details?.left,verdict.details?.right])===JSON.stringify(gold.duplicatePair))&&
    (!gold.driftPosition||verdict.details?.position===gold.driftPosition);
  return {id:gold.id,expected:gold.expected,expectedPair:gold.duplicatePair,expectedDrift:gold.driftPosition,
    decision:verdict.decision,reason:verdict.reason??null,details:verdict.details??null,judged,correct,diagnosed,
    pairRationales:verdict.critique?.pairs.map(p=>({left:p.left,right:p.right,contrast:p.contrast,structure:p.structure,choice:p.choice}))??[]};
}
function summarize(rows) {
  const count=test=>rows.filter(test).length;
  return {n:rows.length,judged:count(r=>r.judged),correct:count(r=>r.correct),diagnosed:count(r=>r.diagnosed),
    falseAccepts:count(r=>r.judged&&!r.correct&&r.expected==='reject'),falseHolds:count(r=>r.judged&&!r.correct&&r.expected==='accept'),
    abstentions:count(r=>!r.judged),expectedAccept:count(r=>r.expected==='accept'),expectedReject:count(r=>r.expected==='reject')};
}

function original(root,source,split='dev') {
  // Only inspect individual assessments that bind to one of the requested split's subjects.
  const wanted=new Map(controls.filter(c=>c.split===split).map(gold=>{
    const context=packet(gold.caseId,'with').context,plan={items:gold.items};
    return [buildDivergenceReview(context,plan).subject,{gold,context,plan}];
  }));
  const evidence=[],rows=[];
  for(let i=0;i<3;i++) {
    const dir=join(source,'plan-controls-private','panel-'+i);
    const answer=join(dir,'answer.json'),receipt=read(join(dir,'receipt.json'));
    if(receipt.answerSha256!==sha(answer)||receipt.packetSha256!==readFileSync(join(dir,'packet-sha256.txt'),'utf8').trim()||
        !receipt.thread||receipt.model!=='gpt-6.2-astra'||receipt.effort!=='medium')throw Error('original_receipt_changed');
    evidence.push({thread:receipt.thread,answerSha256:receipt.answerSha256,packetSha256:receipt.packetSha256});
    for(const {assessment} of read(answer).cases){
      const entry=wanted.get(assessment.subject);
      if(!entry)continue;
      const {gold,context,plan}=entry;
      rows.push(describe(gold,{...assessDivergence(context,plan,assessment),critique:assessment}));
      wanted.delete(assessment.subject);
    }
  }
  if(wanted.size)throw Error('original_evidence_missing');
  rows.sort((a,b)=>a.id.localeCompare(b.id));
  const data={round:0,split,metrics:summarize(rows),receipts:evidence,rows};
  const prior=read(split==='dev'?join(source,'plan-controls-dev.json'):join(source,'plan-controls-private','holdout-results.json'));
  if(prior.correct!==data.metrics.correct||prior.correctDiagnosis!==data.metrics.diagnosed||prior.total!==rows.length)throw Error('original_summary_mismatch');
  freeze(summary(root,0,split),data);
}

function checkChain(root,n){
  const p=protocol(root);
  let cumulative=baseline;
  for(let i=1;i<=n;i++){
    const revision=read(refined(root,i));
    if(revision.round!==i||revision.protocol!==p||revision.feedbackSha256!==sha(summary(root,i-1))||
       revision.previousRevisionSha256!==(i===1?null:sha(refined(root,i-1))))throw Error('revision_evidence_changed');
    cumulative=revision.interpretation;
  }
  return cumulative;
}
function freezeRevision(root,n,proposalPath) {
  const previous=checkChain(root,n-1), prior=summary(root,n-1), proposal=read(proposalPath);
  if(Object.keys(proposal).sort().join()!=='addition,developmentIds,hypothesis,prediction'||
    !['hypothesis','addition','prediction'].every(key=>typeof proposal[key]==='string'&&proposal[key].trim())||
    !Array.isArray(proposal.developmentIds)||proposal.developmentIds.length===0||
    proposal.developmentIds.some(id=>!controls.some(c=>c.id===id&&c.split==='dev')))throw Error('invalid_proposal');
  const interpretation=[previous,proposal.addition].filter(Boolean).join('\n');
  return freeze(refined(root,n),{round:n,protocol:protocol(root),feedbackSha256:sha(prior),
    previousRevisionSha256:n===1?null:sha(refined(root,n-1)),...proposal,interpretation});
}

function grouped(root,split) {
  const random=seed(join(root,'private'));
  const sample=controls.filter(row=>row.split===split);
  if(split==='dev'){
    const cases=[...new Set(sample.map(r=>r.caseId))];
    const columns=cases.map(id=>order(sample.filter(r=>r.caseId===id),random+'/mix/'+id));
    return [0,1,2].map(i=>columns.map(col=>col[i]));
  }
  const byCase=[...new Set(sample.map(r=>r.caseId))].map(id=>order(sample.filter(r=>r.caseId===id),random+'/mix/'+id));
  const [a,b]=byCase;
  return [[a[0],b[0],a[1]],[b[1],a[2],b[2]]];
}
const panelDir=(root,n,split,i)=>join(root,'r'+n,split+'-panel-'+i);
const splitWhere=key=>key==='holdout-repeat'?'holdout':key;
function reviewPanel(root,n,key,i) {
  const split=splitWhere(key);
  if(split==='holdout'&&!existsSync(summary(root,5)))throw Error('holdout_sealed');
  const instructions=key==='holdout-repeat'?baseline:checkChain(root,n);
  const group=grouped(root,split)[i];
  const rows=labelRows(group.map(source=>({id:source.id,context:packet(source.caseId,'with').context,plan:{items:source.items},source})),
    seed(join(root,'private'))+'/labels/'+key+'/'+n+'/'+i);
  const dir=panelDir(root,n,key,i);
  const verdicts=judgeDivergence(dir,rows,false,instructions);
  const receipt=read(join(dir,'receipt.json'));
  freeze(join(dir,'scored.json'),{receipt,rows:rows.map(row=>describe(row.source,verdicts.get(row.id)))});
}

async function panels(root,n,key) {
  const groups=grouped(root,splitWhere(key));
  const results=await Promise.allSettled(groups.map((_,i)=>new Promise((ok,fail)=>{
    const child=spawn(process.execPath,[script,'panel',root,String(n),key,String(i)],{stdio:'inherit'});
    child.on('error',fail);
    child.on('exit',code=>code===0?ok():fail(Error('panel_failed: '+i+' code='+code)));
  })));
  const failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  const scored=groups.map((_,i)=>read(join(panelDir(root,n,key,i),'scored.json')));
  const rows=scored.flatMap(s=>s.rows).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(rows.map(r=>r.id)).size!==controls.filter(c=>c.split===splitWhere(key)).length)throw Error('coverage_changed');
  const metrics=summarize(rows);
  freeze(summary(root,n,key),{round:n,split:key,metrics,receipts:scored.map(p=>p.receipt),rows});
  console.log(JSON.stringify({round:n,split:key,metrics}));
}
function audit(root,source) {
  checkChain(root,5);
  for(const split of ['dev','holdout']) {
    if(!existsSync(summary(root,0,split)))throw Error('baseline_missing');
    original(root,source,split);
  }
  const series=[];
  for(const [n,key] of [[1,'dev'],[2,'dev'],[3,'dev'],[4,'dev'],[5,'dev'],[5,'holdout-repeat'],[5,'holdout']]) {
    const saved=read(summary(root,n,key)),groups=grouped(root,splitWhere(key));
    for(let i=0;i<groups.length;i++) {
      const dir=panelDir(root,n,key,i);
      if(!existsSync(join(dir,'scored.json'))||!existsSync(join(dir,'receipt.json')))throw Error('review_evidence_missing');
      // An existing receipt is mandatory during an audit; runGroup only rechecks the sealed response.
      reviewPanel(root,n,key,i);
    }
    const scored=groups.map((_,i)=>read(join(panelDir(root,n,key,i),'scored.json')));
    const rows=scored.flatMap(panel=>panel.rows).sort((a,b)=>a.id.localeCompare(b.id));
    if(JSON.stringify(rows)!==JSON.stringify(saved.rows)||JSON.stringify(summarize(rows))!==JSON.stringify(saved.metrics)||
        JSON.stringify(scored.map(panel=>panel.receipt))!==JSON.stringify(saved.receipts))throw Error('score_evidence_mismatch');
    series.push({round:n,split:key,...saved.metrics,scoreSha256:sha(summary(root,n,key)),
      revisionSha256:sha(refined(root,n)),feedbackSha256:read(refined(root,n)).feedbackSha256,
      responses:scored.map(s=>({packet:s.receipt.packetSha256,response:s.receipt.answerSha256}))});
  }
  const baselineScores=['dev','holdout'].map(key=>({split:key,...read(summary(root,0,key)).metrics,scoreSha256:sha(summary(root,0,key))}));
  const manifest={protocolSha256:sha(join(root,'protocol.json')),baselineScores,series,
    sessions:series.reduce((count,row)=>count+row.responses.length,0)};
  freeze(join(root,'audit.json'),manifest);
  console.log(JSON.stringify({verifiedSessions:manifest.sessions,rounds:5,publicSummary:join(root,'audit.json')}));
}
async function main(args) {
  const [cmd,dest,...rest]=args,root=resolve(dest);
  if(cmd==='audit')return audit(root,resolve(rest[0]));
  if(cmd==='init') {protocol(root);original(root,resolve(rest[0]));return;}
  const n=Number(rest[0]);
  if(!Number.isInteger(n)||n<1||n>5)throw Error('expected_round_1_to_5');
  if(cmd==='panel')return reviewPanel(root,n,rest[1],Number(rest[2]));
  if(cmd==='dev') {freezeRevision(root,n,resolve(rest[1]));await panels(root,n,'dev');return;}
  if(cmd==='final') {
    if(n!==5||!existsSync(summary(root,5)))throw Error('holdout_sealed');
    checkChain(root,5);
    await panels(root,5,'holdout-repeat');
    await panels(root,5,'holdout');
    original(root,resolve(rest[1]),'holdout');
    return;
  }
  throw Error('unknown_command');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main(process.argv.slice(2));

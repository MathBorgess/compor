import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {cases,packet} from '../dataset/packets.mjs';
import {verifyContextualRoundReview} from '../plan-judge/contextual-round.mjs';
import {assessDivergence} from '../planner/candidate.mjs';
import {digest,fingerprint} from '../runner/ledger.mjs';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {buildContextualReport} from './contextual-report.mjs';
import {aggregateCosts} from './provider-usage.mjs';
import {verifyFixedAdmission} from '../fixed-control/guard.mjs';

const arms=['with','without'], dimensions=['intent','characteristic','use'];
const read=file=>JSON.parse(readFileSync(file));
const present=file=>existsSync(file)?read(file):null;
const range=(low,high)=>({low,high});
const sum=values=>values.reduce((a,b)=>a+b,0);
const group=(rows,key)=>Object.groupBy(rows,key);
const counts=(items,key)=>Object.fromEntries(Object.entries(group(items,key)).map(([k,v])=>[k,v.length]));
const score=key=>[0,1,2,null].includes(key);
const missing=['unverified_review','unverified_contextual_subject','unverified_direction','unverified_pair','plan_unavailable'];

function gate(raw,verdict) {
  if(!raw) return {status:'missing',reason:'missing',uncertain:false};
  assert.equal(verdict.decision,raw.decision);
  assert.equal(verdict.reason,raw.reason);
  const uncertain=raw.critique?.slots.some(s=>s.direction==='uncertain') || raw.critique?.pairs.some(p=>p.contrast==='uncertain'||p.structure==='uncertain');
  return {status:raw.decision,reason:raw.reason??'admit',uncertain:Boolean(uncertain)};
}
function checkedPlan(root,round,c,arm,receipts) {
  const dir=join(root,'round-'+round,c.id,arm),p=packet(c.id,arm);
  const saved=read(join(dir,'plan.json')),triage=read(join(dir,'triage-judgment.json'));
  const receipt=receipts.get([round,c.id,arm,'plan'].join('/'));
  assert.equal(receipt?.state,saved.state);
  assert.deepEqual(receipt.result.plan??null,saved.plan??null);
  const plan=saved.plan, valid=Boolean(plan);
  if(valid)assert.ok(validateCompletedExplorationPlan(plan,p.context,p.visualInput));
  assert.equal(triage.available,valid);
  const refs=p.rubric.references.filter(r=>r.present);
  assert.deepEqual(triage.references.map(r=>r.referenceId),valid?refs.map(r=>r.id):[]);
  const grades=refs.map((r,i)=>{
    const judgment=triage.references[i];
    const decision=valid ? (plan.referenceIds.includes(r.id)?'keep':'omit') : null;
    if(judgment){
      assert.equal(judgment.observed,decision);assert.equal(judgment.expected,r.decision);
      assert.equal(judgment.correct,decision===r.decision);
      assert.ok(dimensions.every(d=>score(judgment[d])));
    }
    return {correct:decision===null?null:decision===r.decision,
      ...Object.fromEntries(dimensions.map(d=>[d,judgment?.[d]??null]))};
  });
  const one=read(join(dir,'review.json')),two=present(join(root,'round-'+round,'j2',c.id,arm,'j2-review.json'));
  const j1=gate(one,valid?assessDivergence(p.context,plan,one.critique):{decision:'hold',reason:'plan_unavailable'});
  const j2=gate(two,two?verifyContextualRoundReview(root,round,c.id,arm):null);
  return {caseId:c.id,split:c.split,arm,n:refs.length,valid,state:saved.state,grades,j1,j2};
}
export function summarizePlans(rows) {
  const refs=rows.flatMap(r=>r.grades);
  const result={expected:rows.length,valid:rows.filter(r=>r.valid).length,states:counts(rows,row=>row.state),
    decisions:{expected:refs.length,observed:refs.filter(r=>r.correct!==null).length,correct:refs.filter(r=>r.correct===true).length},
    dimensions:{},gates:{}};
  for(const key of dimensions) {
    const seen=refs.map(r=>r[key]).filter(n=>n!==null);
    result.dimensions[key]={expected:refs.length,observed:seen.length,points:sum(seen),meanOfTwo:seen.length?sum(seen)/seen.length:null};
  }
  for(const key of ['j1','j2']) {
    const judged=rows.map(row=>row[key]);
    result.gates[key]={eligible:rows.length,admitted:judged.filter(r=>r.status==='admit').length,held:judged.filter(r=>r.status==='hold').length,
      missing:judged.filter(r=>r.status==='missing').length,technicalAbstentions:judged.filter(r=>missing.includes(r.reason)).length,
      anyUncertainInCritique:judged.filter(r=>r.uncertain).length,reasons:counts(judged,r=>r.reason)};
  }
  return result;
}
function byPlanScope(rows) {
  return {all:summarizePlans(rows),
    byArm:Object.fromEntries(arms.map(arm=>[arm,summarizePlans(rows.filter(r=>r.arm===arm))])),
    byCase:Object.fromEntries(Object.entries(group(rows,r=>r.caseId)).map(([id,subset])=>[id,summarizePlans(subset)])),
    byNumberOfSelectedReferences:Object.fromEntries(Object.entries(group(rows,r=>r.n)).map(([n,subset])=>[n,summarizePlans(subset)]))};
}

export function pixelCase(trial,judgment,refs,optionalId) {
  assert.equal(trial.id,judgment.caseId);
  const completed=trial.state==='complete';
  if(completed)assert.ok(trial.inputVerification.length===3 && trial.inputVerification.every(r=>r.status==='verified'));
  const slots=[1,2,3].map((position,i)=>{
    const pair=arms.map(arm=>judgment.arms[arm].slots[i]);
    for(const s of pair){
      assert.equal(s.position,position);assert.deepEqual(s.attributes.map(r=>r.refId),refs.map(r=>r.id));
      assert.ok(s.attributes.every(r=>score(r.score)));
      if(!completed)assert.ok(s.usable===null && s.attributes.every(a=>a.score===null));
    }
    const attributes=refs.map((ref,j)=>{
      const [a,b]=pair.map(s=>s.attributes[j].score);
      return {ordinal:j+1,origin:ref.origin,attribute:ref.attribute,optional:ref.id===optionalId,with:a,without:b,delta:a===null||b===null?null:a-b};
    });
    return {position,pairedImages:completed,usable:Object.fromEntries(arms.map((arm,j)=>[arm,pair[j].usable])),
      criticalFailureKinds:Object.fromEntries(arms.map((arm,j)=>[arm,pair[j].criticalFailures.map(f=>f.kind)])),attributes};
  });
  const trios=Object.fromEntries(arms.map(arm=>{
    const pairs=judgment.arms[arm].pairs, seen=pairs.filter(p=>p.score!==null);
    assert.deepEqual(pairs.map(p=>p.positions.join(',')).sort(),['1,2','1,3','2,3']);
    const known=completed&&slots.every(s=>s.usable[arm]!==null)&&seen.length===3;
    return [arm,{complete:completed,usableSlots:slots.filter(s=>s.usable[arm]===true).length,judgedPairs:seen.length,
      maximumDistinctionPairs:seen.filter(p=>p.score===2).length,useful:known?slots.every(s=>s.usable[arm])&&seen.every(p=>p.score===2):null}];
  }));
  return {caseId:trial.id,split:trial.split,state:trial.state,reason:trial.reason??null,slots,trios};
}
export function summarizePixels(rows) {
  const slots=rows.flatMap(r=>r.slots);
  function attrs(subset) {
    const paired=subset.filter(a=>a.delta!==null);
    return {expected:subset.length,paired:paired.length,withPoints:sum(paired.map(a=>a.with)),withoutPoints:sum(paired.map(a=>a.without)),
      meanPairedDelta:paired.length?sum(paired.map(a=>a.delta))/paired.length:null,
      higher:paired.filter(a=>a.delta>0).length,tied:paired.filter(a=>a.delta===0).length,lower:paired.filter(a=>a.delta<0).length};
  }
  const all=slots.flatMap(s=>s.attributes);
  return {cases:rows.length,states:counts(rows,r=>r.state),reasons:counts(rows,r=>r.reason??r.state),
    expectedPairedSlots:slots.length,verifiedPairedSlots:slots.filter(s=>s.pairedImages).length,
    attributes:attrs(all),optionalAttribute:attrs(all.filter(a=>a.optional)),byPosition:[1,2,3].map(position=>{
      const subs=slots.filter(s=>s.position===position),attributes=subs.flatMap(s=>s.attributes);
      return {position,expectedSlots:subs.length,verifiedPairs:subs.filter(s=>s.pairedImages).length,attributes:attrs(attributes),optionalAttribute:attrs(attributes.filter(a=>a.optional))};
    }),byArm:Object.fromEntries(arms.map(arm=>[arm,{completeArts:slots.filter(s=>s.pairedImages).length,
      usable:slots.filter(s=>s.usable[arm]===true).length,unusable:slots.filter(s=>s.usable[arm]===false).length,
      unratedAmongComplete:slots.filter(s=>s.pairedImages&&s.usable[arm]===null).length,
      assessedTrios:rows.filter(r=>r.trios[arm].useful!==null).length,usefulTrios:rows.filter(r=>r.trios[arm].useful===true).length,
      failures:counts(slots.flatMap(s=>s.criticalFailureKinds[arm]),s=>s)}]))};
}
function readPixels(root,round,all) {
  const dir=join(root,'j2-pixels','round-'+round,'pixels');
  const j=present(join(dir,all?'judgments.json':'feedback-dev.json'));
  if(!j)return null;
  const report=buildContextualReport(root,round,{includeHoldout:all});
  return report.trials.map(t=>{
    const p=packet(t.id,'with');
    return pixelCase(t,j.cases.find(c=>c.caseId===t.id),p.rubric.references,p.rubric.optionalId);
  });
}
export function costArm(operations,arts) {
  const cost=aggregateCosts(operations),images=aggregateCosts(operations.filter(r=>r.kind==='image'));
  const plans=aggregateCosts(operations.filter(r=>r.kind==='plan'));
  const denominator=arts && arts.usable>0 && arts.unratedAmongComplete===0 && arts.completeArts===images.reserved ? arts.usable:null;
  const divide=c=>denominator && c.modelCostRangeUsd?range(c.modelCostRangeUsd.low/denominator,c.modelCostRangeUsd.high/denominator):null;
  const details=c=>({reserved:c.reserved,covered:c.fullyCovered,rangeUsd:c.modelCostRangeUsd,coveredOperationsRangeUsd:range(c.lowerForCoveredOperationsUsd,c.upperForCoveredOperationsUsd)});
  return {operations:details(cost),plans:details(plans),images:details(images),usableDenominator:denominator,
    imageUsdPerUsable:divide(images),armSpendUsdPerUsable:divide(cost),
    reconciliation:counts(operations.filter(row=>row.kind==='plan'),row=>row.reconciliation??'no_fresh_reconciliation')};
}
function costsFor(round,snapshot,ledger,rows,pixels) {
  if(!snapshot)return null;
  assert.equal(snapshot.round,round);
  assert.equal(snapshot.total.reserved,snapshot.operations.length);
  const ids=new Set(rows.map(r=>r.caseId));
  const ops=snapshot.operations.filter(op=>ids.has(op.id.split('/')[1]));
  const expected=[...ledger.values()].filter(r=>{
    const [index,id]=r.id.split('/');return index===String(round)&&ids.has(id);
  });
  assert.deepEqual(ops.map(o=>o.id).sort(),expected.map(o=>o.id).sort(),'usage snapshot missing or stale');
  for(const op of ops){const row=ledger.get(op.id);assert.equal(row.state,op.state);assert.equal(row.kind,op.kind);}
  return Object.fromEntries(arms.map(a=>[a,costArm(ops.filter(o=>o.id.split('/')[2]===a),pixels?.byArm[a])]));
}
function preflight(root,costs,protocol,full) {
  const roster=cases.map(c=>c.id);
  assert.deepEqual(roster,protocol.caseIds);assert.deepEqual(protocol.pixelRounds,[0,5]);
  if(!full)return;
  for(let round=0;round<=5;round++) {
    const dir=join(root,'round-'+round);
    for(const path of [join(dir,'revision.json'),join(dir,'plan-feedback-dev.json'),join(costs,'r'+round+'.json')])
      assert.ok(existsSync(path),'aguardando fechamento da rodada '+round);
    for(const id of roster)for(const arm of arms)for(const path of [join(dir,id,arm,'review.json'),join(dir,'j2',id,arm,'j2-review.json')])
      assert.ok(existsSync(path),'aguardando J1/J2 da rodada '+round);
  }
  for(const round of protocol.pixelRounds)for(const prefix of [root,join(root,'j2-pixels')]) {
    assert.ok(existsSync(join(prefix,'round-'+round,'pixels','judgments.json')),'aguardando julgamento final dos pixels');
  }
}
function snapshot(root,selected) {
  const db=new DatabaseSync(join(root,'receipts.sqlite'),{readOnly:true});
  try {
    const protocol=read(join(root,'protocol.json'));
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding,fingerprint(protocol));
    const sql='SELECT * FROM calls WHERE id LIKE ?';
    const rows=selected.flatMap(c=>db.prepare(sql).all('%/'+c.id+'/%'));
    return new Map(rows.map(r=>[r.id,{...r,result:JSON.parse(r.result)}]));
  } finally {db.close();}
}
export function comparePlanGrades(initial,final) {
  if(!initial||!final)return null;
  const lookup=new Map(final.map(r=>[[r.caseId,r.arm].join('/'),r]));
  assert.equal(initial.length,final.length);
  const units=initial.flatMap(a=>{
    const b=lookup.get([a.caseId,a.arm].join('/'));
    assert.ok(b && a.grades.length===b.grades.length);
    return a.grades.map((grade,i)=>[grade,b.grades[i]]);
  });
  return Object.fromEntries(dimensions.map(key=>{
    const paired=units.filter(([a,b])=>a[key]!==null&&b[key]!==null);
    const delta=paired.map(([a,b])=>b[key]-a[key]);
    return [key,{expected:units.length,paired:paired.length,initialOnly:units.filter(([a,b])=>a[key]!==null&&b[key]===null).length,
      finalOnly:units.filter(([a,b])=>a[key]===null&&b[key]!==null).length,
      pairedMeanChange:delta.length?sum(delta)/delta.length:null,improved:delta.filter(x=>x>0).length,
      equal:delta.filter(x=>x===0).length,worsened:delta.filter(x=>x<0).length}];
  }));
}
function comparison(rounds) {
  const first=rounds.find(r=>r.round===0), last=rounds.find(r=>r.round===5);
  if(!first?.pixelCases||!last?.pixelCases)return {status:'missing-window'};
  const a=first.pixelCases.filter(c=>c.state==='complete').map(c=>c.caseId).sort();
  const b=last.pixelCases.filter(c=>c.state==='complete').map(c=>c.caseId).sort();
  const both=a.filter(id=>b.includes(id));
  return {status:!both.length?'no-overlapping-generated-case':a.join()===b.join()?'same-generated-cases':'different-generated-cases',
    baselineGenerated:a,finalGenerated:b,sameCases:both,note:'Cada rodada usa o próprio plano. A ablação isolada é entre braços da mesma rodada e slot.'};
}
export function buildStudy(root,costDir,developmentOnly=false) {
  const protocol=read(join(root,'protocol.json'));
  preflight(root,costDir,protocol,!developmentOnly);
  const selected=cases.filter(c=>!developmentOnly||c.split==='dev'),ledger=snapshot(root,selected);
  const scopes=developmentOnly?['development']:['all','development','reserve'];
  const rounds=[],pending=[],planRows=new Map();
  for(let round=0;round<=5;round++) {
    const dir=join(root,'round-'+round),revision=present(join(dir,'revision.json'));
    if(!revision || !existsSync(join(dir,'plan-feedback-dev.json'))) {pending.push(round);continue;}
    assert.equal(revision.corpus,protocol.corpus);assert.equal(revision.round,round);
    if(round)assert.equal(revision.parentFeedback,digest(readFileSync(join(root,'round-'+(round-1),'feedback-development.json'))));
    const rows=selected.flatMap(c=>arms.map(arm=>checkedPlan(root,round,c,arm,ledger)));
    if(!developmentOnly)assert.ok(rows.every(r=>['complete','invalid','rejected','unknown'].includes(r.state)),'planejamento ainda em andamento');
    planRows.set(round,rows);
    const pixelCases=protocol.pixelRounds.includes(round)?readPixels(root,round,!developmentOnly):null;
    const usage=present(join(costDir,'r'+round+'.json'));
    const scope={};
    for(const name of scopes) {
      const subset=rows.filter(r=>name==='all'||r.split===(name==='development'?'dev':'holdout'));
      const ids=new Set(subset.map(r=>r.caseId));
      const pixels=pixelCases ? summarizePixels(pixelCases.filter(c=>ids.has(c.caseId))) : null;
      scope[name]={plans:byPlanScope(subset),pixels,cost:costsFor(round,usage,ledger,subset,pixels)};
    }
    rounds.push({round,revisionDigest:digest(revision.revision),parentFeedbackDigest:revision.parentFeedback,scope,pixelCases});
  }
  const fixedFolder=join(root,'fixed-control-r0');
  const fixed=selected.flatMap(c=>{
    const saved=present(join(fixedFolder,c.id+'.json'));
    return saved?[developmentOnly?saved:verifyFixedAdmission(root,c.id)]:[];
  });
  for(const entry of fixed)assert.equal(entry.origin,'dataset-fixed-control');
  const fdb=new DatabaseSync(join(root,'receipts.sqlite'),{readOnly:true});
  let fixedImageReceipts;
  try {
    const exists=fdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_control_calls'").get();
    const receipts=exists?fdb.prepare("SELECT id FROM fixed_control_calls WHERE kind='image'").all():[];
    fixedImageReceipts=receipts.filter(r=>selected.some(c=>r.id.split('/').includes(c.id))).length;
  } finally {fdb.close();}
  return {version:1,scope:developmentOnly?'development-only':'complete',corpus:protocol.corpus,rounds,pending,
    comparability:{pixels:comparison(rounds),planGrades:Object.fromEntries(scopes.map(scope=>{
      const byScope=r=>planRows.get(r)?.filter(row=>scope==='all'||row.split===(scope==='development'?'dev':'holdout'));
      return [scope,comparePlanGrades(byScope(0),byScope(5))];
    }))},promotion:'owner-review-pending',fixedControl:{expected:selected.length,decisions:fixed.length,admitted:fixed.filter(f=>f.decision==='admit').length,
      imageReceipts:fixedImageReceipts,includedInMainStudy:false},pricing:{currency:'USD',sources: ['https://developers.openai.com/api/docs/models/gpt-6.1-terra','https://developers.openai.com/api/docs/models/gpt-image-2.6-flare'],
      models:{planning:'gpt-6.1-terra',image:'gpt-image-2.6-flare'},judge:'Codex com assinatura ChatGPT, valor monetário não atribuído',invoice:null}};
}
const ratio=(a,b)=>a+'/'+b;
const assessed=(a,b)=>b?ratio(a,b):'Sem avaliação';
function metric(g) {return g.meanOfTwo===null?'—':g.meanOfTwo.toFixed(2)+' ('+ratio(g.observed,g.expected)+')';}
function usd(r) {return r?'US$ '+r.low.toFixed(4)+'–'+r.high.toFixed(4):'—';}
export function toMarkdown(study) {
  const lines=['# Resultados da triagem e das três propostas','',
    'A baseline R0 e as cinco revisões usam os mesmos casos sintéticos e dois braços. O braço com a referência opcional e o braço sem ela têm planejamentos próprios. Para medir os pixels, o executor usa o mesmo prompt do plano com a opcional nos dois braços e remove somente os bytes dessa referência.',''];
  const scopes=study.scope==='complete'?[['all','Conjunto completo'],['development','Desenvolvimento · três casos'],['reserve','Reserva · dois casos']]:[['development','Desenvolvimento · três casos']];
  for(const [name,title] of scopes) {
    lines.push('## '+title,'','Cada nota vai de 0 a 2. Entre parênteses aparece o número de referências com nota sobre o número esperado. A coluna de seleção conta decisões corretas de incluir ou omitir sobre todas as referências apresentadas.','',
      '| Rodada | Planos válidos | Seleção correta | Intenção | Atributo | Onde usar | J1 admitidos | J2 admitidos | Abstenções técnicas J1/J2 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for(const r of study.rounds) {
      const p=r.scope[name].plans.all,g=p.gates,d=p.dimensions;
      const admission=gate=>ratio(gate.admitted,gate.eligible-gate.missing)+(gate.missing?' ('+gate.missing+' pendentes)':'');
      lines.push('| '+['R'+r.round,ratio(p.valid,p.expected),ratio(p.decisions.correct,p.decisions.expected),metric(d.intent),
        metric(d.characteristic),metric(d.use),admission(g.j1),admission(g.j2),g.j1.technicalAbstentions+'/'+g.j2.technicalAbstentions].join(' | ')+' |');
    }
    lines.push('','| Rodada | Slots pareados | Arte utilizável com/sem | Trios úteis com/sem | Atributo opcional com/sem (pontos pareados) |',
      '| --- | --- | --- | --- | --- |');
    for(const r of study.rounds.filter(r=>[0,5].includes(r.round))) {
      const p=r.scope[name].pixels;
      if(!p){lines.push('| R'+r.round+' | Pendente | — | — | — |');continue;}
      const a=p.optionalAttribute,arm=k=>p.byArm[k];
      lines.push('| R'+r.round+' | '+ratio(p.verifiedPairedSlots,p.expectedPairedSlots)+' | '+arms.map(k=>assessed(arm(k).usable,arm(k).completeArts)).join(' · ')+
        ' | '+arms.map(k=>assessed(arm(k).usefulTrios,arm(k).assessedTrios)).join(' · ')+' | '+(a.paired?ratio(a.withPoints,a.paired*2)+' · '+ratio(a.withoutPoints,a.paired*2):'Sem par avaliável')+' |');
    }
    lines.push('');
  }
  if(study.scope==='complete') {
    lines.push('## Cada caso de reserva','','| Rodada | Caso sintético | Planos válidos | Seleção correta | Atributo e cobertura | J1/J2 admitidos |',
      '| --- | --- | --- | --- | --- | --- |');
    for(const r of study.rounds)for(const [id,p] of Object.entries(r.scope.reserve.plans.byCase)) {
      lines.push('| '+['R'+r.round,id,ratio(p.valid,p.expected),ratio(p.decisions.correct,p.decisions.expected),metric(p.dimensions.characteristic),
        p.gates.j1.admitted+'/'+p.gates.j2.admitted].join(' | ')+' |');
    }
    lines.push('');
  }
  const name=study.scope==='complete'?'all':'development';
  lines.push('## Custo observado por braço','','Intervalo estimado dos modelos em USD. A despesa do braço inclui o planejamento independente daquele braço e as imagens ali contabilizadas. O custo por arte divide essa despesa pelas artes julgadas utilizáveis, quando existe denominador e cobertura de custos completa. As notas dos juízes via assinatura ChatGPT ficam fora dessa conta. A fatura da organização não foi observada.','',
    '| Rodada | Com opcional | Sem opcional | Por arte utilizável com/sem |','| --- | --- | --- | --- |');
  for(const r of study.rounds) {
    const c=r.scope[name].cost;
    lines.push('| R'+r.round+' | '+usd(c?.with.operations.rangeUsd)+' | '+usd(c?.without.operations.rangeUsd)+' | '+arms.map(k=>usd(c?.[k].armSpendUsdPerUsable)).join(' · ')+' |');
  }
  const matched=study.comparability.planGrades[name];
  if(matched) {
    lines.push('','## Mudança nos mesmos arquivos','',
      'Cada comparação liga a mesma referência ao mesmo caso e braço em R0 e R5. As notas exclusivas de uma janela indicam mudança de cobertura.','',
      '| Métrica | Referências com duas notas | Só R0 | Só R5 | Mudança média na escala de 0 a 2 | Melhorou / igual / piorou |',
      '| --- | --- | --- | --- | --- | --- |');
    for(const [key,label] of [['intent','Intenção'],['characteristic','Atributo'],['use','Onde usar']]) {
      const m=matched[key];
      lines.push('| '+[label,ratio(m.paired,m.expected),m.initialOnly,m.finalOnly,m.pairedMeanChange?.toFixed(2)??'—',[m.improved,m.equal,m.worsened].join(' / ')].join(' | ')+' |');
    }
  }
  const f=study.fixedControl;
  lines.push('','## Limites de interpretação','','Um trio útil exige três artes utilizáveis e distinção máxima nos três pares. R1 a R4 medem o plano textual. A unidade pareada de pixels é o mesmo caso, rodada, posição e atributo. Um slot ausente reduz cobertura. Uma nota zero é uma observação do juiz.','',
    'Casos gerados nas duas janelas disponíveis para comparação entre rodadas — '+(study.comparability.pixels.sameCases?.join(', ')||'nenhum confirmado')+'. As diferenças entre braços na mesma rodada medem o efeito da retirada da referência para aqueles prompts. A amostra de cinco briefings e os julgamentos do modelo deixam a preferência de Matheus em aberto.','',
    'O controle complementar de prompt fixo teve '+f.admitted+' admissões em '+f.decisions+' decisões e '+f.imageReceipts+' recibos de imagem. Ele tem contagem própria.','',
    'O arquivo [medidas.json](medidas.json) detalha os denominadores por número de referências selecionadas, as notas por atributo e posição, os motivos de retenção, as falhas visuais e a cobertura monetária. [Preços do planejamento]('+study.pricing.sources[0]+') · [Preços de imagem]('+study.pricing.sources[1]+')','');
  return lines.join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [root,costDir,destination,flag,...rest]=process.argv.slice(2);
  assert.ok(root&&costDir&&destination&&!rest.length&&(!flag||flag==='--development-only'),'Uso: node study-summary.mjs ROOT CUSTOS DESTINO [--development-only]');
  const result=buildStudy(resolve(root),resolve(costDir),flag==='--development-only');
  mkdirSync(destination,{recursive:true});
  writeFileSync(join(destination,'medidas.json'),JSON.stringify(result,null,2)+'\n');
  writeFileSync(join(destination,'resumo.md'),toMarkdown(result));
}

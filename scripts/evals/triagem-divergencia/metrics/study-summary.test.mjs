import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cases} from '../dataset/packets.mjs';
import {summarizePlans,pixelCase,summarizePixels,costArm,buildStudy} from './study-summary.mjs';

const admit={status:'admit',reason:'admit',uncertain:false};
const absent={status:'hold',reason:'plan_unavailable',uncertain:false};
test('cobertura inclui referências do plano ausente e distingue nota zero e abstenção',()=>{
  const empty={correct:null,intent:null,characteristic:null,use:null};
  const p=summarizePlans([{valid:true,state:'complete',grades:[{correct:false,intent:2,characteristic:null,use:0}],j1:admit,j2:admit},
    {valid:false,state:'invalid',grades:[empty,empty],j1:absent,j2:{status:'missing',reason:'missing',uncertain:false}}]);
  assert.equal(p.valid,1);assert.deepEqual(p.decisions,{correct:0,observed:1,expected:3});
  assert.deepEqual(p.dimensions.use,{expected:3,observed:1,points:0,meanOfTwo:0});
  assert.equal(p.dimensions.characteristic.meanOfTwo,null);
  assert.equal(p.gates.j1.technicalAbstentions,1);assert.equal(p.gates.j2.missing,1);
});
function observed(id,scores,usable) {
  const attrs=[{id:'A',attribute:'mancha',origin:'generated'},{id:'B',attribute:'barra',origin:'external'}];
  const pairs=[[1,2],[1,3],[2,3]].map(positions=>({positions,score:2}));
  const arm=key=>({pairs,slots:[1,2,3].map((position,i)=>({position,usable:usable[key][i],criticalFailures:[],
    attributes:attrs.map((r,j)=>({refId:r.id,score:scores[key][i][j]}))}))});
  const trial={id,split:'dev',state:'complete',inputVerification:[1,2,3].map(()=>({status:'verified'}))};
  return pixelCase(trial,{caseId:id,arms:{with:arm('with'),without:arm('without')}},attrs,'B');
}
test('delta condicionado a pares observados, por atributo e por posição, trio útil exige três usáveis e todos os pares distintos',()=>{
  const row=observed('fixture',{with:[[2,1],[null,2],[2,null]],without:[[2,0],[0,2],[1,0]]},
    {with:[true,true,true],without:[false,true,true]});
  const out=summarizePixels([row]);
  assert.equal(out.optionalAttribute.expected,3);assert.equal(out.optionalAttribute.paired,2);
  assert.equal(out.optionalAttribute.meanPairedDelta,.5);assert.equal(out.byPosition[2].optionalAttribute.meanPairedDelta,null);
  assert.equal(out.byArm.with.usefulTrios,1);assert.equal(out.byArm.without.usefulTrios,0);
  assert.equal(out.attributes.expected,6);assert.equal(out.attributes.paired,4);
});
test('custo por arte exige todas as operações cobertas e um denominador observável',()=>{
  const op=(kind,low,high)=>({kind,estimate:{lowerUsd:low,upperUsd:high,inputLow:0,inputHigh:0,outputLow:low,outputHigh:high}});
  const operations=[op('plan',.1,.2),op('image',.5,.9)];
  assert.deepEqual(costArm(operations,{usable:1,completeArts:1,unratedAmongComplete:0}).armSpendUsdPerUsable,{low:.6,high:1.1});
  assert.equal(costArm(operations,{usable:0,completeArts:1,unratedAmongComplete:0}).imageUsdPerUsable,null);
  assert.equal(costArm([...operations,{kind:'image'}],{usable:1,completeArts:2,unratedAmongComplete:0}).imageUsdPerUsable,null);
  assert.equal(costArm(operations,{usable:1,completeArts:1,unratedAmongComplete:1}).imageUsdPerUsable,null);
});
test('o relatório integral exige fechamento das seis rodadas antes de coletar a reserva',t=>{
  const dir=mkdtempSync(join(tmpdir(),'study-summary-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'protocol.json'),JSON.stringify({caseIds:cases.map(c=>c.id),pixelRounds:[0,5]}));
  assert.throws(()=>buildStudy(dir,dir),/aguardando fechamento/);
});

test('ganho de cobertura não é contado como melhoria de nota do mesmo arquivo',async()=>{
  const {comparePlanGrades}=await import('./study-summary.mjs');
  const rows=grades=>[{caseId:'a',arm:'with',grades:grades.map(n=>({intent:n,characteristic:n,use:n}))}];
  const result=comparePlanGrades(rows([0,2,null,null]),rows([2,null,2,null])).characteristic;
  assert.deepEqual(result,{expected:4,paired:1,initialOnly:1,finalOnly:1,pairedMeanChange:2,improved:1,equal:0,worsened:0});
});

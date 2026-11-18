import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {read,save} from './group.mjs';
import {runControls} from './controls.mjs';
import {runRound} from './round.mjs';

const controls=read(fileURLToPath(new URL('../dataset/contrasts.json',import.meta.url)));
function fixture(t,missing=false) {
  const dir=mkdtempSync(join(tmpdir(),'compor-panel-fixture-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const arm of ['with','without'])for(const c of cases) {
    const folder=join(dir,'round-0',c.id,arm);
    mkdirSync(folder,{recursive:true});
    const p=packet(c.id,arm);
    const items=controls.find(row=>row.caseId===c.id&&row.expected==='accept').items;
    const raw={version:2,referenceIds:p.visualInput.entries.map(entry=>entry.id),items};
    const plan=validateExplorationPlan(raw,p.context,p.visualInput);
    assert.ok(plan);
    save(join(folder,'plan.json'),missing?{state:'invalid',plan:null,raw:null}:{state:'complete',plan,raw});
  }
  return dir;
}

test('prepara os cinco casos por braço em grupos cegos, com pixels e gabarito só na triagem', t=>{
  const dir=fixture(t);
  assert.deepEqual(runRound(dir,0,true),{prepared:4});
  const panel=join(dir,'round-0','plan-panel-private','with');
  const d=readFileSync(join(panel,'divergence','blind','prompt.txt'),'utf8');
  const tr=readFileSync(join(panel,'triage','blind','prompt.txt'),'utf8');
  for(const prompt of [d,tr]) {
    assert.ok(!/dev-feira|reserva-cais|"split":"holdout"|"arm":/.test(prompt));
    assert.equal([...prompt.matchAll(/"case":"P[0-9a-f]{8}"/g)].length,5);
  }
  assert.ok(!d.includes('"gold":'));
  assert.ok(tr.includes('"gold":'));
  assert.equal([...tr.matchAll(/"strip":"P[0-9a-f]{8}\.png"/g)].length,5);
  assert.ok(!existsSync(join(panel,'divergence','events.jsonl')));
  assert.ok(!existsSync(join(dir,'round-0','plan-feedback-dev.json')));
  const path=join(dir,'round-0',cases[0].id,'with','plan.json');
  const changed=read(path);
  changed.plan.items[0].prompt+=' campo alterado';
  save(path,changed);
  assert.throws(()=>runRound(dir,0,true),/stored_plan_not_validated/);
});

test('planos ausentes na origem têm abstenção por arm e ID e cobertura explícita sem iniciar um juiz', t=>{
  const dir=fixture(t,true);
  assert.equal(runRound(dir,0,false).reviewed,10);
  for(const arm of ['with','without'])for(const c of cases) {
    const record=read(join(dir,'round-0',c.id,arm,'review.json'));
    assert.deepEqual(record,{decision:'hold',reason:'plan_unavailable',critique:null,subject:null});
  }
  const dev=read(join(dir,'round-0','plan-feedback-dev.json'));
  assert.equal(dev.cases.length,6);
  assert.equal(dev.groups.with.plansObserved,0);
  assert.ok(dev.groups.with.referencesExpected>0);
  assert.ok(!JSON.stringify(dev).includes('reserva-'));
  const hold=read(join(dir,'round-0','plan-panel-private','plan-feedback-holdout.json'));
  assert.equal(hold.cases.length,4);
});
test('calibração cega esconde rótulo e posição conhecida do par duplicado',t=>{
  const dir=fixture(t);
  assert.equal(runControls(dir,true).controls,15);
  for(let n=0;n<3;n++) {
    const p=readFileSync(join(dir,'plan-controls-private','panel-'+n,'blind','prompt.txt'),'utf8');
    assert.ok(!/duplicatePair|driftPosition|dev-feira|reserva-cais|"expected":/.test(p));
  }
});

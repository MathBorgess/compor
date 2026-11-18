import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {digest,openLedger} from '../runner/ledger.mjs';
import {read,save} from '../plan-judge/group.mjs';
import {verifyFixedAdmission} from './guard.mjs';

const cli=fileURLToPath(new URL('guard.mjs',import.meta.url));
const contrasts=read(new URL('../dataset/contrasts.json',import.meta.url));
function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'compor-fixed-control-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const freeze='scripts/evals/triagem-divergencia/dataset/freeze.json';
  const protocol={plans:60,images:60,sources:{[freeze]:digest(readFileSync(new URL('../dataset/freeze.json',import.meta.url)))}};
  save(join(root,'protocol.json'),protocol);
  const db=openLedger(join(root,'receipts.sqlite'),protocol);
  try {
    for(const [index,c] of cases.entries()) {
      const p=packet(c.id,'with');
      const id='0/'+c.id+'/with/plan';
      const items=[1,2,3].map(position=>({position,creativePrompt:'Cenário alternativo de teste '+position,
        composition:'Composição '+position,contrast:'Contraste '+position,differenceFromOthers:'Escolha '+position}));
      const raw={version:2,referenceIds:p.visualInput.entries.filter(entry=>index!==1 || entry.id!==p.rubric.optionalId).map(entry=>entry.id),items};
      const plan=validateExplorationPlan(raw,p.context,p.visualInput);
      const result={plan,raw,sid:'sess_local',state:'complete'};
      db.reserve(id,'plan',{context:p.context,visualInput:p.visualInput,instructions:null});
      db.update(id,'complete',result);
      const dir=join(root,'round-0',c.id,'with');
      mkdirSync(dir,{recursive:true});
      save(join(dir,'plan.json'),result);
    }
  } finally {db.close();}
  return root;
}
// Exercise only the local receipt contract. No model session runs in this test.
function fakeJudge(root) {
  execFileSync(process.execPath,[cli,root,'--prepare']);
  const dir=join(root,'fixed-control-r0');
  const protocol=read(join(dir,'protocol.json'));
  const prompt=readFileSync(join(dir,'blind','prompt.txt'),'utf8');
  assert.ok(!/"expected":|"caseId":|"arm":|"optionalId":|fixed-control/.test(prompt));
  const source=JSON.parse(prompt.trimEnd().split('\n').at(-1));
  assert.equal(source.length,5);
  const answers=source.map(({case:alias,input})=>{
    const target=protocol.cases.find(row=>row.alias===alias);
    const slots=input.items.map(item=>({position:item.position,direction:target.caseId===cases[2].id?'uncertain':'preserved',
      evidence:item.creativePrompt,reason:'Evidência textual de teste.'}));
    const pairs=[[1,2],[1,3],[2,3]].map(([left,right])=>({left,right,contrast:'distinct',structure:'distinct',
      leftEvidence:input.items[left-1].creativePrompt,rightEvidence:input.items[right-1].creativePrompt,choice:'Diferença de estrutura no teste.'}));
    return {case:alias,assessment:{subject:input.subject,slots,pairs}};
  });
  save(join(dir,'answer.json'),{cases:answers});
  const thread='local-contract-test';
  const receipt={thread,model:'gpt-6.2-astra',effort:'medium',packetSha256:readFileSync(join(dir,'packet-sha256.txt'),'utf8').trim(),
    answerSha256:digest(readFileSync(join(dir,'answer.json')))};
  save(join(dir,'receipt.json'),receipt);
  writeFileSync(join(dir,'events.jsonl'),[JSON.stringify({type:'thread.started',thread_id:thread}),JSON.stringify({type:'turn.completed'})].join('\n')+'\n');
  execFileSync(process.execPath,[cli,root]);
}
test('só a posição congelada pode ser usada quando o juiz admite e a opcional consta da seleção real',t=>{
  const root=fixture(t);
  fakeJudge(root);
  const eligible=verifyFixedAdmission(root,cases[0].id);
  assert.equal(eligible.decision,'admit');
  assert.equal(eligible.position,1);
  assert.equal(eligible.origin,'dataset-fixed-control');
  const control=contrasts.find(c=>c.caseId===cases[0].id && c.expected==='accept');
  assert.equal(eligible.plan.items[0].creativePrompt,control.items.find(item=>item.position===1).creativePrompt);
  assert.ok(eligible.plan.items[0].prompt.includes('Fatos declarados obrigatórios'));
  assert.equal(verifyFixedAdmission(root,cases[1].id).reason,'optional_omitted');
  const held=verifyFixedAdmission(root,cases[2].id);
  assert.equal(held.reason,'direction');
  assert.equal(held.plan,null);
  const file=join(root,'fixed-control-r0',cases[2].id+'.json');
  save(file,{...read(file),decision:'admit'});
  assert.throws(()=>verifyFixedAdmission(root,cases[2].id),/control_admission_changed/);
  const planFile=join(root,'round-0',cases[0].id,'with','plan.json');
  const changed=read(planFile);
  changed.plan.referenceIds=[];
  save(planFile,changed);
  assert.throws(()=>verifyFixedAdmission(root,cases[0].id),/control_planning_output_changed/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases, packet} from '../dataset/packets.mjs';
import {hash, read, save} from './group.mjs';
import {verifyContextualRoundReview} from './contextual-round.mjs';
import {assessDivergence, buildDivergenceReview} from '../planner/candidate.mjs';
import {assessContextualDivergence, buildContextualDivergenceReview} from './contextual.mjs';

function example() {
  const {context, visualInput} = packet('dev-feira','with');
  const items = ['Centro aberto', 'Faixa na margem', 'Percurso em diagonal'].map((label, i) => ({
    position:i+1, creativePrompt:'Desenhe a composição com '+label+'.', composition:'Organize por '+label+'.',
    contrast:'Concentre o contraste em '+label+'.', differenceFromOthers:'Cada rota dá ênfase a '+label+'.',
  }));
  const ids = visualInput.entries.filter(entry=>entry.inputOrigin==='local-upload').map(entry=>entry.id);
  const plan = validateExplorationPlan({version:2, referenceIds:ids, items}, context, visualInput);
  assert.ok(plan);
  return {context,visualInput,plan};
}

test('J2 só acrescenta seleção autorizada, usa exatamente a rubrica J1 e vincula a totalidade do manifesto', () => {
  const {context,visualInput,plan} = example();
  const basic = buildDivergenceReview(context,plan);
  const j2 = buildContextualDivergenceReview(context,plan,visualInput);
  assert.equal(j2.instructions,basic.instructions);
  assert.deepEqual(j2.input.selection.catalogoCompletoDeArquivosSelecionadosPelaPessoa,
    visualInput.entries.map(entry=>({id:entry.id,ordem:entry.ordinal,origem:entry.inputOrigin})));
  assert.deepEqual(j2.input.selection.idsDessesArquivosRetidosPeloPlanejadorParaAsTresImagens,plan.referenceIds);
  assert.deepEqual(Object.keys(j2.input).sort(),['context','items','selection','subject']);
  assert.deepEqual(j2.input.items,basic.input.items);
  const largerPlan = {...plan,referenceIds:visualInput.entries.map(entry=>entry.id)};
  assert.notEqual(buildContextualDivergenceReview(context,largerPlan,visualInput).subject,j2.subject);
  const withoutOmitted = {...visualInput,entries:visualInput.entries.filter(entry=>plan.referenceIds.includes(entry.id))
    .map((entry,i)=>({...entry,ordinal:i+1}))};
  assert.notEqual(buildContextualDivergenceReview(context,plan,withoutOmitted).subject,j2.subject);
  const wrongManifest = {...visualInput,entries:[]};
  assert.throws(()=>buildContextualDivergenceReview(context,largerPlan,wrongManifest),/mismatch/);
});

test('as evidências, recusas e casos incertos passam pelas mesmas condições de J1', () => {
  const {context,visualInput,plan} = example();
  const {subject,basicSubject} = buildContextualDivergenceReview(context,plan,visualInput);
  const slots = plan.items.map(item=>({position:item.position,direction:'preserved',evidence:item.creativePrompt,reason:'Composição descrita.'}));
  const pairs = [[1,2],[1,3],[2,3]].map(([left,right])=>({left,right,contrast:'distinct',structure:'distinct',
    leftEvidence:plan.items[left-1].creativePrompt,rightEvidence:plan.items[right-1].creativePrompt,choice:'Hierarquia diferente.'}));
  function verdicts(s,p) {
    const j2 = assessContextualDivergence(context,plan,visualInput,{subject,slots:s,pairs:p});
    const j1 = assessDivergence(context,plan,{subject:basicSubject,slots:s,pairs:p});
    assert.equal(j2.decision,j1.decision);
    assert.equal(j2.reason,j1.reason);
    return j2;
  }
  assert.equal(verdicts(slots,pairs).decision,'admit');
  assert.equal(verdicts(slots,[{...pairs[0],contrast:'uncertain'},...pairs.slice(1)]).reason,'insufficient_divergence');
  assert.equal(verdicts([{...slots[0],evidence:'texto inventado'},...slots.slice(1)],pairs).reason,'unverified_direction');
  assert.equal(assessContextualDivergence(context,plan,visualInput,{subject:basicSubject,slots,pairs}).decision,'hold');
});

test('recibo local é conferido contra o parecer do grupo e a seleção original, sem consultar um provedor', t => {
  const root = mkdtempSync(join(tmpdir(),'compor-test-j2-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const roundDir = join(root,'round-0');
  const {context,visualInput,plan} = example();
  for (const c of cases) {
    const dir = join(roundDir,c.id,'with');
    mkdirSync(dir,{recursive:true});
    save(join(dir,'plan.json'),{plan:c.id==='dev-feira'?plan:null});
  }
  const cli = fileURLToPath(new URL('contextual-round.mjs',import.meta.url));
  execFileSync(process.execPath,[cli,root,'0','--prepare','with']);
  const dir = join(roundDir,'j2','panel-private','with');
  const alias = read(join(dir,'labels.json'))['dev-feira'];
  const {subject} = buildContextualDivergenceReview(context,plan,visualInput);
  const assessment = {subject,slots:[],pairs:[]};
  const packetSha256 = readFileSync(join(dir,'packet-sha256.txt'),'utf8').trim();
  const fakeAnswer = JSON.stringify({cases:[{case:alias,assessment}]});
  writeFileSync(join(dir,'answer.json'),fakeAnswer);
  save(join(dir,'receipt.json'),{thread:'synthetic-test',model:'gpt-6.2-astra',effort:'medium',packetSha256,answerSha256:hash(fakeAnswer)});
  execFileSync(process.execPath,[cli,root,'0','with']);
  assert.equal(verifyContextualRoundReview(root,0,'dev-feira','with').reason,'unverified_review');
  const resultPath = join(roundDir,'j2','dev-feira','with','j2-review.json');
  const original = read(resultPath);
  save(resultPath,{...original,decision:'admit'});
  assert.throws(()=>verifyContextualRoundReview(root,0,'dev-feira','with'),/decision_changed/);
  save(resultPath,{...original,critique:{...assessment,pairs:[{}]}});
  assert.throws(()=>verifyContextualRoundReview(root,0,'dev-feira','with'),/receipt_changed/);
  save(resultPath,original);
  writeFileSync(join(dir,'blind','prompt.txt'),'pacote alterado');
  assert.throws(()=>verifyContextualRoundReview(root,0,'dev-feira','with'),/receipt_changed/);
});

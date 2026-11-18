import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {validateCompletedExplorationPlan, validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {digest,fingerprint} from '../runner/ledger.mjs';
import {keep} from '../runner/round.mjs';
import {read,labelRows,runGroup,seed} from '../plan-judge/group.mjs';
import {assessContextualDivergence,buildContextualDivergenceReview} from '../plan-judge/contextual.mjs';

const origin = 'dataset-fixed-control';
const position = 1;
const files = ['guard.mjs','../plan-judge/contextual.mjs','../plan-judge/group.mjs','../planner/candidate.mjs',
  '../dataset/packets.mjs','../dataset/freeze.json','../../../../packages/agents-api/src/exploration-plan-contract.mjs',
  '../../../../packages/agents-api/src/visual-input.mjs','../../../../packages/agents-api/src/visual-input-contract.mjs'];
const sourceHashes = () => Object.fromEntries(files.map(file => [file,digest(readFileSync(new URL(file,import.meta.url)))]));
const data = new URL('../dataset/',import.meta.url);
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
function corpus(db,root) {
  const protocol = read(join(root,'protocol.json'));
  if (protocol.plans!==60 || protocol.images!==60 || db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding!==fingerprint(protocol)) throw Error('control_protocol_mismatch');
  const freezeBytes = readFileSync(new URL('freeze.json',data));
  const freeze = JSON.parse(freezeBytes);
  if (protocol.sources['scripts/evals/triagem-divergencia/dataset/freeze.json']!==digest(freezeBytes)) throw Error('control_dataset_freeze_changed');
  for(const [file,expected] of Object.entries(freeze.files)) {
    if (digest(readFileSync(new URL(file,data)))!==expected) throw Error('control_dataset_changed');
  }
  return {controls:read(new URL('contrasts.json',data)),freezeDigest:digest(freezeBytes),protocolDigest:fingerprint(protocol)};
}
function rowForCase(db,root,c,source) {
  const p = packet(c.id,'with');
  const planPath = join(root,'round-0',c.id,'with','plan.json');
  const savedBytes = readFileSync(planPath), saved = JSON.parse(savedBytes);
  const call = '0/'+c.id+'/with/plan';
  const expectedBinding = fingerprint({context:p.context,visualInput:p.visualInput,instructions:null});
  const stored = db.prepare('SELECT kind,binding,state,result FROM calls WHERE id=?').get(call);
  if (!stored || stored.kind!=='plan' || stored.binding!==expectedBinding || stored.state!==saved.state) throw Error('control_planning_receipt_changed');
  const result = JSON.parse(stored.result);
  if (!isDeepStrictEqual(result.plan??null,saved.plan??null) || !isDeepStrictEqual(result.raw??null,saved.raw??null) || (result.sid??null)!==(saved.sid??null)) {
    throw Error('control_planning_output_changed');
  }
  const hits = source.controls.filter(item=>item.caseId===c.id && item.expected==='accept');
  if (hits.length!==1) throw Error('control_ambiguous_frozen_trio');
  const fixed = hits[0];
  const row = {id:c.id,p,call,planSha256:digest(savedBytes),controlSha256:fingerprint(fixed),slot:position,optionalId:p.rubric.optionalId};
  if (stored.state!=='complete' || !result.plan) return {...row,plan:null,skip:'planning_unavailable'};
  if (!validateCompletedExplorationPlan(result.plan,p.context,p.visualInput) ||
    !isDeepStrictEqual(result.plan,validateExplorationPlan(result.raw,p.context,p.visualInput))) throw Error('control_original_plan_invalid');
  const selected = result.plan.referenceIds;
  const plan = validateExplorationPlan({version:2,referenceIds:selected,items:fixed.items},p.context,p.visualInput);
  if (!plan || plan.items[0].position!==position) throw Error('control_contract');
  // No proposed route is recycled as the fixed intervention, including from the paired arm.
  const previous = db.prepare('SELECT result FROM calls WHERE kind=? AND id IN (?,?)').all('plan',call,'0/'+c.id+'/without/plan');
  const oldPrompts = previous.flatMap(record=>(JSON.parse(record.result).plan?.items??[]).map(item=>normalized(item.creativePrompt)));
  const repeated = oldPrompts.includes(normalized(plan.items[0].creativePrompt));
  const panel = buildContextualDivergenceReview(p.context,plan,p.visualInput);
  return {...row,plan,panel,skip:!selected.includes(row.optionalId)?'optional_omitted':repeated?'planner_prompt_repeated':null};
}
function assemble(root,key) {
  const db = new DatabaseSync(join(root,'receipts.sqlite'),{readOnly:true});
  try {
    const dataset = corpus(db,root);
    const rows = labelRows(cases.map(c=>rowForCase(db,root,c,dataset)),key);
    if (rows.length!==5) throw Error('control_requires_five_cases');
    const protocol = {origin,round:0,position,maxImages:10,groupSize:5,model:'gpt-6.2-astra',effort:'medium',
      datasetFreeze:dataset.freezeDigest,parentProtocol:dataset.protocolDigest,sources:sourceHashes(),
      cases:rows.map(row=>({caseId:row.id,alias:row.alias,source:row.call,planSha256:row.planSha256,
        controlSha256:row.controlSha256,subject:row.panel?.subject??null}))};
    const cards = rows.map(row=>({alias:row.alias,data:row.panel?.input??null}));
    const panels = rows.flatMap(row=>row.panel?[row.panel]:[]);
    if (!panels.length) throw Error('control_no_baseline_plans');
    const schema = structuredClone(panels[0].schema);
    schema.properties.subject.enum = panels.map(panel=>panel.subject);
    return {rows,protocol,cards,schema,instructions:panels[0].instructions};
  } finally {db.close();}
}
function outcome(row,critique,receipt) {
  const decision = row.plan ? assessContextualDivergence(row.p.context,row.plan,row.p.visualInput,critique)
    : {decision:'hold',reason:'planning_unavailable'};
  const reason = row.skip??decision.reason??null;
  const admit = decision.decision==='admit' && !row.skip;
  return {decision:admit?'admit':'hold',reason,plan:admit?row.plan:null,origin,subject:row.panel?.subject??null,
    thread:receipt.thread,caseId:row.id,position,optionalId:row.optionalId,sourcePlanReceipt:row.call,sourcePlanSha256:row.planSha256,
    fixedTrioSha256:row.controlSha256,packetSha256:receipt.packetSha256,judgment:decision,critique:critique??null};
}
function execute(root,prepare) {
  const dir = join(root,'fixed-control-r0');
  const key = seed(dir);
  const {rows,protocol,...group} = assemble(root,key);
  keep(join(dir,'protocol.json'),protocol);
  const answers = runGroup({dir,...group,prepare,model:protocol.model});
  if (prepare) return;
  const receipt = read(join(dir,'receipt.json'));
  for(const row of rows) keep(join(dir,row.id+'.json'),outcome(row,answers.get(row.alias),receipt));
}

export function verifyFixedAdmission(root,caseId) {
  if (!cases.some(c=>c.id===caseId)) throw Error('control_unknown_case');
  const dir = join(resolve(root),'fixed-control-r0');
  const key = readFileSync(join(dir,'seed.txt'),'utf8').trim();
  const {rows,protocol,cards,schema,instructions} = assemble(root,key);
  if (!isDeepStrictEqual(protocol,read(join(dir,'protocol.json')))) throw Error('control_protocol_was_changed');
  const receipt = read(join(dir,'receipt.json')), answer = readFileSync(join(dir,'answer.json'));
  const events = readFileSync(join(dir,'events.jsonl'),'utf8').trim().split('\n').filter(line=>line[0]==='{').map(line=>JSON.parse(line));
  if (!receipt.thread || !events.some(e=>e.type==='thread.started' && e.thread_id===receipt.thread) ||
    !events.some(e=>e.type==='turn.completed') || receipt.model!==protocol.model || receipt.effort!==protocol.effort) throw Error('control_judge_identity_changed');
  const blind = join(dir,'blind'), prompt = readFileSync(join(blind,'prompt.txt'),'utf8'), spec = read(join(blind,'schema.json'));
  const payload = JSON.stringify(cards.map(row=>({case:row.alias,input:row.data})));
  if (!prompt.startsWith(instructions+'\n') || !prompt.endsWith('\n'+payload) || !isDeepStrictEqual(spec.properties.cases.items.properties.assessment,schema)) throw Error('control_blind_packet_changed');
  if (receipt.packetSha256!==digest(JSON.stringify([protocol.model,protocol.effort,prompt,spec,[]])) ||
    receipt.packetSha256!==readFileSync(join(dir,'packet-sha256.txt'),'utf8').trim() || receipt.answerSha256!==digest(answer)) throw Error('control_judge_receipt_changed');
  const row = rows.find(item=>item.id===caseId);
  const judgments = JSON.parse(answer).cases;
  if (!Array.isArray(judgments) || !isDeepStrictEqual(judgments.map(item=>item.case).sort(),rows.filter(item=>item.panel).map(item=>item.alias).sort())) throw Error('control_judge_coverage');
  const result = outcome(row,judgments.find(item=>item.case===row.alias)?.assessment,receipt);
  if (!isDeepStrictEqual(result,read(join(dir,caseId+'.json')))) throw Error('control_admission_changed');
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [root,flag,...extra] = process.argv.slice(2);
  if (!root || extra.length || (flag && flag!=='--prepare')) throw Error('Uso: node guard.mjs EVIDENCIAS [--prepare]');
  execute(resolve(root),flag==='--prepare');
}

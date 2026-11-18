// apps/web$ node --import tsx ../../scripts/evals/pr61/briefing/group.mjs <empty-output-dir> [--count 3|4|5]
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createStudioState,updateBrief} from '../../../../apps/web/lib/studio-state.ts';
import {studioProjectIdea} from '../../../../apps/web/lib/studio-project-idea.ts';
import {parallelExplorationContext} from '../../../../apps/web/lib/parallel-exploration-context.ts';
import {PERSONA_SKILL_INSTRUCTIONS} from '../../../../packages/agents-api/src/studio-persona-skill.mjs';
import {scenarios,rubric} from './group-cases.mjs';
import {selectCases} from './group-selection.mjs';

const selected = selectCases(scenarios,process.argv.slice(3));
const dest=resolve(process.argv[2]);
await mkdir(dest,{recursive:false});
const scratch=await mkdtemp(join(tmpdir(),'compor-briefing-model-'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['OPENAI_API_KEY','OPENAI_ADMIN_KEY','OPENAI_BASE_URL','CODEX_API_KEY'].includes(key)));
const projectId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
async function run(scenario){
  const {id,offer,audience,action,request}=scenario;
  const state=updateBrief(createStudioState({userId,projectId,prepare:true}),{offer,audience,action});
  const idea=studioProjectIdea(state,'');
  const handoff=await parallelExplorationContext(state,projectId,'references',idea,async()=>Response.json({signals:[]}));
  const prompt=['Você responde como o agente do Compor ao pedido de briefing abaixo. Dê apenas a resposta final à pessoa. Nesta avaliação textual não use ferramentas, internet ou arquivos nem afirme ter registrado algo.',PERSONA_SKILL_INSTRUCTIONS,'Contexto do projeto: '+JSON.stringify(handoff),'Mensagem da pessoa: '+request].join('\n\n');
  const blindId=randomUUID();
  const answerPath=join(scratch,blindId+'.txt');
  const args=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','-s','read-only','-C',scratch,'-c','model_reasoning_effort="low"','--json','-o',answerPath,'-'];
  const events=await new Promise((done,fail)=>{
    const child=spawn('codex',args,{env,stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
    child.on('error',fail);child.on('close',code=>code===0?done(out):fail(Error('Codex '+code+': '+err.slice(-1800)+' '+out.slice(-1200))));
    child.stdin.end(prompt);
  });
  const records=events.trim().split('\n').map(line=>JSON.parse(line));
  assert(!records.some(event=>event.item && ['command_execution','mcp_tool_call','web_search','file_change'].includes(event.item.type)));
  const answer=(await readFile(answerPath,'utf8')).trim();assert(answer.length>0);
  const record={id,blindId,threadId:records.find(event=>event.type==='thread.started')?.thread_id,promptSha256:hash(prompt),answerSha256:hash(answer),idea:handoff.idea,initialIdea:idea,offerInPlan:handoff.offer===offer,audienceInPlan:handoff.audience===audience,goalInPlan:handoff.goal===action,usage:records.find(event=>event.type==='turn.completed')?.usage};
  assert(record.threadId);
  const evidence={blindId,pedido:{offer,audience,action,request},contextoNoPlano:{ideia:handoff.idea,oferta:handoff.offer,público:handoff.audience,ação:handoff.goal},resposta:answer};
  await writeFile(join(dest,id+'.json'),JSON.stringify({record,evidence},null,2)+'\n');
  return {record,evidence};
}
const rows=await Promise.all(selected.map(run));
assert.equal(new Set(rows.map(row=>row.record.threadId)).size,selected.length);
const packet={marco:'Briefing inicial',rubrica:rubric,instrucoes:'Julgue a resposta ao pedido, um ponto por dimensão e cite a evidência curta por falha. Aprovação individual: ao menos 5/6, incluindo oferta, comprador/destinatário e fidelidade, e nenhum fato comercial inventado. Registre à parte se a ideia está disponível no contexto do plano; não pontue ausência de dado não informado como invenção.',casos:rows.map(x=>x.evidence).sort((a,b)=>a.blindId.localeCompare(b.blindId))};
await writeFile(join(dest,'blind.json'),JSON.stringify(packet,null,2)+'\n');
await writeFile(join(dest,'private.json'),JSON.stringify({selectedIds:selected.map(item=>item.id),casesSha256:hash(JSON.stringify(scenarios)),skillSha256:hash(PERSONA_SKILL_INSTRUCTIONS),rows:rows.map(x=>x.record)},null,2)+'\n');

import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync,openSync,closeSync,copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildDivergenceReview,assessDivergence} from '../planner/candidate.mjs';

export const schemaObject=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const array=items=>({type:'array', items});
export const str={type:'string'};
export const hash=data=>createHash('sha256').update(data).digest('hex');
export const read=path=>JSON.parse(readFileSync(path,'utf8'));
export function save(path,obj) {
  const tmp=path+'.'+randomUUID()+'.tmp';
  writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
  renameSync(tmp,path);
}
export function seed(dir) {
  mkdirSync(dir,{recursive:true,mode:0o700});
  const path=join(dir,'seed.txt');
  try {writeFileSync(path,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
  catch(err) {if(err.code!=='EEXIST')throw err;}
  return readFileSync(path,'utf8').trim();
}
export const order=(rows,key)=>[...rows].sort((a,b)=>hash(key+a.id).localeCompare(hash(key+b.id)));
const safeEnv=()=>Object.fromEntries(['HOME','PATH','USER','LOGNAME','TMPDIR','LC_ALL','LANG','SHELL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const arrayEq=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

function drawStrips(blind, images) {
  if(!images.length)return;
  const proc=spawnSync(process.env.COMPOR_EVAL_PYTHON??'python3',['-B',fileURLToPath(new URL('strip.py',import.meta.url)),blind],{
    input:JSON.stringify(images),encoding:'utf8',env:safeEnv(),timeout:20000});
  if(proc.status!==0)throw Error('reference_strip_failed: '+(proc.error?.message??proc.stderr).slice(-800));
}

export function runGroup({dir,cards,schema,instructions,images=[],prepare=false,model='gpt-6.2-astra'}) {
  const rows=cards.filter(row=>row.data!==null);
  if(!rows.length)return new Map();
  const blind=join(dir,'blind');
  mkdirSync(blind,{recursive:true,mode:0o700});
  const prompt=instructions+'\nVocê recebeu um grupo cego de '+cards.length+' casos. Só devolva as fichas com saída disponível. '+
    'Não use ferramentas, web ou arquivos. Responda JSON. Mantenha citações curtas e literais. Cada ficha traz um identificador aleatório.\n'+
    JSON.stringify(cards.map(row=>({case:row.alias,input:row.data})));
  const spec=schemaObject({cases:array(schemaObject({case:{type:'string',enum:rows.map(r=>r.alias)},assessment:schema}))});
  const signature=hash(JSON.stringify([model,'medium',prompt,spec,images]));
  const frozen=join(dir,'packet-sha256.txt');
  if(existsSync(frozen)&&readFileSync(frozen,'utf8').trim()!==signature)throw Error('frozen_judge_packet_changed: '+dir);
  if(!existsSync(frozen))writeFileSync(frozen,signature+'\n',{flag:'wx',mode:0o600});
  writeFileSync(join(blind,'prompt.txt'),prompt,{mode:0o600});
  save(join(blind,'schema.json'),spec);
  if(images.length)drawStrips(blind,images);
  if(prepare)return null;
  const answerPath=join(dir,'answer.json'), receiptPath=join(dir,'receipt.json'), eventsPath=join(dir,'events.jsonl');
  if(!existsSync(receiptPath)) {
    if(existsSync(eventsPath))throw Error('judge_started_check_existing_events: '+dir);
    const env=safeEnv();
    const login=spawnSync('codex',['login','status'],{env,encoding:'utf8',timeout:20000});
    if(login.status!==0||!(login.stdout+login.stderr).includes('ChatGPT'))throw Error('ChatGPT_login_required');
    const isolated=mkdtempSync(join(tmpdir(),'compor-painel-'));
    const isolatedAnswer=join(isolated,'answer.json');
    for(const file of ['schema.json',...images.map(image=>image.file)])copyFileSync(join(blind,file),join(isolated,file));
    const argv=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only',
      '--disable','apps','-m',model,'-c','model_reasoning_effort="medium"','-C',isolated,'--json',
      '--output-schema',join(isolated,'schema.json'),'-o',isolatedAnswer];
    for(const image of images)argv.push('--image',join(isolated,image.file));
    const stdout=openSync(eventsPath,'wx',0o600),stderr=openSync(join(dir,'stderr.log'),'wx',0o600);
    let invoked;
    try {
      invoked=spawnSync('codex',[...argv,'-'],{env,cwd:isolated,input:prompt,stdio:['pipe',stdout,stderr],timeout:1200000});
      if(existsSync(isolatedAnswer))copyFileSync(isolatedAnswer,answerPath);
    } finally {closeSync(stdout);closeSync(stderr);rmSync(isolated,{recursive:true,force:true});}
    if(invoked.status!==0)throw Error('judge_ended_without_verified_answer: '+dir);
    const events=readFileSync(eventsPath,'utf8').split('\n').filter(line=>line[0]==='{').map(line=>JSON.parse(line));
    const forbidden=new Set(['command_execution','mcp_tool_call','web_search','file_change','collab_tool_call','tool_call']);
    if(events.some(e=>forbidden.has(e.item?.type)))throw Error('judge_used_tools: '+dir);
    const thread=events.find(e=>e.type==='thread.started')?.thread_id;
    if(!thread||!events.some(e=>e.type==='turn.completed'))throw Error('judge_receipt_incomplete: '+dir);
    save(receiptPath,{packetSha256:signature,answerSha256:hash(readFileSync(answerPath)),thread,model,effort:'medium'});
  }
  const receipt=read(receiptPath);
  if(receipt.packetSha256!==signature||receipt.answerSha256!==hash(readFileSync(answerPath)))throw Error('judge_receipt_changed');
  const answer=read(answerPath);
  if(!Array.isArray(answer.cases)||!arrayEq(answer.cases.map(row=>row.case),rows.map(row=>row.alias)))throw Error('judge_group_coverage');
  return new Map(answer.cases.map(row=>[row.case,row.assessment]));
}

export function labelRows(rows,key) {
  return order(rows,key).map((row,index)=>({...row,alias:'P'+hash(key+'alias'+index).slice(0,8)}));
}

export function judgeDivergence(dir, rows, prepare=false, interpretation='') {
  const packets=rows.map(row=>row.plan?buildDivergenceReview(row.context,row.plan):null);
  const first=packets.find(Boolean);
  if(!first)return new Map(rows.map(row=>[row.id,{decision:'hold',reason:'plan_unavailable'}]));
  const schema=structuredClone(first.schema);
  schema.properties.subject={type:'string',enum:packets.filter(Boolean).map(p=>p.subject)};
  const cards=rows.map((row,i)=>({alias:row.alias,data:packets[i]?.input??null}));
  const instructions=interpretation ? first.instructions+'\n\n'+interpretation : first.instructions;
  const results=runGroup({dir,cards,schema,instructions,prepare});
  if(prepare)return null;
  return new Map(rows.map((row,i)=>{
    const assessment=results.get(row.alias);
    const decision=packets[i]?assessDivergence(row.context,row.plan,assessment):{decision:'hold',reason:'plan_unavailable'};
    return [row.id,{...decision,subject:packets[i]?.subject??null,critique:assessment??null}];
  }));
}

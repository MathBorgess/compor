// Supplemental list-price analysis. No POST, provider-side listing or mutation of the trial journal.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fingerprint} from '../runner/ledger.mjs';

const TERRA='gpt-6.1-terra', FLARE='gpt-image-2.6-flare', MILLION=1_000_000;
export const sources={
  ratesAsOf:'2026-11-18',currency:'USD',service:'global Standard',
  terra:'https://developers.openai.com/api/docs/models/gpt-6.1-terra',
  flare:'https://developers.openai.com/api/docs/models/gpt-image-2.6-flare',
  agentUsage:'https://developers.openai.com/api/docs/guides/agents-api/observability',
  agents:'https://developers.openai.com/api/docs/guides/agents-api/overview',
  caching:'https://developers.openai.com/api/docs/guides/prompt-caching',
  images:'https://developers.openai.com/api/docs/guides/image-generation',
};
const count=n=>Number.isSafeInteger(n)&&n>=0;
const countsMatch=(a,b,c)=>[a,b,c].some(n=>n==null)||a+b===c;
const within=(a,b)=>a==null||b==null||a<=b;

// Bare input totals already include cached reads; output totals include reasoning.
export function usageNumbers(raw) {
  if(!raw||typeof raw!=='object')return null;
  const n={input:raw.input_tokens??null,output:raw.output_tokens??null,total:raw.total_tokens??null,
    cacheRead:raw.input_tokens_details?.cached_tokens??null,reasoning:raw.output_tokens_details?.reasoning_tokens??null,
    textInput:raw.input_tokens_details?.text_tokens??null,imageInput:raw.input_tokens_details?.image_tokens??null,
    imageOutput:raw.output_tokens_details?.image_tokens??null};
  if(!Object.values(n).some(count) || !Object.values(n).every(i=>i===null||count(i)) ||
      !countsMatch(n.input,n.output,n.total)||!countsMatch(n.textInput,n.imageInput,n.input)||
      !within(n.cacheRead,n.input)||!within(n.reasoning,n.output)||!within(n.imageOutput,n.output))return null;
  return n;
}

const price=(tokens,perMillion)=>tokens===null?null:tokens*perMillion/MILLION;
const plus=(a,b)=>a===null||b===null?null:a+b;
const sum=ns=>ns.reduce((a,b)=>a+b,0);
export function terraRange(raw,ttl=null) {
  const n=usageNumbers(raw);
  if(!n)return null;
  if(ttl!==null&&!['30m','12h'].includes(ttl))throw Error('unexpected_cache_ttl');
  const longPossible=n.input===null||n.input>272000;
  const minRead=n.cacheRead??0, maxRead=n.cacheRead??n.input;
  // If every input from every model invocation fits in 272K, no invocation can qualify for a long-context uplift.
  // For larger aggregate usage the per-call split remains unavailable. Upper admits all long, lower all short.
  const maxWriteRate=ttl==='30m'?1.25:2.5;
  const inputLow=n.input===null?null:(maxRead*0.05+(n.input-maxRead))/MILLION;
  const inputHigh=n.input===null?null:(minRead*0.05+(n.input-minRead)*maxWriteRate)*(longPossible?2:1)/MILLION;
  const outLow=price(n.output,5),outHigh=price(n.output,longPossible?7.5:5);
  return {inputLow,inputHigh,outputLow:outLow,outputHigh:outHigh,lowerUsd:plus(inputLow,outLow),upperUsd:plus(inputHigh,outHigh),
    context:longPossible?'per-call-length-unknown':'short',ttl,cacheWritesReported:false};
}

export function flareRange(raw) {
  const n=usageNumbers(raw);
  if(!n)return null;
  const o=n.imageOutput;
  if(o!==null&&n.output!==null&&o!==n.output)return null;
  const outUsd=price(o,30);
  let inputLow=null,inputHigh=null;
  if(n.textInput!==null&&n.imageInput!==null) {
    // The generic 2.6 rate card includes cached rates; the direct-API exclusion in the guide specifically names 2/2.5.
    const c=n.cacheRead, t=n.textInput, i=n.imageInput;
    if(c!==null&&c>t+i)return null;
    const full=(5*t+8*i)/MILLION;
    const lowRead=c??t+i, highRead=c??0;
    const maxImageRead=Math.min(i,lowRead), maxTextRead=Math.min(t,highRead);
    inputLow=full-(maxImageRead*6+(lowRead-maxImageRead)*3.75)/MILLION;
    inputHigh=full-(maxTextRead*3.75+(highRead-maxTextRead)*6)/MILLION;
  }
  const fullInput=n.textInput===null||n.imageInput===null?null:(5*n.textInput+8*n.imageInput)/MILLION;
  return {inputLow,inputHigh,outputLow:outUsd,outputHigh:outUsd,lowerUsd:plus(inputLow,outUsd),
    upperUsd:plus(inputHigh,outUsd),fullInputRateScenarioUsd:plus(fullInput,outUsd)};
}

const validSession=s=>/^sess_[a-zA-Z0-9_-]{1,128}$/.test(s);
const validTurn=s=>/^turn_[a-zA-Z0-9_-]{1,128}$/.test(s);
async function getExisting(path,key,fetchApi) {
  const resp=await fetchApi('https://api.openai.com/v1/agents/sessions/'+path,{
    method:'GET',headers:{Authorization:'Bearer '+key,'OpenAI-Beta':'agents=v1'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if(!resp.ok){await resp.body?.cancel();return {error:'GET_'+resp.status};}
  const reader=resp.body.getReader(), chunks=[];
  let length=0;
  try {
    for(;;) {
      const part=await reader.read();
      if(part.done)break;
      length+=part.value.length;
      if(length>2*1024*1024)throw Error('oversized receipt');
      chunks.push(part.value);
    }
    return {data:JSON.parse(Buffer.concat(chunks))};
  } finally { await reader.cancel().catch(()=>{}); }
}

function sameTotals(a,b) {
  return ['input','output','total','cacheRead','reasoning'].every(k=>a[k]===null||b[k]===null||a[k]===b[k]);
}
function quality(n) {
  if(!n)return -1;
  return (n.input!==null?8:0)+(n.output!==null?8:0)+(n.cacheRead!==null?4:0)+(n.total!==null?2:0)+(n.reasoning!==null?1:0);
}

/** Only reads the exact IDs persisted by the caller's existing study receipt. No session list or new turn. */
export async function readPlanReceipt({sid,turnId},key,fetchApi=fetch) {
  if(!validSession(sid)||turnId!=null&&!validTurn(turnId))throw Error('invalid_saved_ID');
  const session=await getExisting(sid,key,fetchApi);
  if(session.error)return {error:session.error};
  const s=session.data;
  if(s.id!==sid || s.agent?.model!==TERRA || s.environment?.type!=='none' || !Array.isArray(s.agent?.tools) || s.agent.tools.length ||
     s.agent?.multi_agent?.enabled===true)return {error:'unexpected_session_configuration'};
  const sessionUsage=usageNumbers(s.usage), ttl=s.prompt_cache_options?.ttl??null;
  const sessionRecord={source:'GET session',usage:s.usage??null,ttl};
  let turn, single=false;
  if(turnId){
    const retrieved=await getExisting(sid+'/turns/'+turnId,key,fetchApi);
    if(retrieved.error)return {error:retrieved.error};
    turn=retrieved.data;
    if(turn?.id!==turnId)return {error:'different_turn'};
  }else{
    const listed=await getExisting(sid+'/turns?limit=2&order=desc',key,fetchApi);
    if(listed.error)return {error:listed.error};
    const page=listed.data;
    if(page?.has_more!==false||!Array.isArray(page.data)||page.data.length!==1)return {error:'ambiguous_session_usage'};
    single=true;turn=page.data[0];
  }
  if(!validTurn(turn?.id)||turn.session_id!==sid||turn.subagent_id!==null)return {error:'different_turn'};
  const turnUsage=usageNumbers(turn.usage);
  const turnRecord={source:'GET turn',usage:turn.usage??null,ttl:turn.prompt_cache_options?.ttl??ttl};
  if(turnUsage&&sessionUsage&&!sameTotals(sessionUsage,turnUsage))
    return {...turnRecord,turnWarning:'session_and_turn_accounting_differ'};
  // A session can gain other turns. Its summary is attributable only when the one-turn scope is verified,
  // or when both non-null usage records account for exactly the same input and output totals.
  const sameCompleteTotals=turnUsage&&sessionUsage&&['input','output'].every(k=>turnUsage[k]!==null&&turnUsage[k]===sessionUsage[k]);
  if((single||sameCompleteTotals)&&quality(sessionUsage)>quality(turnUsage))
    return {...sessionRecord,ttl:turnRecord.ttl};
  return turnRecord;
}

export function aggregateCosts(rows) {
  const covered=rows.filter(r=>r.estimate?.lowerUsd!=null&&r.estimate?.upperUsd!=null);
  const knownOutput=rows.filter(r=>r.estimate?.outputLow!=null);
  const subtotalLowerUsd=sum(covered.map(r=>r.estimate.lowerUsd)), subtotalUpperUsd=sum(covered.map(r=>r.estimate.upperUsd));
  return {reserved:rows.length,fullyCovered:covered.length,knownOutputOperations:knownOutput.length,
    outputComponentSubtotalLowUsd:sum(knownOutput.map(r=>r.estimate.outputLow)),
    outputComponentSubtotalHighUsd:sum(knownOutput.map(r=>r.estimate.outputHigh)),
    knownInputOperations:rows.filter(r=>r.estimate?.inputLow!=null).length,
    inputComponentSubtotalLowUsd:sum(rows.map(r=>r.estimate?.inputLow??0)),
    inputComponentSubtotalHighUsd:sum(rows.map(r=>r.estimate?.inputHigh??0)),
    lowerForCoveredOperationsUsd:subtotalLowerUsd,upperForCoveredOperationsUsd:subtotalUpperUsd,
    modelCostRangeUsd:covered.length===rows.length?{low:subtotalLowerUsd,high:subtotalUpperUsd}:null};
}

export async function costSnapshot(root,round,{key=null,fetchApi=fetch}={}) {
  assert.ok(round===null||Number.isInteger(round)&&round>=0&&round<=5,'invalid round');
  const protocol=JSON.parse(readFileSync(join(root,'protocol.json'),'utf8'));
  const db=new DatabaseSync(join(root,'receipts.sqlite'),{readOnly:true});
  let rows;
  try {
    db.exec('BEGIN');
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding,fingerprint(protocol),'protocol mismatch');
    rows=db.prepare('SELECT id,kind,state,result FROM calls ORDER BY id').all();
  } finally {db.close();}
  const output=[];
  let readStop=null;
  for(const row of rows) {
    const [r,caseId,arm,part,...rest]=row.id.split('/');
    assert.ok(/^[0-5]$/.test(r)&&protocol.caseIds.includes(caseId)&&ARMS.has(arm)&&rest.length===0,'off-roster receipt');
    if(round!==null&&Number(r)!==round)continue;
    const data=JSON.parse(row.result), isPlan=row.kind==='plan';
    assert.ok(isPlan?part==='plan':row.kind==='image'&&/^[1-3]$/.test(part),'invalid operation');
    const record={id:row.id,kind:row.kind,state:row.state,model:isPlan?TERRA:data.model??null,
      source:'frozen study receipt',reconciliation:null};
    let raw=data.usage, ttl=null;
    if(key && isPlan && data.sid && readStop===null) {
      let fresh;
      try {fresh=await readPlanReceipt(data,key,fetchApi);}catch{fresh={error:'GET_unavailable'};}
      if(fresh.error){
        record.reconciliation=fresh.error;
        if(['GET_401','GET_403','GET_429'].includes(fresh.error))readStop=fresh.error;
      }
      else {
        if(usageNumbers(fresh.usage)) {
          raw=fresh.usage;
          record.source=fresh.source;
          ttl=fresh.ttl;
        }
        record.reconciliation=fresh.turnError??fresh.turnWarning??'verified-existing-session';
      }
    }
    if (key && isPlan && data.sid && record.reconciliation===null && readStop) record.reconciliation='not-read-after-'+readStop;
    record.usage=usageNumbers(raw);
    record.estimate=isPlan?terraRange(raw,ttl):record.model===FLARE?flareRange(raw):null;
    output.push(record);
  }
  return {asOf:new Date().toISOString(),round,mode:key?'existing-resource-GET':'local-read-only',sources,
    assumptions:{modelRates:'Global Standard, no background window, regional premium, account discount, or taxes',
      agentEnvironment:'Frozen request has no tools, subagents or sandbox',scope:'Model cost of reserved operations observed through this snapshot',
      guideCacheLimitation:'The direct image-cache exclusion explicitly names GPT-Image-2 and 2.5. Both 2.6 cache scenarios are exposed.',
      bill:'Unavailable',judges:'Separate ChatGPT judge invocations excluded'},
    byKind:Object.fromEntries(['plan','image'].map(kind=>[kind,aggregateCosts(output.filter(r=>r.kind===kind))])),
    total:aggregateCosts(output),operations:output};
}
const ARMS=new Set(['with','without']);
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [root,round,mode,...rest]=process.argv.slice(2);
  assert.ok(root && (round==='all'||/^[0-5]$/.test(round)) && !rest.length && (mode===undefined||mode==='--refresh-stdin'),
    'usage: provider-usage.mjs EVIDENCE_ROOT ROUND_0_TO_5_OR_all [--refresh-stdin]');
  let key=null;
  if(mode) {
    assert.ok(!process.stdin.isTTY,'key input requires a pipe');
    const bytes=readFileSync(0);
    try {if(bytes.length<=4096)key=bytes.toString('utf8').trim();}finally{bytes.fill(0);}
    assert.ok(typeof key==='string'&&/^sk-[A-Za-z0-9_-]{20,300}$/.test(key),'invalid credential source');
  }
  const result=await costSnapshot(resolve(root),round==='all'?null:Number(round),{key});
  console.log(JSON.stringify(result,null,2));
}

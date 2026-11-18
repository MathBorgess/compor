import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const counters=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens'];
function* logs(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=join(dir,entry.name);
    if(entry.isDirectory())yield* logs(file);
    else if(entry.isFile()&&/^(?:judge-)?events\.jsonl$/.test(entry.name))yield file;
  }
}

/** Aggregate only completed, metered CLI turns. Cached input and reasoning output are subsets. */
export function countJudgeUsage(roots){
  const observed=new Map(),unclosed=new Set();
  let traces=0;
  for(const root of roots){
    for(const file of logs(root)){
      traces++;
      const rows=readFileSync(file,'utf8').split('\n').filter(line=>line.startsWith('{')).map(s=>JSON.parse(s));
      const threads=rows.filter(e=>e.type==='thread.started').map(e=>e.thread_id);
      if(threads.length!==1||typeof threads[0]!=='string')throw Error('invalid_judge_thread');
      const turns=rows.filter(e=>e.type==='turn.completed');
      if(!turns.length){unclosed.add(threads[0]);continue;}
      turns.forEach((turn,i)=>{
        const key=threads[0]+'/'+i;
        const values=Object.fromEntries(counters.map(k=>[k,Number.isSafeInteger(turn.usage?.[k])&&turn.usage[k]>=0?turn.usage[k]:null]));
        if(observed.has(key)&&JSON.stringify(observed.get(key))!==JSON.stringify(values))throw Error('judge_usage_conflict');
        observed.set(key,values);
      });
    }
  }
  const coverage={};
  for(const k of counters){
    const counts=[...observed.values()].map(u=>u[k]).filter(v=>v!==null);
    coverage[k]={observedSubtotal:counts.reduce((sum,n)=>sum+n,0),meteredTurns:counts.length};
  }
  return {traces,uniqueCompletedTurns:observed.size,unclosedTraces:unclosed.size,coverage,amountUsd:null,
    billing:'Codex CLI via ChatGPT. Token counts cover archived turn events only. The subscription does not report a USD charge per turn.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length<3)throw Error('provide_study_directories');
  console.log(JSON.stringify(countJudgeUsage(process.argv.slice(2)),null,2));
}

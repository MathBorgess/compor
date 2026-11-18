import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {countJudgeUsage} from './judge-usage.mjs';

test('duplicate traces count a metered turn once and never turn a subscription into a USD charge',t=>{
  const root=mkdtempSync(join(tmpdir(),'compor-judge-usage-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const events=[{type:'thread.started',thread_id:'synthetic-session'},
    {type:'turn.completed',usage:{input_tokens:90,cached_input_tokens:50,output_tokens:20}}];
  for(const name of ['judge-a','copy']){
    const dir=join(root,name);mkdirSync(dir);
    writeFileSync(join(dir,'events.jsonl'),events.map(v=>JSON.stringify(v)).join('\n'));
  }
  const total=countJudgeUsage([root]);
  assert.equal(total.uniqueCompletedTurns,1);
  assert.equal(total.coverage.input_tokens.observedSubtotal,90);
  assert.equal(total.coverage.reasoning_output_tokens.meteredTurns,0);
  assert.equal(total.amountUsd,null);
});

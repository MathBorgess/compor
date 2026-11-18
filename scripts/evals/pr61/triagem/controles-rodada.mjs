import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {createManagedExplorationPlanProvider} from '../../../../packages/agents-api/src/exploration-plan-provider.mjs';
import {cases,packet} from './corpus.mjs';

const directory=mkdtempSync(join(tmpdir(),'compor-pr61-eval34-controles-'));
const index=join(directory,'index.json');
const replay=fileURLToPath(new URL('./replay-rodada.mjs',import.meta.url));
const rows=[];
for(const {id} of cases){
  const {context,visualInput,referenceImages}=packet(id);
  let content;
  const provider=createManagedExplorationPlanProvider({
    apiKey:'sk-synthetic-transport-control-only',
    fetch:async (_url,options)=>{
      assert.equal(options.method,'POST');
      const request=JSON.parse(options.body);
      assert.deepEqual(request.agent.tools,[]);
      content=request.input[0].content;
      return Response.json({id:'sess_fixture'});
    },
  });
  await provider.create({context,visualInput,referenceImages});
  assert.deepEqual(JSON.parse(content[0].text),{context,visualInput});
  assert.equal(content.length,1+2*referenceImages.length);
  for(const [index,image] of referenceImages.entries()){
    const entry=visualInput.entries[index];
    assert.ok(content[1+index*2].text.includes('('+entry.inputOrigin+'): '+entry.id));
    assert.equal(content[2+index*2].image_url,'data:'+image.mime+';base64,'+image.data);
  }
  const items=[1,2,3].map(position=>({position,creativePrompt:'Controle fixo '+position,composition:'Composição '+position,contrast:'Contraste '+position,differenceFromOthers:'Comparação '+position}));
  const referenceIds=visualInput.entries.filter(entry=>entry.inputOrigin==='local-upload').map(entry=>entry.id);
  const plan=validateExplorationPlan({version:2,referenceIds,items},context,visualInput);
  assert.ok(plan);rows.push({id,plan,slots:items.map(({position})=>({position,state:'unobserved'}))});
}
writeFileSync(index,JSON.stringify(rows));
const output=JSON.parse(execFileSync(process.execPath,[replay,index]));
assert.equal(output.length,5);
assert.ok(output.every(row=>row.completed===0&&row.planValid&&row.slots.every(s=>s.delivered===null)));
for(const [name,mutate] of Object.entries({
  'upload removido':s=>{s.plan.referenceIds=[];},
  'slot repetido':s=>{s.slots[2].position=1;},
  'prompt final alterado':s=>{s.plan.items[0].prompt='Troca';},
  'anexo divergente':s=>{s.slots[0].delivered=[{id:'estranho',sha256:'0'.repeat(64)}];},
})){
  const modified=structuredClone(rows);mutate(modified[0]);const invalid=join(directory,name+'.json');
  writeFileSync(invalid,JSON.stringify(modified));assert.notEqual(spawnSync(process.execPath,[replay,invalid]).status,0,name);
}
for(const n of [3,4]){
  const subset=join(directory,'subset-'+n+'.json');writeFileSync(subset,JSON.stringify(rows.slice(0,n)));
  assert.equal(JSON.parse(execFileSync(process.execPath,[replay,subset])).length,n);
}
for(const group of [rows.slice(0,2),[...rows,rows[0]],[rows[0],rows[0],rows[2]],[rows[0],rows[1],{...rows[2],id:'fora'}]]){
  const path=join(directory,'grupo-invalido.json');
  writeFileSync(path,JSON.stringify(group));assert.notEqual(spawnSync(process.execPath,[replay,path]).status,0);
}
const partial=structuredClone(rows);
partial[0]={id:partial[0].id,plan:null,slots:[1,2,3].map(position=>({position,state:'not_submitted'}))};
const partialIndex=join(directory,'partial.json');
writeFileSync(partialIndex,JSON.stringify(partial));
const partialResults=JSON.parse(execFileSync(process.execPath,[replay,partialIndex]));
assert.equal(partialResults.filter(item=>item.planValid===true).length,4);
assert.ok(partialResults[0].slots.every(slot=>slot.delivered===null&&slot.state==='not_submitted'));
assert.equal(JSON.parse(readFileSync(index)).length,5);
console.log(JSON.stringify({fixture:'fixed-transport-controls',positiveCases:5,plannerInputAttachments:20,negativeControlsRejected:4,validGroupSizes:[3,4,5],invalidGroupsRejected:4,modelPlans:0,newImages:0,index}));

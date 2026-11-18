import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {cases,packet} from './corpus.mjs';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {parseSelectedVisualInput} from '../../../../packages/agents-api/src/visual-input.mjs';

const file=process.argv[2];
const entries=JSON.parse(readFileSync(file));
const complete=state=>state==='complete'||state==='completed';
const ids=entries.map(item=>item.id);
assert.ok(ids.length>=3&&ids.length<=5,'O lote de avaliação exige de três a cinco casos');
assert.equal(new Set(ids).size,ids.length,'Caso duplicado');
const corpusIds=new Set(cases.map(item=>item.id));
assert.ok(ids.every(id=>corpusIds.has(id)),'Caso fora do corpus');
const output=[];
for(const entry of entries){
  const {context,visualInput,referenceImages}=packet(entry.id);
  assert.deepEqual(entry.slots.map(slot=>slot.position).sort(),[1,2,3]);
  if(!entry.plan){
    assert.ok(entry.slots.every(slot=>!complete(slot.state)));
    output.push({id:entry.id,planValid:null,completed:0,delivery:null,slots:entry.slots.map(s=>({position:s.position,state:s.state,delivered:null}))});
    continue;
  }
  assert.ok(validateCompletedExplorationPlan(entry.plan,context,visualInput),'Plano inválido em '+entry.id);
  const chosen=referenceImages.filter(image=>entry.plan.referenceIds.includes(image.id));
  const selected=parseSelectedVisualInput(visualInput,chosen,entry.plan.referenceIds);
  const attachments=selected.referenceImages.map(image=>({id:image.id,sha256:createHash('sha256').update(Buffer.from(image.data,'base64')).digest('hex')}));
  const slots=entry.slots.map(slot=>{
    if(slot.delivered)assert.deepEqual(slot.delivered,attachments,'Anexos divergentes de '+entry.id);
    if(complete(slot.state)){
      assert.equal(createHash('sha256').update(readFileSync(resolve(dirname(file),slot.path))).digest('hex'),slot.sha256);
    }
    return {position:slot.position,state:slot.state,delivered:slot.delivered?true:null};
  });
  output.push({id:entry.id,planValid:true,completed:slots.filter(s=>complete(s.state)).length,selected:attachments.length,expectedInputBytes:chosen.reduce((n,img)=>n+Buffer.byteLength(img.data,'base64'),0),slots});
}
console.log(JSON.stringify(output,null,2));

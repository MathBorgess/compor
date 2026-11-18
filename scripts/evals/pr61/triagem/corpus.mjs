import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateExplorationContext} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {parseVisualInput} from '../../../../packages/agents-api/src/visual-input.mjs';

const corpus = new URL('./corpus/', import.meta.url);
export const cases = JSON.parse(readFileSync(new URL('casos.json',corpus)));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
const hash = b => createHash('sha256').update(b).digest('hex');
const origins = {marca:'local-upload',layout:'generated',paleta:'external',listras:'external',pontos:'external'};

export function packet(caseId) {
  const index=cases.findIndex(item=>item.id===caseId);
  assert.ok(index>=0,'Caso desconhecido');
  const item=cases[index];
  const {idea,offer,audience,goal,direction}=item;
  const context={idea,offer,audience,goal,direction,offerFacts:item.facts.map(([label,value],i)=>({id:'fact-'+(i+1),label,value,status:'confirmed'})),accepted:[],rejected:[],feedback:[]};
  const entries=[], referenceImages=[];
  for (const [i,ref] of item.refs.entries()) {
    const bytes=readFileSync(new URL(ref+'.png',corpus));
    const inputOrigin=item.uploads?.includes(ref)?'local-upload':origins[ref.split('-')[1]];
    const referenceId=id(100*index+i+1);
    const original={mime:'image/png',byteLength:bytes.length,sha256:hash(bytes)};
    const source=inputOrigin==='local-upload'?null:inputOrigin==='generated'?{projectId:id(900+index),imageId:referenceId}:{originUrl:'https://www.pinterest.com/pin/'+String(9000+100*index+i)+'/',board:'corpus/visual'};
    entries.push({id:referenceId,ordinal:i+1,role:'reference',inputOrigin,source,original,transport:{...original,width:32,height:32},transformation:'none'});
    referenceImages.push({id:referenceId,mime:'image/png',data:bytes.toString('base64')});
  }
  const visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries};
  assert.ok(validateExplorationContext(context));
  parseVisualInput(visualInput,referenceImages);
  const rubric={split:item.split,attributes:item.attributes,allowedCopy:item.copy,format:item.viewport};
  return {id:caseId,context,visualInput,referenceImages,rubric};
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  console.log(JSON.stringify(process.argv[2]?packet(process.argv[2]):cases.map(item=>packet(item.id)),null,2));
}

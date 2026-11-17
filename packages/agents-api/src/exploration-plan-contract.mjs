import {validateVisualInputManifest,validateVisualReferenceSelection} from './visual-input-contract.mjs';
const object=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const safe=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|sk-[^\s]+/i.test(value);
const text=(value,max)=>safe(value,max)&&value.trim().length>0;

export function validateExplorationContext(context){
 if(!exact(context,['idea','offer','audience','goal','direction','offerFacts','accepted','rejected','feedback'])||!safe(context.idea,4000)||!safe(context.offer,4000)||!safe(context.audience,2000)||!safe(context.goal,2000)||!safe(context.direction,2000)||!Array.isArray(context.offerFacts)||context.offerFacts.length>20)return false;
 if(!context.idea.trim()&&!context.offer.trim()&&!context.direction.trim())return false;
 if(!['accepted','rejected'].every(k=>Array.isArray(context[k])&&context[k].length<=8&&context[k].every(v=>text(v,1000))))return false;
 if(!Array.isArray(context.feedback)||context.feedback.length>8||!context.feedback.every(f=>exact(f,['action','comment','composition','contrast'])&&['selected','rejected','comment'].includes(f.action)&&['comment','composition','contrast'].every(k=>safe(f[k],1000))))return false;
 return context.offerFacts.every(f=>exact(f,['id','label','value','status'])&&text(f.id,100)&&text(f.label,100)&&safe(f.value,4000)&&['confirmed','pending','omitted'].includes(f.status))&&new Set(context.offerFacts.map(f=>f.id.toLowerCase())).size===context.offerFacts.length;
}
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function validateExplorationPlan(value,context,visualInput){
 if(visualInput!==undefined&&!validateVisualInputManifest(visualInput))return null;
 const triaged=visualInput?.version===2;
 if(!validateExplorationContext(context)||!exact(value,['version','items',...(triaged?['referenceIds']:[])])||value.version!==(triaged?2:1)||!Array.isArray(value.items)||value.items.length!==3)return null;
 if(triaged&&!validateVisualReferenceSelection(visualInput,value.referenceIds))return null;
 const positions=new Set(),prompts=new Set(),compositions=new Set(),contrasts=new Set();
 for(const item of value.items){
  if(!exact(item,['position','creativePrompt','composition','contrast','differenceFromOthers'])||!Number.isInteger(item.position)||item.position<1||item.position>3||positions.has(item.position)||!text(item.creativePrompt,4000)||!text(item.composition,300)||!text(item.contrast,300)||!text(item.differenceFromOthers,500))return null;
  positions.add(item.position);const normalized=normalize(item.creativePrompt),composition=normalize(item.composition),contrast=normalize(item.contrast);if(prompts.has(normalized)||compositions.has(composition)||contrasts.has(contrast))return null;prompts.add(normalized);compositions.add(composition);contrasts.add(contrast);
 }
 const facts=context.offerFacts.filter(f=>f.status==='confirmed').map(({label,value})=>({label,value}));
 // The block is application-owned. Structural checks cannot establish that the
 // model did not invent or contradict a fact elsewhere in free text.
 const plan={version:triaged?2:1,items:[...value.items].sort((a,b)=>a.position-b.position).map(item=>({...item,prompt:`${item.creativePrompt}\n\nFatos declarados obrigatórios (preserve literalmente; não invente fatos):\n${facts.length?facts.map(f=>`${f.label}: ${f.value}`).join('\n'):'Nenhum fato confirmado.'}`})),...(triaged?{referenceIds:[...value.referenceIds]}:{})};
 return plan.items.every(item=>item.prompt.length<=8000)?plan:null;
}


/** Validate a stored completed plan, including its application-owned fact block. */
export function validateCompletedExplorationPlan(plan,context,visualInput){
 try{
  const triaged=visualInput?.version===2;
  if(!exact(plan,['version','items',...(triaged?['referenceIds']:[])])||!Array.isArray(plan.items))return false;
  const items=plan.items.map(item=>{if(!exact(item,['position','creativePrompt','composition','contrast','differenceFromOthers','prompt']))throw Error('invalid');const rest={...item};delete rest.prompt;return rest;});
  const expected=validateExplorationPlan({version:plan.version,items,...(triaged?{referenceIds:plan.referenceIds}:{})},context,visualInput);
  return Boolean(expected)&&expected.items.every((item,i)=>Object.keys(item).every(key=>item[key]===plan.items[i][key]));
 }catch{return false;}
}

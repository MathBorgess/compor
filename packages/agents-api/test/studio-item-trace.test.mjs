import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeStudioItems} from '../src/studio-item-trace.mjs';
const projectId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',turnId='turn_verified';
const secret='sk-private_do_not_expose_abcdefghijklmnopqrstuvwxyz',story='PRIVATE_STORY_WITH_PERSONAL_INFORMATION';
const args={projectId,requestId,revision:3,field:'offer',value:story};
test('trace contém apenas nomes permitidos, chaves conhecidas e validade sem valores criativos',()=>{
 const items=[
  {type:'function_call',turn_id:turnId,call_id:'call_one',status:'completed',name:'functions.compor_editar_briefing',arguments:JSON.stringify(args)},
  {type:'function_call_output',turn_id:turnId,call_id:'call_one',status:'failed',error:`Tool unavailable: ${secret} ${story}`,output:story},
  {type:'function_call',turn_id:turnId,call_id:'call_two',status:secret,name:secret,arguments:{...args,[secret]:story}},
  {type:'function_call_output',turn_id:turnId,call_id:'call_two',status:'incomplete',output:`Request timed out ${secret} ${story}`},
  {type:'function_call_output',turn_id:turnId,call_id:'call_three',status:'completed',output:`Story says timeout ${story} ${secret}`},
  {type:'function_call_output',turn_id:turnId,call_id:'call_one',status:'completed',output:JSON.stringify({error:{code:'tool_unavailable',message:story},story,secret})},
  {type:'function_call',turn_id:'turn_other',call_id:'call_ignored',name:'generate_image',arguments:{prompt:story}},
 ];
 const trace=summarizeStudioItems(items,{projectId,turnId});assert.equal(trace.observedItems,6);assert.equal(trace.functionCalls,2);assert.equal(trace.outputs,4);
 assert.deepEqual(trace.items[0],{type:'function_call',status:'completed',name:'functions.compor_editar_briefing',callIdAccepted:true,argumentKeys:['field','projectId','requestId','revision','value'],unknownArgumentKeyCount:0,argumentsParsed:true,requestIdUuid:true,projectMatches:true,revisionIsInteger:true,schemaValid:true});
 assert.equal(trace.items[1].errorClass,'unavailable');assert.equal(trace.items[2].status,'other');assert.equal(trace.items[2].name,null);assert.equal(trace.items[2].unknownArgumentKeyCount,1);assert.equal(trace.items[2].schemaValid,false);assert.equal(trace.items[3].errorClass,'timeout');assert.equal(trace.items[4].errorClass,'none');
 assert.equal(trace.items[5].errorClass,'unavailable');
 assert.doesNotMatch(JSON.stringify(trace),/sk-private|PRIVATE_STORY|call_one|call_two|11111111|22222222/);
});
test('callIdAccepted reproduz o identificador aceito pelo action guard sem expor seu valor',()=>{
 const samples=[['call_one',true],['call_'+ 'a'.repeat(128),true],['call_'+ 'a'.repeat(129),false],['call_',false],['CALL_one',false],['turn_one',false],[null,false],['call_sk-secret',false],['call_'+story,true]];
 for(const [call_id,accepted]of samples){
  const trace=summarizeStudioItems([{type:'function_call',turn_id:turnId,call_id,status:'failed',name:'compor_contexto',arguments:{projectId,requestId}},{type:'function_call_output',turn_id:turnId,call_id,status:'failed',error:story}],{projectId,turnId});
  assert.ok(trace.items.every(item=>item.callIdAccepted===accepted));assert.doesNotMatch(JSON.stringify(trace),/PRIVATE_STORY|call_one|sk-secret/);
 }
});
test('sinais de falha são somente booleans fechados e não afirmam a causa',()=>{
 const cases=[['Tool returned no response','noResponse'],['Tool result expired','expired'],['Malformed arguments','invalidOrMalformed'],['Access denied','permissionDenied'],['Call was interrupted','interrupted'],['internal_server_error','providerInternal']];
 for(const [error,key]of cases){
  const trace=summarizeStudioItems([{type:'function_call_output',turn_id:turnId,status:'failed',error:`${error}: ${secret} ${story}`}],{projectId,turnId});
  assert.deepEqual(trace.items[0].errorSignals,Object.fromEntries(['noResponse','expired','invalidOrMalformed','permissionDenied','interrupted','providerInternal'].map(name=>[name,name===key])));assert.doesNotMatch(JSON.stringify(trace),/sk-private|PRIVATE_STORY|Malformed arguments|internal_server_error/);
 }
 const missing=summarizeStudioItems([{type:'function_call_output',turn_id:turnId,status:'completed',output:story}],{projectId,turnId});assert.ok(Object.values(missing.items[0].errorSignals).every(value=>value===false));
});
test('sinais respeitam o limite de leitura e ignoram conteúdo criativo bem sucedido',()=>{
 const values=[{status:'failed',error:'x'.repeat(8192)+' permission denied'},{status:'completed',output:'no response expired malformed forbidden interrupted internal error '+story},{status:'failed',error:story}];
 const trace=summarizeStudioItems(values.map(item=>({type:'function_call_output',turn_id:turnId,...item})),{projectId,turnId});assert.ok(trace.items.every(item=>Object.values(item.errorSignals).every(value=>value===false)));assert.doesNotMatch(JSON.stringify(trace),/PRIVATE_STORY|permission denied/);
 const structured=summarizeStudioItems([{type:'function_call_output',turn_id:turnId,status:'completed',output:JSON.stringify({error:{code:'invalid_request',message:'no response; token expired; permission denied; interrupted; provider error '+secret},story})}],{projectId,turnId});assert.ok(Object.values(structured.items[0].errorSignals).every(value=>value===true));assert.doesNotMatch(JSON.stringify(structured),/sk-private|PRIVATE_STORY/);
});
test('trace falha fechado para JSON inválido, nomes parecidos e argumentos inválidos',()=>{
 const values=[{name:'compor_contexto',arguments:secret},{name:'functions.compor_contexto.evil',arguments:args},{name:'compor_contexto',arguments:{projectId:'other',requestId:secret,revision:'3'}},{name:'generate_image',arguments:{prompt:secret}},{name:'functions.generate_image',arguments:{prompt:'Synthetic image'}}];
 const trace=summarizeStudioItems(values.map((item,index)=>({type:'function_call',turn_id:turnId,call_id:`call_${index}`,status:'completed',...item})),{projectId,turnId});
 assert.equal(trace.items[0].argumentsParsed,false);assert.equal(trace.items[1].name,null);assert.equal(trace.items[2].projectMatches,false);assert.equal(trace.items[2].requestIdUuid,false);assert.equal(trace.items[2].revisionIsInteger,false);assert.deepEqual(trace.items.map(item=>item.schemaValid),[false,false,false,false,true]);assert.doesNotMatch(JSON.stringify(trace),/sk-private|Synthetic image/);
});
test('trace limita itens e não serializa saídas ou status desconhecidos',()=>{
 const trace=summarizeStudioItems(Array.from({length:100},()=>({type:'function_call_output',turn_id:turnId,status:story,error:secret,output:{story}})),{projectId,turnId});
 assert.equal(trace.items.length,24);assert.equal(trace.omittedItems,76);assert.ok(trace.items.every(item=>item.status==='other'&&item.name===null&&item.errorClass==='other'));assert.doesNotMatch(JSON.stringify(trace),/sk-private|PRIVATE_STORY/);
});

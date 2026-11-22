import test from 'node:test';
import assert from 'node:assert/strict';
import {compileArtworkPrompt} from '../src/artwork-input.mjs';
import {createSessionBindings} from '../src/session-binding.mjs';
import {createImageToolApproval,createImageToolExecution} from '../src/image-tool-execution.mjs';

const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),pieceId=id(3),attemptId=id(4),assetId=id(5),reservationId=id(6),executionId=id(7);
const actor={userId,token:'synthetic-token'},apiKey=`sk-${'x'.repeat(30)}`;
const proposal={prompt:'Arte de teste',operation:'create',baseImageId:null,referenceIds:[]};
function packet(length) {
 const fields=Array.from({length:20},(_,n)=>({id:id(100+n),label:`Campo ${String(n).padStart(2,'0')} ${'L'.repeat(65)}`,value:'a',origin:'user'}));
 const input={literalText:{headline:'Título\n"especial" 🖌️',price:'',date:'',fields},source:null,images:[]};
 let remaining=length-compileArtworkPrompt(proposal,input).length;
 for(const field of fields){const count=Math.min(499,remaining);field.value='a'+'x'.repeat(count);remaining-=count;}
 assert.equal(remaining,0);assert.equal(compileArtworkPrompt(proposal,input).length,length);
 return input;
}

test('orçamento do prompt compilado é aplicado antes de reservar ou gerar, sem truncar',async()=>{
 const bindings=createSessionBindings({secret:Buffer.alloc(32,6)});
 const actionBinding=bindings.issueAction({userId,projectId,attemptId,sessionId:'sess_a',turnId:'turn_a',callId:'call_a',proposal});
 const calls=[],ownsVersion=async()=>true;
 const approve=createImageToolApproval({bindings,ownsVersion});
 const execute=createImageToolExecution({bindings,ownsVersion,appOrigin:'https://example.test',
  fetch:async()=>{calls.push('lookup');return Response.json({id:'sess_a',status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:'call_a',arguments:proposal}]});},
  reservations:{reserve:async()=>{calls.push('reserve');return{id:reservationId,state:'reserved'};},declareConsent:async()=>{calls.push('consent');},claimExecution:async()=>{calls.push('claim');return{id:executionId,assetId,state:'running',isNew:true};},completeExecution:async()=>{calls.push('complete');},markExecutionUnknown:async()=>{calls.push('unknown');}},
  usage:{start:async()=>{calls.push('usage');return true;},finish:async()=>{calls.push('usage-finish');}},
  imageHandler:async request=>{calls.push('image');assert.equal((await request.json()).prompt,compileArtworkPrompt(proposal,packet(8000)));return Response.json({imageBase64:Buffer.from('synthetic-image').toString('base64')});},
  imageStorageHandler:async()=>Response.json({status:'stored',assetId}),
 });
 for(const length of [8000,8001,12000]){
  const artworkInput=packet(length),base={actor,projectId,pieceId,version:1,attemptId,explicitApproval:true,artworkInput};
  const proof=await approve({...base,actionBinding});assert.ok(proof);
  calls.length=0;const result=await execute({...base,actionBinding:proof,apiKey});
  if(length===8000){assert.equal(result.status,'completed');assert.ok(calls.includes('image'));assert.ok(calls.includes('reserve'));}
  else {assert.deepEqual(result,{status:'invalid_prompt'});assert.deepEqual(calls,['lookup']);}
 }
});

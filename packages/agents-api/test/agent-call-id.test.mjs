import test from 'node:test';
import assert from 'node:assert/strict';
import {isAgentCallId} from '../src/agent-call-id.mjs';
import {createSessionBindings} from '../src/session-binding.mjs';
import {createStudioBindings} from '../src/studio-chat-bindings.mjs';
import {pendingImageAction} from '../src/index.mjs';
import {describePendingImageCall,imageResultUnknown} from '../src/image-tool-contract.mjs';
const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',attemptId='33333333-3333-4333-8333-333333333333',pieceId='44444444-4444-4444-8444-444444444444',requestId='55555555-5555-4555-8555-555555555555';
const callId='exec_'+ 'a'.repeat(56),sessionId='sess_synthetic',turnId='turn_synthetic',prompt='Synthetic image';
test('call IDs aceitam apenas famílias conhecidas e sufixos limitados, sem normalização',()=>{
 for(const prefix of ['call','exec'])for(const suffix of ['a','A-b_c9','a'.repeat(128)])assert.equal(isAgentCallId(`${prefix}_${suffix}`),true);
 for(const value of [null,undefined,3,{},'','call_','exec_','tool_a','EXEC_a','prefix_exec_a','exec_'+ 'a'.repeat(129),'call_a\n','exec_a b','exec_a/b','exec_sk-private'])assert.equal(isAgentCallId(value),false);
});
test('HMACs de sessão, aprovação e ação preservam exec e recusam troca de actor ou ID',()=>{
 const bindings=createSessionBindings({secret:Buffer.alloc(32,5)}),studio=createStudioBindings({secret:Buffer.alloc(32,5)});
 const context={userId,projectId,attemptId,sessionId,turnId,callId,prompt};
 const token=bindings.issueAction(context),action=bindings.verifyAction({token,userId,projectId,attemptId});assert.equal(action.callId,callId);
 const approved=bindings.issueApprovedAction({actionBinding:token,userId,projectId,attemptId,pieceId,version:1});assert.equal(bindings.verifyApprovedAction({token:approved,userId,projectId,attemptId,pieceId,version:1}).callId,callId);
 assert.equal(bindings.verifyApprovedAction({token:approved,userId:pieceId,projectId,attemptId,pieceId,version:1}),null);
 assert.equal(bindings.verifyAction({token,userId,projectId:pieceId,attemptId}),null);
 const parts=token.split('.'),payload=JSON.parse(Buffer.from(parts[1],'base64url'));payload.callId='call_'+ 'a'.repeat(56);parts[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');assert.equal(bindings.verifyAction({token:parts.join('.'),userId,projectId,attemptId}),null);
 const proof=studio.issue({...context,requestId,name:'compor_contexto',args:{projectId,requestId}});assert.equal(studio.verify({token:proof,userId,projectId,requestId}).callId,callId);assert.equal(studio.verify({token:proof,userId:pieceId,projectId,requestId}),null);
 for(const invalid of ['opaque','exec_','exec_'+ 'x'.repeat(129),'exec_sk-secret']){assert.throws(()=>bindings.issueAction({...context,callId:invalid}));assert.throws(()=>studio.issue({...context,callId:invalid,requestId,name:'compor_contexto',args:{}}));}
});
test('contratos de imagem mantêm o exec exato recebido da sessão verificada',()=>{
 const action={type:'function_call',name:'generate_image',turn_id:turnId,call_id:callId,arguments:{prompt}},session={id:sessionId,status:'requires_action',required_actions:[action]};
 assert.equal(pendingImageAction(session,'sk-synthetic_private_key').callId,callId);
 const binding={userId,projectId,pieceId,version:1,attemptId,sessionId},event={type:'agent.session.requires_action',session};const call=describePendingImageCall({event,binding,explicitApproval:true});assert.equal(call.callId,callId);assert.equal(imageResultUnknown(call).call_id,callId);
 const bad={...session,required_actions:[{...action,call_id:'tool_unsupported'}]};assert.throws(()=>pendingImageAction(bad,'sk-synthetic_private_key'));assert.equal(describePendingImageCall({event:{...event,session:bad},binding,explicitApproval:true}),null);
});

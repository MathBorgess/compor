import test from 'node:test';
import assert from 'node:assert/strict';
import {recordStudioEvent} from '../src/studio-telemetry.mjs';

function capture(fn){const original=console.info,rows=[];console.info=value=>rows.push(JSON.parse(value));try{fn();return rows;}finally{console.info=original;}}
test('studio logs correlate bounded technical IDs and observed usage without content',()=>{
 const metadata={requestId:'11111111-1111-4111-8111-111111111111',attemptId:'22222222-2222-4222-8222-222222222222',sessionId:'sess_test',turnId:'turn_test',callId:'exec_test',model:'gpt-6.1-terra',turnStatus:'waiting',phase:'action_validate',durationMs:12,providerStatusCode:200,inputTokens:10,outputTokens:2,callIdAccepted:true,apiKey:'sk-SECRET',actor:{token:'PRIVATE_JWT'},projectId:'PRIVATE_PROJECT',userId:'PRIVATE_PERSON',arguments:{content:'PRIVATE_CREATIVE'},error:{message:'PRIVATE_ERROR'},text:'PRIVATE_TEXT',url:'https://private.invalid/?token=PRIVATE_TOKEN'};
 const rows=capture(()=>recordStudioEvent('action_received',metadata));
 assert.deepEqual(rows,[{event:'compor.studio',name:'action_received',requestId:metadata.requestId,attemptId:metadata.attemptId,sessionId:'sess_test',turnId:'turn_test',callId:'exec_test',phase:'action_validate',turnStatus:'waiting',model:'gpt-6.1-terra',durationMs:12,inputTokens:10,outputTokens:2,providerStatusCode:200,callIdAccepted:true}]);
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|SECRET|apiKey|actor|arguments|projectId|userId|url/);
});
test('unknown names and fields never become log text, and logging failure has no effect',()=>{
 const rows=capture(()=>{
  recordStudioEvent('PRIVATE_TEXT');
  recordStudioEvent('unknown',{sessionId:'sess_sk-SECRET',callId:'exec_sk-SECRET',turnId:'turn_private bad',requestId:'PRIVATE_UUID',attemptId:'PRIVATE_UUID',phase:'PRIVATE_PHASE',model:'PRIVATE_MODEL',turnStatus:'PRIVATE_STATUS',durationMs:Infinity,inputTokens:-1,outputTokens:100000001,providerStatusCode:999,callIdAccepted:'PRIVATE_FLAG',errorCode:'PRIVATE_ERROR'});
 });
 assert.deepEqual(rows,[{event:'compor.studio',name:'unknown'}]);
 const original=console.info;console.info=()=>{throw Error('sink failure');};try{assert.doesNotThrow(()=>recordStudioEvent('turn_observed',{}));}finally{console.info=original;}
});

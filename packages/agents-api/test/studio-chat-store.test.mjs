import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioStore} from '../src/studio-chat-store.mjs';
const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const context={actor:{userId,token:'user-jwt'},projectId,requestId};
const metadata={owner_id:userId,project_id:projectId,request_id:requestId,attempt_id:requestId,state:'starting',input_digest:'a'.repeat(64)};
test('metadados usam token do usuário e RPCs sem transportar conteúdo criativo',async()=>{
 const calls=[];const store=createStudioStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:async(url,init)=>{calls.push({url:String(url),...init});return Response.json({status:'reserved',turn:metadata});}});
 const result=await store.reserve({...context,inputDigest:'a'.repeat(64),message:'não persistir',apiKey:'não persistir'});assert.equal(result.turn.requestId,requestId);
 assert.equal(calls[0].headers.authorization,'Bearer user-jwt');assert.equal(calls[0].headers.apikey,'sb_publishable_test');assert.deepEqual(JSON.parse(calls[0].body),{p_project_id:projectId,p_request_id:requestId,p_input_digest:'a'.repeat(64)});
});
test('configuração privilegiada e respostas inválidas falham fechadas',async()=>{
 const serviceKey=`x.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.x`;
 assert.throws(()=>createStudioStore({url:'https://project.supabase.co',anonKey:serviceKey}));
 assert.throws(()=>createStudioStore({url:'http://project.supabase.co',anonKey:'sb_publishable_test'}));
 const store=createStudioStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:async()=>Response.json({...metadata,owner_id:'invalid'})});
 await assert.rejects(store.get(context));
});
test('vínculo e estado precisam de confirmação booleana do banco',async()=>{
 const store=createStudioStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:async()=>Response.json(false)});
 await assert.rejects(store.bind({...context,binding:'v4.proof.signature',expiresAt:new Date().toISOString()}));
 await assert.rejects(store.state({...context,state:'completed'}));
 await assert.rejects(store.finishAction({...context,submissionId:requestId,state:'accepted'}));
});

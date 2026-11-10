import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioBindings} from '../src/studio-chat-bindings.mjs';
const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444';
test('prova de ação vincula conta, projeto, pedido, argumentos e prazo sem conteúdo',()=>{
 let clock=1000;const b=createStudioBindings({secret:Buffer.alloc(32,7),now:()=>clock});const args={value:'Conteúdo local'};
 const token=b.issue({userId,projectId,requestId,attemptId,sessionId:'sess_one',turnId:'turn_one',callId:'call_one',name:'compor_editar_briefing',args});
 assert.equal(token.includes('Conteúdo local'),false);const value=b.verify({token,userId,projectId,requestId});assert.equal(value.argsDigest,b.digest(args));assert.notEqual(value.argsDigest,b.digest({value:'Outro'}));
 assert.equal(b.verify({token,userId:projectId,projectId,requestId}),null);assert.equal(b.verify({token:token+'x',userId,projectId,requestId}),null);clock+=600000;assert.equal(b.verify({token,userId,projectId,requestId}),null);
});

test('verificação opcional de argumentos usa a chave da prova e recusa valores diferentes ou ausentes',()=>{
 const b=createStudioBindings({secret:Buffer.alloc(32,7)}),args={value:'Conteúdo local'},scope={userId,projectId,requestId};
 const token=b.issue({...scope,attemptId,sessionId:'sess_one',turnId:'turn_one',callId:'call_one',name:'compor_editar_briefing',args});
 assert.ok(b.verify({...scope,token}));assert.ok(b.verify({...scope,token,args}));
 for(const invalid of [{value:'Outro'},null,undefined])assert.equal(b.verify({...scope,token,args:invalid}),null);
 assert.equal(b.verify(null),null);
});

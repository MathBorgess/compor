import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {createCredentialSessionBindings,createCredentialStudioBindings,createCredentialReconciliationBindings} from '../lib/openai-credential-bindings.ts';

const secret=Buffer.alloc(32,7),key='sk-'+ 'a'.repeat(30),anotherKey='sk-'+ 'b'.repeat(30);
const scope={userId:'11111111-1111-4111-8111-111111111111',projectId:'22222222-2222-4222-8222-222222222222',attemptId:'33333333-3333-4333-8333-333333333333'};
const session={...scope,sessionId:'sess_test'},action={...session,turnId:'turn_test',callId:'call_test',prompt:'Uma composição abstrata'};
const pieceId='44444444-4444-4444-8444-444444444444';
const bindings=(source='byok',apiKey=key)=>createCredentialSessionBindings({secret,source,apiKey});
const inner=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).proof;

test('new recovery proofs retain the SQL token grammar while binding the effective credential and source',()=>{
  for(const source of ['byok','default']){
    const own=bindings(source),proof=own.issueRecovery(session);
    assert.match(proof,/^v4\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);assert.ok(proof.length<=2048);
    assert.equal(own.verifyRecovery({...scope,token:proof}).sessionId,session.sessionId);
    assert.equal(bindings(source,anotherKey).verifyRecovery({...scope,token:proof}),null);
    assert.equal(bindings(source==='byok'?'default':'byok').verifyRecovery({...scope,token:proof}),null);
    assert.doesNotMatch(Buffer.from(proof.split('.')[1],'base64url').toString(),/sk-|SUPABASE|COMPOR_CIN_OPENAI/);
  }
});

test('stripping the credential envelope cannot downgrade a new proof into the legacy BYOK path',()=>{
  const own=bindings(),proof=own.issueRecovery(session),bare=inner(proof);
  assert.equal(own.verifyRecovery({...scope,token:bare}),null);
  assert.equal(createSessionBindings({secret}).verifyRecovery({...scope,token:bare}),null);
  assert.equal(bindings('byok',anotherKey).verifyRecovery({...scope,token:bare}),null);
});

test('historical unbound BYOK proofs remain compatible but cannot be used with the shared key',()=>{
  const old=createSessionBindings({secret}),proof=old.issueRecovery(session);
  assert.ok(bindings().verifyRecovery({...scope,token:proof}));
  assert.equal(bindings('default').verifyRecovery({...scope,token:proof}),null);
  assert.equal(bindings().recoveryAttemptKey(scope),old.recoveryAttemptKey(scope));
});

test('image approval and execution remain bound to the key that received the proposed action',()=>{
  const own=bindings(),proof=own.issueAction(action);
  assert.ok(own.verifyAction({...scope,token:proof}));
  assert.equal(bindings('byok',anotherKey).verifyAction({...scope,token:proof}),null);
  assert.equal(own.verifyAction({...scope,token:inner(proof)}),null);
  const approved=own.issueApprovedAction({...scope,actionBinding:proof,pieceId,version:1});
  assert.match(approved,/^v6\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);assert.ok(approved.length<=2048);
  assert.ok(own.verifyApprovedAction({...scope,pieceId,version:1,token:approved}));
  assert.equal(bindings('byok',anotherKey).verifyApprovedAction({...scope,pieceId,version:1,token:approved}),null);
  assert.equal(own.verifyApprovedAction({...scope,pieceId,version:2,token:approved}),null);
});

test('local SQL reconciliation can verify the original action after key removal without authorizing a provider',()=>{
  const reconcile=createCredentialReconciliationBindings({secret});
  for(const source of ['byok','default']){
    const proof=bindings(source).issueAction(action);
    assert.ok(reconcile.verifyAction({...scope,token:proof}));
    assert.equal(reconcile.verifyAction({...scope,projectId:pieceId,token:proof}),null);
    assert.equal(reconcile.verifyAction({...scope,token:inner(proof)}),null);
    assert.deepEqual(Object.keys(reconcile),['verifyAction']);
  }
  assert.ok(reconcile.verifyAction({...scope,token:createSessionBindings({secret}).issueAction(action)}));
});

test('studio tools bind the effective key and do not accept a stripped or tampered envelope',()=>{
  const args={...session,requestId:scope.attemptId,turnId:'turn_test',callId:'call_test',name:'compor_novo_post',args:{projectId:scope.projectId}};
  const own=createCredentialStudioBindings({secret,source:'byok',apiKey:key}),other=createCredentialStudioBindings({secret,source:'byok',apiKey:anotherKey});
  const proof=own.issue(args);assert.ok(own.verify({...args,token:proof}));assert.equal(other.verify({...args,token:proof}),null);
  assert.equal(own.verify({...args,token:inner(proof)}),null);
  const parts=proof.split('.'),payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  payload.credentialMac='A'.repeat(43);parts[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.equal(own.verify({...args,token:parts.join('.')}),null);
  const legacy=createStudioBindings({secret}).issue(args);assert.ok(own.verify({...args,token:legacy}));
  assert.equal(createCredentialStudioBindings({secret,source:'default',apiKey:key}).verify({...args,token:legacy}),null);
});

test('legacy image actions can finish under their historical proof protocol',()=>{
  const legacy=createSessionBindings({secret}),oldAction=legacy.issueAction(action),own=bindings();
  const approved=own.issueApprovedAction({...scope,actionBinding:oldAction,pieceId,version:1});
  assert.ok(legacy.verifyApprovedAction({...scope,pieceId,version:1,token:approved}));
  assert.ok(own.verifyApprovedAction({...scope,pieceId,version:1,token:approved}));
  assert.equal(bindings('default').verifyApprovedAction({...scope,pieceId,version:1,token:approved}),null);
});

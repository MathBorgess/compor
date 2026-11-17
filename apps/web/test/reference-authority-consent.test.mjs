import test from 'node:test';
import assert from 'node:assert/strict';
import {grantReferenceAuthorityConsent,readReferenceAuthorityConsent,clearReferenceAuthorityConsent,readReferenceAuthorityWithdrawal,withdrawReferenceAuthorityConsent,inspectReferenceAuthorityWithdrawal} from '../lib/reference-authority-consent.ts';
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('consentimento explícito fica somente em memória e é isolado por conta',async()=>{
 clearReferenceAuthorityConsent();let calls=0;const client={grant:async consentId=>{calls++;return {status:'granted',consentId,capability:'A'.repeat(43)};}};
 const result=await grantReferenceAuthorityConsent(user,client);assert.equal(calls,1);assert.deepEqual(readReferenceAuthorityConsent(user),result);assert.equal(readReferenceAuthorityConsent(other),null);
 clearReferenceAuthorityConsent();assert.equal(readReferenceAuthorityConsent(user),null);
});
test('resposta perdida ou concessão sem prova não produz consentimento',async()=>{
 clearReferenceAuthorityConsent();let calls=0;await assert.rejects(grantReferenceAuthorityConsent(user,{grant:async()=>{calls++;throw Error('lost');}}));assert.equal(calls,1);assert.equal(readReferenceAuthorityConsent(user),null);
 await assert.rejects(grantReferenceAuthorityConsent(user,{grant:async consentId=>({status:'existing',consentId})}),/reference_authority_unconfirmed/);assert.equal(readReferenceAuthorityConsent(user),null);
});

test('troca de conta durante concessão impede restaurar autorização antiga',async()=>{
 clearReferenceAuthorityConsent();let done;const pending=grantReferenceAuthorityConsent(user,{grant:consentId=>new Promise(resolve=>{done=()=>resolve({status:'granted',consentId,capability:'A'.repeat(43)});})});
 clearReferenceAuthorityConsent();done();await assert.rejects(pending,/reference_authority_unconfirmed/);assert.equal(readReferenceAuthorityConsent(user),null);
});

test('retirada perde a capacidade imediatamente e reconcilia o mesmo ID sem reenviar',async()=>{
 clearReferenceAuthorityConsent();const calls=[];let release,state='absent';
 const client={grant:async consentId=>{calls.push('grant');return {status:'granted',consentId,capability:'A'.repeat(43)};},revoke:consentId=>{calls.push(['revoke',consentId]);return new Promise((resolve,reject)=>{release=()=>reject(Error('response lost'));});},consentState:async consentId=>{calls.push(['state',consentId]);return {state,consentId};}};
 const consent=await grantReferenceAuthorityConsent(user,client),pending=withdrawReferenceAuthorityConsent(user,client);
 assert.equal(readReferenceAuthorityConsent(user),null);assert.equal(readReferenceAuthorityWithdrawal(user).status,'withdrawing');assert.equal(readReferenceAuthorityWithdrawal(other),null);
 await assert.rejects(grantReferenceAuthorityConsent(user,client),/withdrawal_unconfirmed/);release();await assert.rejects(pending,/response lost/);
 assert.equal(readReferenceAuthorityWithdrawal(user).status,'unknown');
 assert.equal((await inspectReferenceAuthorityWithdrawal(user,client)).status,'unknown','absent does not prove a lost write is finished');
 state='active';assert.equal((await inspectReferenceAuthorityWithdrawal(user,client)).status,'active');assert.equal(readReferenceAuthorityConsent(user),null);
 await assert.rejects(grantReferenceAuthorityConsent(user,client),/withdrawal_unconfirmed/);
 state='revoked';assert.equal((await inspectReferenceAuthorityWithdrawal(user,client)).status,'revoked');assert.equal(readReferenceAuthorityConsent(user),null);
 assert.deepEqual(calls,['grant',['revoke',consent.consentId],['state',consent.consentId],['state',consent.consentId],['state',consent.consentId]]);
 await grantReferenceAuthorityConsent(user,client);assert.notEqual(readReferenceAuthorityConsent(user).consentId,consent.consentId);
});

test('resposta atrasada da retirada não altera permissão de outra conta',async()=>{
 clearReferenceAuthorityConsent();const grant={grant:async consentId=>({status:'granted',consentId,capability:'A'.repeat(43)})};await grantReferenceAuthorityConsent(user,grant);let release;
 await assert.rejects(withdrawReferenceAuthorityConsent(other,{revoke:async()=>{throw Error('must not send');}}),/withdrawal_unavailable/);assert.ok(readReferenceAuthorityConsent(user));
 const pending=withdrawReferenceAuthorityConsent(user,{revoke:consentId=>new Promise(resolve=>{release=()=>resolve({status:'revoked',consentId});})});
 clearReferenceAuthorityConsent();const next=await grantReferenceAuthorityConsent(other,grant);release();await assert.rejects(pending,/scope_changed/);assert.deepEqual(readReferenceAuthorityConsent(other),next);assert.equal(readReferenceAuthorityWithdrawal(user),null);
});

test('consulta atrasada ou divergente não restaura capacidade nem sobrescreve nova retirada',async()=>{
 clearReferenceAuthorityConsent();await grantReferenceAuthorityConsent(user,{grant:async consentId=>({status:'granted',consentId,capability:'A'.repeat(43)})});
 await assert.rejects(withdrawReferenceAuthorityConsent(user,{revoke:async()=>{throw Error('lost');}}));let release;
 const lookup=inspectReferenceAuthorityWithdrawal(user,{consentState:consentId=>new Promise(resolve=>{release=()=>resolve({state:'active',consentId});})});
 await withdrawReferenceAuthorityConsent(user,{revoke:async consentId=>({status:'revoked',consentId})});release();await assert.rejects(lookup,/scope_changed/);assert.equal(readReferenceAuthorityWithdrawal(user).status,'revoked');
 await assert.rejects(inspectReferenceAuthorityWithdrawal(user,{consentState:async()=>({state:'revoked',consentId:other})}),/unconfirmed/);assert.equal(readReferenceAuthorityWithdrawal(user).status,'unknown');assert.equal(readReferenceAuthorityConsent(user),null);
});

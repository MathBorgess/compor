import test from 'node:test';
import assert from 'node:assert/strict';
import {grantReferenceAuthorityConsent,readReferenceAuthorityConsent,clearReferenceAuthorityConsent} from '../lib/reference-authority-consent.ts';
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

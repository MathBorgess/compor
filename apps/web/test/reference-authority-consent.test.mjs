import test from 'node:test';
import assert from 'node:assert/strict';
import {grantReferenceAuthorityConsent,readReferenceAuthorityConsent,clearReferenceAuthorityConsent} from '../lib/reference-authority-consent.ts';
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
function memory(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('consentimento explícito é preservado na aba e isolado por conta',async()=>{
 const storage=memory();let calls=0;const client={grant:async consentId=>{calls++;return {status:'granted',consentId,capability:'A'.repeat(43)};}};
 const result=await grantReferenceAuthorityConsent(storage,user,client);assert.equal(calls,1);assert.deepEqual(readReferenceAuthorityConsent(storage,user),result);assert.equal(readReferenceAuthorityConsent(storage,other),null);
 clearReferenceAuthorityConsent(storage);assert.equal(readReferenceAuthorityConsent(storage,user),null);
});
test('resposta perdida ou storage indisponível não produz consentimento local',async()=>{
 const storage=memory();let calls=0;await assert.rejects(grantReferenceAuthorityConsent(storage,user,{grant:async()=>{calls++;throw Error('lost');}}));assert.equal(calls,1);assert.equal(readReferenceAuthorityConsent(storage,user),null);
 const unavailable={...storage,setItem:()=>{throw Error('disabled');}};await assert.rejects(grantReferenceAuthorityConsent(unavailable,user,{grant:async consentId=>({status:'granted',consentId,capability:'A'.repeat(43)})}),/reference_authority_unavailable/);
});

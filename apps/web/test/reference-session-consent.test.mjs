import test from 'node:test';
import assert from 'node:assert/strict';
import {grantReferenceConsent,referenceConsentGranted,syncReferenceConsentAccount} from '../lib/reference-session-consent.ts';
const storage=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};

test('consentimento acompanha a conta na mesma sessão, independentemente do projeto',()=>{
  const session=storage();assert.equal(referenceConsentGranted(session,'a'),false);
  grantReferenceConsent(session,'a');syncReferenceConsentAccount(session,'a');
  assert.equal(referenceConsentGranted(session,'a'),true);
  assert.equal(referenceConsentGranted(session,'b'),false);
});
test('trocar a conta ou sair elimina a autorização anterior, mesmo voltando à mesma conta',()=>{
  const session=storage();grantReferenceConsent(session,'a');syncReferenceConsentAccount(session,'b');
  assert.equal(referenceConsentGranted(session,'a'),false);
  grantReferenceConsent(session,'b');syncReferenceConsentAccount(session,null);
  assert.equal(referenceConsentGranted(session,'b'),false);
  assert.equal(referenceConsentGranted(storage(),'b'),false,'uma sessão nova começa sem permissão');
});

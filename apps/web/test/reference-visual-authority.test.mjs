import test from 'node:test';
import assert from 'node:assert/strict';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createReferenceVisualAuthority} from '../lib/reference-visual-authority.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={userId:id(1),projectId:id(2),conversationId:'references',requestId:id(3),batchId:id(4),purpose:'parallel'};
const local={version:1,policy:'optimized-v1',entries:[]};
const file={sha256:'a'.repeat(64),mime:'image/png',byteLength:70};
const external={version:2,policy:'optimized-v1',externalConsent:true,entries:[{id:id(5),ordinal:1,role:'reference',inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'},original:file,transport:{...file,width:1,height:1},transformation:'none'}]};
const credential={userId:scope.userId,consentId:id(6),capability:'A'.repeat(43)};
const snapshot=(input,consentId)=>({projectId:scope.projectId,conversationId:scope.conversationId,requestId:scope.requestId,batchId:scope.batchId,purpose:scope.purpose,selectionRevision:2,manifestDigest:visualInputDigest(input),consentId});

test('snapshot local é criado uma vez sem capability e preserva escopo e revisão',async()=>{
 const calls=[];const client={createSnapshot:async(...args)=>calls.push(args),readSnapshot:async()=>{throw Error('unexpected');}};
 const authority=createReferenceVisualAuthority({client,readConsent:()=>credential,isCurrent:()=>true});
 await authority.create(scope,local,2);assert.equal(calls.length,1);assert.equal(calls[0][0].selectionRevision,2);assert.equal(calls[0][0].requestId,scope.requestId);assert.equal(calls[0][1],undefined);assert.deepEqual(await authority.headers(scope,local),{});
});

test('externa exige consentimento em memória, valida snapshot anterior e nunca envia capability no corpo',async()=>{
 const calls=[];const client={createSnapshot:async(input,capability)=>calls.push({input,capability}),readSnapshot:async()=>({status:'found',snapshot:snapshot(external,credential.consentId)})};
 let stored=null;const authority=createReferenceVisualAuthority({client,readConsent:()=>stored,isCurrent:()=>true});
 await assert.rejects(authority.create(scope,external,2),/consent_required/);assert.equal(calls.length,0);
 stored=credential;await authority.create(scope,external,2);assert.equal(calls.length,1);assert.equal(calls[0].capability,credential.capability);assert.equal(JSON.stringify(calls[0].input).includes(credential.capability),false);
 assert.deepEqual(await authority.headers(scope,external),{'x-compor-reference-consent':credential.capability});
 stored={...credential,consentId:id(7)};await assert.rejects(authority.headers(scope,external),/snapshot_unconfirmed/);
});

test('resposta perdida, troca de conta e revogação durante leitura não iniciam nova operação',async()=>{
 let writes=0,current=true,stored=credential,release;const client={createSnapshot:async()=>{writes++;throw Error('lost');},readSnapshot:()=>new Promise(resolve=>{release=resolve;})};
 const authority=createReferenceVisualAuthority({client,readConsent:()=>stored,isCurrent:()=>current});
 await assert.rejects(authority.create(scope,external,2),/lost/);assert.equal(writes,1);
 const pending=authority.headers(scope,external);stored=null;release({status:'found',snapshot:snapshot(external,credential.consentId)});await assert.rejects(pending,/consent_required/);
 current=false;await assert.rejects(authority.create(scope,local,2),/scope_changed/);assert.equal(writes,1);
});

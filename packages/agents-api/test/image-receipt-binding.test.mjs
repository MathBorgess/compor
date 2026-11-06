import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createSessionBindings} from '../src/session-binding.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const secret=Buffer.alloc(32,42);
const claim={userId:id(1),projectId:id(2),requestId:id(3),attemptId:id(4),pieceId:id(5),version:2,executionId:id(6),assetId:id(7),contentSha256:'a'.repeat(64)};

test('recibo durável vincula cada identificador, versão e hash sem compartilhar domínio com outros tokens',()=>{
 let now=1;const bindings=createSessionBindings({secret,now:()=>now});
 const token=bindings.issueImageReceipt(claim);const {contentSha256,...scope}=claim;
 now+=1_000_000_000;
 assert.deepEqual(bindings.verifyImageReceipt({token,...scope}),claim,'recuperação não precisa conhecer o hash antes da verificação');
 assert.deepEqual(bindings.verifyImageReceipt({token,...claim}),claim,'hash previamente conhecido também é conferido');
 for(const field of ['userId','projectId','requestId','attemptId','pieceId','executionId','assetId'])
  assert.equal(bindings.verifyImageReceipt({token,...scope,[field]:id(99)}),null,`${field} não pode ser trocado`);
 assert.equal(bindings.verifyImageReceipt({token,...scope,version:3}),null);
 assert.equal(bindings.verifyImageReceipt({token,...scope,contentSha256:'b'.repeat(64)}),null);
 assert.equal(createSessionBindings({secret:Buffer.alloc(32,43)}).verifyImageReceipt({token,...scope}),null);
 const other=bindings.issueRecovery({userId:claim.userId,projectId:claim.projectId,attemptId:claim.attemptId,sessionId:'sess_test'});
 assert.equal(bindings.verifyImageReceipt({token:other,...scope}),null);
 assert.equal(bindings.verifyRecovery({token,userId:claim.userId,projectId:claim.projectId,attemptId:claim.attemptId}),null);
});

test('recusa adulteração, tokens não canônicos e payloads inválidos mesmo com HMAC correto',()=>{
 const bindings=createSessionBindings({secret});const token=bindings.issueImageReceipt(claim);const {contentSha256,...scope}=claim;
 const [version,payload,signature]=token.split('.');const forged=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));forged.contentSha256='b'.repeat(64);
 const changed=`${version}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;
 assert.equal(bindings.verifyImageReceipt({token:changed,...scope}),null,'alterar bytes invalida HMAC');
 assert.equal(bindings.verifyImageReceipt({token:`${token}=`,...scope}),null);
 assert.equal(bindings.verifyImageReceipt({token:`v4.${payload}.${signature}`,...scope}),null);
 assert.equal(bindings.verifyImageReceipt({token:'v7.'+'a'.repeat(2049)+'.x',...scope}),null);
 assert.equal(bindings.verifyImageReceipt(undefined),null);
 const extra={...claim,extra:'not-allowed'};const raw=Buffer.from(JSON.stringify(extra)).toString('base64url');
 const mac=createHmac('sha256',secret).update(`compor.image-receipt.v1.${raw}`).digest('base64url');
 assert.equal(bindings.verifyImageReceipt({token:`v7.${raw}.${mac}`,...scope}),null);
 assert.throws(()=>bindings.issueImageReceipt(extra));
 for(const bad of [{...claim,version:0},{...claim,version:2147483648},{...claim,assetId:'bad'},{...claim,contentSha256:'A'.repeat(64)},{...claim,contentSha256:'a'.repeat(63)}])
  assert.throws(()=>bindings.issueImageReceipt(bad));
 assert.equal(bindings.verifyImageReceipt({token,...scope,extra:true}),null);
});

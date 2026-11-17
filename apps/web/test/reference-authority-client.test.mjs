import test from 'node:test';
import assert from 'node:assert/strict';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createReferenceAuthorityClient} from '../lib/reference-authority-client.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const empty={version:1,references:[],projectReferenceIds:[],posts:[]};
const json=(value,status=200)=>Response.json(value,{status});

test('seleção é escrita uma única vez com revisão anterior e consulta recibo separadamente',async()=>{
 const calls=[];const client=createReferenceAuthorityClient(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(calls.length===1)return json({status:'ready',revision:3,state:empty});if(calls.length===2)throw Error('lost response');return json({status:'applied',commandId:id(2),revision:4});});
 assert.equal((await client.read(id(1))).revision,3);
 await assert.rejects(client.write(id(1),id(2),3,empty));
 assert.equal(calls.length,2,'perda de resposta não reenvia a escrita');
 assert.equal((await client.receipt(id(1),id(2))).revision,4);
 assert.equal(calls.length,3);assert.equal(calls[1].body.expectedRevision,3);assert.equal(calls[2].body.op,'receipt');
});

test('conflito e recibo de outro comando não são aceitos nem repetidos',async()=>{
 let count=0;const conflict=createReferenceAuthorityClient(async()=>{count++;return json({status:'conflict',revision:5},409);});
 await assert.rejects(conflict.write(id(1),id(2),3,empty),/reference_authority_conflict/);assert.equal(count,1);
 const mismatch=createReferenceAuthorityClient(async()=>json({status:'applied',commandId:id(9),revision:4}));
 await assert.rejects(mismatch.receipt(id(1),id(2)),/reference_authority_mismatch/);
});

test('concessão perdida nunca fabrica ou reemite capability; estado e revogação são separados',async()=>{
 const calls=[];const client=createReferenceAuthorityClient(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body.op);if(body.op==='grant')return json({status:'existing',consentId:id(3)});if(body.op==='state')return json({state:'active',consentId:id(3)});return json({status:'revoked',consentId:id(3)});});
 assert.deepEqual(await client.grant(id(3)),{status:'existing',consentId:id(3)});
 assert.equal((await client.consentState(id(3))).state,'active');assert.equal((await client.revoke(id(3))).status,'revoked');assert.deepEqual(calls,['grant','state','revoke']);
});

test('snapshot valida escopo e consulta recibo sem reenviar capability',async()=>{
 const calls=[],input={projectId:id(1),conversationId:'references',requestId:id(2),batchId:id(4),purpose:'parallel',selectionRevision:3,visualInput:{version:1,policy:'optimized-v1',entries:[]},consentId:id(3)},snapshot={projectId:input.projectId,conversationId:input.conversationId,requestId:input.requestId,batchId:input.batchId,purpose:input.purpose,selectionRevision:3,manifestDigest:visualInputDigest(input.visualInput),consentId:id(3)};
 const client=createReferenceAuthorityClient(async(_url,options)=>{const body=JSON.parse(options.body);calls.push({body,headers:options.headers});return json({status:body.op==='create'?'created':'found',snapshot});});
 assert.equal((await client.createSnapshot(input,'A'.repeat(43))).status,'created');assert.equal((await client.readSnapshot(id(1),id(2))).status,'found');
 assert.equal(calls[0].headers['x-compor-reference-consent'],'A'.repeat(43));assert.equal(calls[1].headers['x-compor-reference-consent'],undefined);assert.equal(JSON.stringify(calls[0].body).includes('A'.repeat(43)),false);
 const wrongDigest=createReferenceAuthorityClient(async()=>json({status:'created',snapshot:{...snapshot,manifestDigest:'a'.repeat(64)}}));await assert.rejects(wrongDigest.createSnapshot(input),/reference_authority_mismatch/);
 const wrong=createReferenceAuthorityClient(async()=>json({status:'created',snapshot:{...snapshot,projectId:id(99)}}));await assert.rejects(wrong.createSnapshot(input),/reference_authority_mismatch/);
});

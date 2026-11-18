import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationPlannerStore} from '../lib/exploration-planner-store.ts';
import {createExplorationBatchStore} from '../lib/exploration-batch-store.ts';
import {createStudioStore} from '../../../packages/agents-api/src/studio-chat-store.mjs';
import {createImageToolReservationStore} from '../../../packages/agents-api/src/image-tool-reservation.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-user'},config={service:'https://example.supabase.co',key:'sb_publishable_synthetic'},digest='a'.repeat(64),secret='b'.repeat(64);
const visualAuthority={requestId:id(4),manifestDigest:digest,consentSecret:secret};

test('adaptadores visuais chamam somente RPC transacional com escopo e token da pessoa',async()=>{
 const calls=[];let fail=false;
 const fetch=async(url,options)=>{const rpc=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);calls.push({rpc,body,authorization:options.headers.authorization});if(fail)return Response.json({error:'unavailable'},{status:503});if(rpc==='reserve_exploration_plan_authorized'||rpc==='reserve_studio_turn_authorized')return Response.json({status:'conflict'});if(rpc==='claim_image_tool_execution_authorized')return Response.json([{execution_id:null,asset_id:null,state:'blocked',is_new:false}]);return Response.json([{state:'revoked',is_new:false}]);};
 const scope={actor,projectId:id(2),conversationId:'references',batchId:id(3),requestId:id(4)};
 const planner=createExplorationPlannerStore(config,fetch,{intentId:id(5),intentSecret:secret,visualAuthority});
 assert.equal((await planner.reserve({...scope,userId:actor.userId,inputDigest:digest,completionDigest:digest})).status,'conflict');
 const batch=createExplorationBatchStore(config,fetch),base={projectId:id(2),batchId:id(3),intentId:id(5),intentSecret:secret};
 assert.deepEqual(await batch.reserveBatch(actor,{...base,pieceId:null,planDigest:digest,imageIds:[id(6),id(7),id(8)],promptDigests:[digest,digest,digest],rejectionDigests:[digest,digest,digest],visualAuthority}),{state:'revoked',isNew:false});
 assert.deepEqual(await batch.replaceRejected(actor,{...base,position:1,previousId:id(6),requestId:id(4),promptDigest:digest,rejectionDigest:digest,visualAuthority}),{state:'revoked',isNew:false});
 const studio=createStudioStore({url:config.service,anonKey:config.key,fetch});assert.equal((await studio.reserve({...scope,inputDigest:digest,visualAuthority:{pieceId:null,manifestDigest:digest,consentSecret:secret}})).status,'conflict');
 const image=createImageToolReservationStore({url:config.service,anonKey:config.key,fetch});assert.deepEqual(await image.claimExecution({actor,reservationId:id(9),visualAuthority}),{state:'blocked'});
 assert.deepEqual(calls.map(call=>call.rpc),['reserve_exploration_plan_authorized','reserve_exploration_batch_authorized','replace_exploration_slot_authorized','reserve_studio_turn_authorized','claim_image_tool_execution_authorized']);
 for(const call of calls){assert.equal(call.authorization,`Bearer ${actor.token}`);assert.equal(call.body.p_manifest_digest,digest);assert.equal(call.body.p_consent_secret,secret);}
 assert.equal(calls[1].body.p_authority_request_id,id(4));assert.equal(calls[4].body.p_authority_request_id,id(4));
 fail=true;const before=calls.length;await assert.rejects(planner.reserve({...scope,userId:actor.userId,inputDigest:digest,completionDigest:digest}));assert.equal(calls.length,before+1);assert.equal(calls.at(-1).rpc,'reserve_exploration_plan_authorized');
 const invalid={...visualAuthority,manifestDigest:'bad'};await assert.rejects(batch.reserveBatch(actor,{...base,pieceId:null,planDigest:digest,imageIds:[],promptDigests:[],rejectionDigests:[],visualAuthority:invalid}));assert.equal(calls.length,before+1);
});

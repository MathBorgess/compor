import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceSignalsRoute} from '../lib/reference-exploration-route.ts';
import {createGeneratedFeedbackRoute} from '../lib/generated-feedback-route.ts';
import {createReferenceSignalStore} from '../lib/reference-signal-store.ts';
import {createGeneratedFeedbackStore} from '../lib/generated-feedback-store.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='http://localhost:3000',projectId=id(2),pieceId=id(3),otherPiece=id(4);
const actor={userId:id(1),token:'session-token'};
const pin={id:id(10),projectId,originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography',action:'selected',comment:'',supersedes:null,createdAt:'2026-11-15T10:00:00.000Z'};
const image={id:id(11),projectId,imageId:id(20),action:'selected',comment:'',supersedes:null,createdAt:pin.createdAt,plan:null};
const request=body=>new Request(origin+'/signals',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('rotas mantêm escolhas locais fora do projeto, da conta e de outros posts',async()=>{
 for(const [factory,sample] of [[createReferenceSignalsRoute,pin],[createGeneratedFeedbackRoute,image]]){
  const rows=[sample,{...sample,id:id(12),pieceId},{...sample,id:id(13),pieceId:otherPiece}];
  const route=factory({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async(_actor,id)=>id===projectId,store:()=>({list:async()=>rows,insert:async()=>{throw Error('unexpected write');}})});
  for(const [scope,post,expected] of [['project',undefined,id(10)],['account',undefined,id(10)],['project',pieceId,id(12)]]){
   const response=await route(request({projectId,scope,...(post?{pieceId:post}:{})}));assert.equal(response.status,200);
   const {signals}=await response.json();assert.equal(signals.length,1);assert.equal(signals[0].pieceId,post);
   if(sample===pin)assert.equal(signals[0].id,expected);
  }
  assert.equal((await route(request({projectId:id(99),scope:'project',pieceId}))).status,404);
 }
});
test('uma correção local não pode substituir o sinal de outro alcance',async()=>{
 for(const [factory,sample] of [[createReferenceSignalsRoute,pin],[createGeneratedFeedbackRoute,image]]){
  const route=factory({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>true,store:()=>({list:async()=>[{...sample,pieceId:otherPiece}],insert:async()=>{throw Error('must not insert');}})});
  const {createdAt,plan,...input}=sample;
  assert.equal((await route(request({...input,id:id(30),pieceId,supersedes:sample.id}))).status,409);
 }
});
test('adaptadores filtram alcance no banco e recusam retorno de outro post',async()=>{
 for(const [factory,kind] of [[createReferenceSignalStore,'pin'],[createGeneratedFeedbackStore,'image']]){
  const calls=[];
  const store=factory({config:{key:'public',service:'http://localhost'},actor,fetchApi:async value=>{
   const url=new URL(value);calls.push(url);return Response.json([]);
  }});
  await store.list(projectId);await store.list(projectId,pieceId);await store.list();
  assert.deepEqual(calls.map(url=>url.searchParams.get('piece_id')),['is.null',`eq.${pieceId}`,'is.null']);
  const row={id:pin.id,project_id:projectId,piece_id:otherPiece,action:'selected',comment:'',supersedes:null,created_at:pin.createdAt,...(kind==='pin'?{origin_url:pin.originUrl,board:pin.board}:{image_id:image.imageId})};
  const wrong=factory({config:{key:'public',service:'http://localhost'},actor,fetchApi:async()=>Response.json([row])});
  await assert.rejects(wrong.list(projectId,pieceId));
 }
});

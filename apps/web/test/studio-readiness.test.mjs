import test from 'node:test';
import assert from 'node:assert/strict';
import {loadReadinessFeedback} from '../lib/studio-readiness.ts';
import {recordVisualFeedback} from '../lib/studio-visual-feedback.ts';
import {createStudioState,createPost,addReference,prepareAdjustment} from '../lib/studio-state.ts';
import {assessReadiness} from '../../../packages/agile-deliberation/src/readiness.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const projectId=id(1),userId=id(2),pieceId=id(3),pinId=id(4),imageRef=id(5),imageId=id(6);
const pin={id:pinId,name:'pin.png',mime:'image/png',size:10,width:1,height:1,source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography'}};
const image={id:imageRef,name:'gerada.png',mime:'image/png',size:10,width:1,height:1,source:{kind:'generated',projectId,imageId}};
const date='2026-11-06T12:00:00.000Z';
const pinSignal=(overrides={})=>({id:id(10),projectId,originUrl:pin.source.originUrl,board:pin.source.board,action:'comment',comment:'Gosto do contraste',supersedes:null,createdAt:date,...overrides});
const imageSignal=(overrides={})=>({id:id(11),projectId,imageId,action:'comment',comment:'Prefiro traços suaves',supersedes:null,createdAt:date,plan:null,...overrides});
function reader(generated,pins){return async(path,options)=>{const body=JSON.parse(options.body);if(path.includes('explorations')){assert.equal(body.scope,'project');return Response.json({signals:generated});}assert.equal(body.scope,'account');return Response.json({signals:pins});};}
test('só correlaciona comentário ativo pela origem e projeto; gosto da conta é pista separada',async()=>{
 const result=await loadReadinessFeedback(projectId,[pin,image],reader([imageSignal(),imageSignal({id:id(12),projectId:id(99)})],[pinSignal(),pinSignal({id:id(13),projectId:id(98),comment:'Em outro projeto gostei de serifas'}),pinSignal({id:id(14),originUrl:'https://www.pinterest.com/pin/999/',comment:'Não corresponde'}),pinSignal({id:id(15),comment:'Comentário corrigido'}),pinSignal({id:id(16),supersedes:id(15),comment:'Prefiro o contraste menor'})]));
 assert.equal(result.availability,'partial','resposta gerada com outro projeto invalida integralmente a fonte');
 assert.deepEqual(result.referenceFeedback,[{referenceId:pinId,text:'Prefiro o contraste menor'}]);
 assert.deepEqual(result.accountHints,[{referenceId:pinId,projectId:id(98),scope:'other_project',text:'Em outro projeto gostei de serifas'}]);
});
test('comentário registrado no chat passa a contar para prontidão da referência selecionada',async()=>{
 let state=createPost(createStudioState({userId,projectId}),{pieceId});state=addReference(state,pin);
 state=prepareAdjustment(state,{requestId:id(20),messageId:id(21),instruction:'Gosto do contraste',createdAt:date,eventId:id(22)});
 const saved=[];const write=async(_path,options)=>{saved.push({...JSON.parse(options.body),createdAt:date});return Response.json({status:'recorded'});};
 const result=await recordVisualFeedback(state,{projectId,requestId:id(23),revision:state.revision,referenceId:pinId,action:'comment',quote:'Gosto do contraste'},write);
 assert.equal(result.feedbackStatus,'recorded');
 const before=assessReadiness({references:[pin]});assert.equal(before.evidence.referenceMeaning,'unknown');
 const loaded=await loadReadinessFeedback(projectId,[pin],reader([],saved));
 const after=assessReadiness({references:[pin],referenceFeedback:loaded.referenceFeedback});assert.equal(after.evidence.referenceMeaning,'discussed');
});
test('falhas não transformam seleção em confirmação',async()=>{
 const result=await loadReadinessFeedback(projectId,[pin,image],async()=>{throw Error('offline');});
 assert.equal(result.availability,'unavailable');assert.deepEqual(result.referenceFeedback,[]);assert.equal(assessReadiness({references:[pin,image],referenceFeedback:result.referenceFeedback}).evidence.referenceMeaning,'unknown');
});

test('referência gerada exige a imagem e o projeto exatos',async()=>{
 const result=await loadReadinessFeedback(projectId,[image],reader([imageSignal(),imageSignal({id:id(13),imageId:id(99),comment:'Outra imagem'})],[]));
 assert.equal(result.availability,'available');assert.deepEqual(result.referenceFeedback,[{referenceId:imageRef,text:'Prefiro traços suaves'}]);assert.deepEqual(result.accountHints,[]);
});

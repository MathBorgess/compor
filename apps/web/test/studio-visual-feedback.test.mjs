import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,createPost,addReference,prepareAdjustment,recordActionReceipt,parseStudioState} from '../lib/studio-state.ts';
import {recordVisualFeedback,recordGeneratedComment} from '../lib/studio-visual-feedback.ts';
import {createStudioTools} from '../lib/studio-tools.ts';
import {rememberShownExplorations,readShownExplorations} from '../lib/shown-explorations.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const projectId=id(1),userId=id(2),pieceId=id(3),pinId=id(4),generatedId=id(5);
function selected(message,multiple=false) {
 let state=createPost(createStudioState({userId,projectId}),{pieceId});
 const metadata={name:'imagem.png',mime:'image/png',size:1024,width:100,height:100};
 state=addReference(state,{...metadata,id:pinId,source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography',title:'Tipografia viva'}});
 if(multiple)state=addReference(state,{...metadata,id:generatedId,source:{kind:'generated',projectId,imageId:id(8),ordinal:42}});
 return prepareAdjustment(state,{requestId:id(10),messageId:id(11),instruction:message,createdAt:'2026-11-06T12:00:00.000Z',eventId:id(12)});
}
const args=(referenceId,quote)=>({projectId,requestId:id(15),revision:0,referenceId,action:'selected',quote});
test('galeria mantém ordinais apresentados separados por projeto',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 rememberShownExplorations(projectId,[{id:id(8),ordinal:42}],storage);
 rememberShownExplorations(id(99),[{id:id(9),ordinal:42}],storage);
 assert.deepEqual(readShownExplorations(projectId,storage),[{id:id(8),ordinal:42}]);
 assert.deepEqual(readShownExplorations(id(99),storage),[{id:id(9),ordinal:42}]);
});
test('feedback literal de referência única conserva a origem sem inventar texto',async()=>{
 const state=selected('Adorei o contraste desta referência.'),sent=[];
 const result=await recordVisualFeedback(state,args(pinId,'Adorei o contraste'),async(url,options)=>{sent.push([url,JSON.parse(options.body)]);return new Response('{}',{status:201});});
 assert.equal(result.feedbackStatus,'recorded');assert.equal(sent[0][0],'/api/studio/references/signals');
 assert.equal(sent[0][1].originUrl,'https://www.pinterest.com/pin/123/');assert.equal(sent[0][1].comment,'Adorei o contraste');
});
test('várias referências exigem identificação única e citação presente no turno',async()=>{
 const sent=[],fetchApi=async(url,options)=>{sent.push([url,JSON.parse(options.body)]);return new Response('{}',{status:201});};
 const ambiguous=selected('Gostei muito das cores.',true);
 assert.equal((await recordVisualFeedback(ambiguous,args(generatedId,'Gostei muito'),fetchApi)).feedbackStatus,'ambiguous');
 assert.equal((await recordVisualFeedback(ambiguous,args(generatedId,'Adorei o azul'),fetchApi)).feedbackStatus,'quote_not_found');
 assert.equal(sent.length,0);
 const explicit=selected('Na imagem 42, gostei muito das cores.',true);
 const result=await recordVisualFeedback(explicit,args(generatedId,'gostei muito das cores'),fetchApi);
 assert.equal(result.feedbackStatus,'recorded');assert.equal(sent[0][0],'/api/studio/explorations/signals');assert.equal(sent[0][1].imageId,id(8));
});

test('evento interno de seleção jamais é registrado como comentário da pessoa',async()=>{
 const {REFERENCE_SELECTION_EVENT}=await import('../lib/studio-state.ts');
 let state=createPost(createStudioState({userId,projectId}),{pieceId});
 state=addReference(state,{id:pinId,name:'imagem.png',mime:'image/png',size:1024,width:100,height:100,source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography',title:'Tipografia viva'}});
 state=prepareAdjustment(state,{requestId:id(10),messageId:id(11),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:'2026-11-06T12:00:00.000Z',eventId:id(12)});
 let calls=0;const result=await recordVisualFeedback(state,args(pinId,REFERENCE_SELECTION_EVENT),async()=>{calls++;return new Response('{}',{status:201});});
 assert.equal(result.feedbackStatus,'quote_not_found');assert.equal(calls,0);
});

test('resultado de feedback atravessa ferramenta e recibo sem repetir o sinal',async()=>{
 let state=selected('Na imagem 42, gostei muito das cores.',true),calls=0;
 const tools=createStudioTools({
  getScope:()=>({userId,projectId,revision:state.revision}),
  handlers:{compor_registrar_feedback_visual:input=>recordVisualFeedback(state,input,async()=>{calls++;return new Response('{}',{status:201});})},
  getReceipt:requestId=>state.actionReceipts.find(receipt=>receipt.requestId===requestId),
  saveReceipt:async receipt=>{state=recordActionReceipt(state,receipt);return {...receipt.result,revision:state.revision};},
 });
 const input={...args(generatedId,'gostei muito das cores'),revision:state.revision};
 const result=await tools.execute('compor_registrar_feedback_visual',input);
 assert.equal(result.feedbackStatus,'recorded');assert.equal(parseStudioState(state).actionReceipts[0].result.feedbackStatus,'recorded');
 const again=await tools.execute('compor_registrar_feedback_visual',input);
 assert.equal(again.feedbackStatus,'recorded');assert.equal(calls,1);
});

test('comentário literal de imagem mostrada não exige seleção e grava sinal no projeto',async()=>{
 const state=selected('Na imagem 42, gostei muito das cores.'),sent=[];
 const input={projectId,requestId:id(15),revision:state.revision,ordinal:42,quote:'gostei muito das cores'};
 const fetchApi=async(url,options)=>{
  if(url.startsWith('/api/studio/explorations?'))return Response.json({images:[{id:id(8),project_id:projectId,state:'completed',ordinal:42}]});
  sent.push(JSON.parse(options.body));return new Response('{}',{status:201});
 };
 const result=await recordGeneratedComment(state,input,fetchApi,undefined,[{id:id(8),ordinal:42}]);
 assert.equal(result.feedbackStatus,'recorded');assert.deepEqual(sent,[{id:id(15),projectId,imageId:id(8),action:'comment',comment:'gostei muito das cores',supersedes:null}]);
 assert.equal(state.references.some(ref=>ref.source?.kind==='generated'),false,'não seleciona imagem');
});

test('ordinal ambíguo, não mostrado ou sem opinião não registra sinal',async()=>{
 let calls=0;const fetchApi=async()=>{calls++;return Response.json({images:[]});};
 const input={projectId,requestId:id(15),revision:0,ordinal:42,quote:'Gostei'};
 assert.equal((await recordGeneratedComment(selected('Gostei da imagem 42 e da imagem 43.'),input,fetchApi,undefined,[{id:id(8),ordinal:42}])).feedbackStatus,'ambiguous');
 assert.equal((await recordGeneratedComment(selected('Gostei da imagem 42.'),{...input,quote:'Gostei'},fetchApi,undefined,[])).feedbackStatus,'reference_unavailable');
 assert.equal((await recordGeneratedComment(selected('Mostre a imagem 42.'),{...input,quote:'imagem 42'},fetchApi,undefined,[{id:id(8),ordinal:42}])).feedbackStatus,'quote_not_found');
 assert.equal(calls,0);
});

test('imagem mostrada de outro projeto ou não concluída não recebe comentário',async()=>{
 const state=selected('Na imagem 42, gostei do contraste.');const input={projectId,requestId:id(15),revision:0,ordinal:42,quote:'gostei do contraste'};
 let posted=0;for(const row of [{id:id(8),project_id:id(99),state:'completed',ordinal:42},{id:id(8),project_id:projectId,state:'running',ordinal:42}]){
  const result=await recordGeneratedComment(state,input,async(url)=>{if(url.startsWith('/api/studio/explorations?'))return Response.json({images:[row]});posted++;return new Response('{}',{status:201});},undefined,[{id:id(8),ordinal:42}]);
  assert.equal(result.feedbackStatus,'reference_unavailable');
 }
 assert.equal(posted,0);
});

test('comentário por número atravessa ferramenta e recibo sem registrar novamente',async()=>{
 let state=selected('Na imagem 42, gostei do contraste.'),posts=0;
 const fetchApi=async(url)=>url.startsWith('/api/studio/explorations?')?Response.json({images:[{id:id(8),project_id:projectId,state:'completed',ordinal:42}]}):(posts++,new Response('{}',{status:201}));
 const tools=createStudioTools({getScope:()=>({userId,projectId,revision:state.revision}),handlers:{compor_comentar_imagem_gerada:input=>recordGeneratedComment(state,input,fetchApi,undefined,[{id:id(8),ordinal:42}])},getReceipt:requestId=>state.actionReceipts.find(receipt=>receipt.requestId===requestId),saveReceipt:async receipt=>{state=recordActionReceipt(state,receipt);return {...receipt.result,revision:state.revision};}});
 const input={projectId,requestId:id(15),revision:state.revision,ordinal:42,quote:'gostei do contraste'};
 assert.equal((await tools.execute('compor_comentar_imagem_gerada',input)).feedbackStatus,'recorded');
 assert.equal(parseStudioState(state).actionReceipts[0].result.feedbackStatus,'recorded');
 assert.equal((await tools.execute('compor_comentar_imagem_gerada',input)).feedbackStatus,'recorded');assert.equal(posts,1);
});

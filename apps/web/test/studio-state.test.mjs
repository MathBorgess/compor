import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,updateBrief,updatePersona,createPost,selectVersion,selectDraft,getCurrentDraft,editDraft,setCreativeField,removeCreativeField,addMessage,addMark,addReference,removeReference,prepareAdjustment,settleAdjustment,approveDraft,recordSavedVersion,pendingSelectionQuestion,REFERENCE_SELECTION_EVENT} from '../lib/studio-state.ts';
import {setDraftCarouselArt,setDraftCarouselRender} from '../lib/studio-state.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-11-05T12:00:00.000Z';
const content={headline:'Peça sintética',price:'R$ 20',date:'10/11',caption:'Legenda sintética',captionOrigin:'user'};
const initial=()=>createStudioState({userId:id(1),projectId:id(2)});
const selected=()=>selectVersion(initial(),{pieceId:id(3),version:2,latestVersion:5,content});
const reference={id:id(8),name:'sintetica.png',mime:'image/png',size:200,width:10,height:10};

test('arte da lâmina invalida a composição de forma vinculada e conserva o snapshot anterior',()=>{
 const frameId=id(10), other=id(11), closing=id(12);
 const layouts=[{layout:'split_horizontal'}, {layout:'svg_diagram',diagram:'flow'}, {layout:'cta_closing'}];
 const alt='Arte independente da manchete.';
 const frames=[frameId,other,closing].map((id,index)=>({id,position:index+1,role:'Insight',headline:'Lâmina '+index,body:'',visualCue:'',assetId:null}));
 const carouselPlan={mode:'editorial_art',slides:frames.map((frame,index)=>({frameId:frame.id,alt,...layouts[index]}))};
 const receipt={planSha256:'f'.repeat(64),frames:frames.map(({id})=>({frameId:id,sha256:'a'.repeat(64),alt}))};
 const opened=selectVersion(initial(),{pieceId:id(3),version:1,latestVersion:1,content:{...content,format:'carousel',frames,carouselPlan}});
 const completed=setDraftCarouselRender(opened,getCurrentDraft(opened),receipt);
 const source=getCurrentDraft(completed);
 const input={pieceId:source.pieceId,baseVersion:source.baseVersion,frameId,artSha256:'b'.repeat(64)};
 const attached=setDraftCarouselArt(completed,input);
 assert.equal(getCurrentDraft(attached).content.carouselPlan.slides[0].artSha256,input.artSha256);
 assert.equal(getCurrentDraft(attached).content.carouselRender,undefined);
 assert.deepEqual(getCurrentDraft(completed).content.carouselRender,receipt);
 assert.equal(setDraftCarouselArt(attached,input),attached);
 assert.throws(()=>setDraftCarouselRender(attached,source,receipt), {code:'studio_carousel_changed'});
 assert.throws(()=>setDraftCarouselArt(attached,{...input,frameId:other}));
 assert.throws(()=>setDraftCarouselArt(attached,{...input,frameId:closing}));
 const removed=setDraftCarouselArt(attached,{...input,artSha256:null});
 assert.deepEqual(getCurrentDraft(removed).content.carouselPlan,carouselPlan);
});

test('state local é segregado, versionado e imutável, sem campo ou conteúdo de chave',()=>{
 const state=updateBrief(initial(),{offer:'Curso fictício'});
 assert.equal(initial().brief.offer,'');
 assert.equal(state.revision,1);assert.equal(state.projectId,id(2));
 assert.throws(()=>{state.brief.offer='Outra';},TypeError);
 assert.deepEqual(parseStudioState(JSON.parse(JSON.stringify(state))),state);
 assert.throws(()=>parseStudioState({...state,apiKey:'qualquer'}));
 assert.throws(()=>updateBrief(state,{offer:`Não guardar sk-${'a'.repeat(30)}`}));
 assert.throws(()=>updatePersona(state,{claims:[{id:id(9),text:'Hipótese',provenance:'certeza_inventada',source:''}]}));
 assert.throws(()=>parseStudioState({...state,schemaVersion:99}));
});

test('navegar preserva rascunhos separados e base anterior não vira latest silenciosamente',()=>{
 let state=editDraft(selected(),{field:'headline',value:'Alteração local'});
 state=selectVersion(state,{pieceId:id(3),version:5,latestVersion:5,content});
 assert.equal(getCurrentDraft(state).baseVersion,5);
 state=selectVersion(state,{pieceId:id(3),version:2,latestVersion:6,content});
 assert.equal(getCurrentDraft(state).content.headline,'Alteração local');
 assert.equal(getCurrentDraft(state).expectedLatestVersion,5);
 const created=createPost(state,{pieceId:id(4)});
 assert.equal(created.drafts.length,3);
 assert.equal(createPost(created,{pieceId:id(4)}),created,'mesma criação não cria outro rascunho');
});

test('a origem da legenda acompanha a edição manual e a proposta do agente',()=>{
 const state=selected(),authored=getCurrentDraft(state).content.caption;
 const repeated=editDraft(state,{field:'caption',value:authored,captionOrigin:'agent'});
 assert.equal(getCurrentDraft(repeated).content.captionOrigin,'user');
 const proposed=editDraft(repeated,{field:'caption',value:'Proposta do agente',captionOrigin:'agent'});
 assert.equal(getCurrentDraft(proposed).content.captionOrigin,'agent');
 const manual=editDraft(proposed,{field:'caption',value:'Legenda revisada pela pessoa'});
 assert.equal(getCurrentDraft(manual).content.captionOrigin,'user');
 assert.equal(getCurrentDraft(state).content.caption,authored);
});

test('reabrir uma versão sem edições reflete aprovação e revisão autoritativas do servidor',()=>{
 const original=selected(),approval={status:'approved',kind:'explicit',sourceVersion:2,at};
 let state=selectVersion(original,{pieceId:id(3),version:2,latestVersion:6,content,approval});
 assert.deepEqual(getCurrentDraft(state).approval,approval);
 assert.equal(getCurrentDraft(state).expectedLatestVersion,6);
 assert.deepEqual(getCurrentDraft(original).approval,{status:'unapproved'});
 state=selectVersion(state,{pieceId:id(3),version:2,latestVersion:6,content,approval:{status:'unapproved'}});
 assert.deepEqual(getCurrentDraft(state).approval,{status:'unapproved'});
});

test('reabrir uma versão com edições preserva o rascunho e a aprovação da base local',()=>{
 const approval={status:'approved',kind:'explicit',sourceVersion:2,at};
 let state=selectVersion(initial(),{pieceId:id(3),version:2,latestVersion:5,content,approval});
 state=editDraft(state,{field:'headline',value:'Edição que ainda não foi salva'});
 state=selectVersion(state,{pieceId:id(3),version:2,latestVersion:6,content,approval:{status:'unapproved'}});
 const draft=getCurrentDraft(state);
 assert.equal(draft.content.headline,'Edição que ainda não foi salva');assert.equal(draft.dirty,true);
 assert.equal(draft.expectedLatestVersion,5);assert.deepEqual(draft.approval,approval);
});

test('retoma um rascunho local existente sem substituir seu conteúdo nem seleção em erro',()=>{
 let state=createPost(selected(),{pieceId:id(10)});
 state=editDraft(state,{field:'headline',value:'Ainda não salvo'});
 state=selectVersion(state,{pieceId:id(3),version:5,latestVersion:5,content});
 state=selectDraft(state,{pieceId:id(10),baseVersion:0});
 assert.equal(getCurrentDraft(state).content.headline,'Ainda não salvo');
 assert.equal(getCurrentDraft(state).dirty,true);
 const before=state;
 assert.throws(()=>selectDraft(state,{pieceId:id(11),baseVersion:0}),error=>error.code==='studio_draft_unavailable');
 assert.equal(state,before);assert.equal(state.selection.pieceId,id(10));
});

test('pedido congela mensagem, base, marcações e referências mesmo após mudar seleção',()=>{
 let state=addReference(selected(),reference);
 state=addMark(state,{id:id(10),kind:'area',x:.1,y:.2,width:.3,height:.4,note:'Ajustar cor'});
 state=addMark(state,{id:id(11),kind:'element',elementId:'headline',note:'Dar destaque'});
 state=prepareAdjustment(state,{requestId:id(20),messageId:id(21),instruction:'Ajuste somente a área indicada',createdAt:at,eventId:id(22)});
 const frozen=state.adjustments[0].context;
 state=createPost(state,{pieceId:id(4)});
 state=removeReference(state,id(8));
 assert.equal(frozen.pieceId,id(3));assert.equal(frozen.baseVersion,2);assert.equal(frozen.expectedLatestVersion,5);
 assert.equal(frozen.marks.length,2);assert.equal(frozen.references[0].id,id(8));
 assert.equal(state.references.length,0);assert.equal(state.adjustments[0].context.references.length,1);
 assert.throws(()=>{frozen.marks[0].x=.9;},TypeError);
 state=settleAdjustment(state,{requestId:id(20),status:'completed',result:{messageId:id(23),text:'Proposta da mesma base'},eventId:id(24),createdAt:at});
 assert.equal(state.messages[1].context.pieceId,id(3));assert.equal(getCurrentDraft(state).pieceId,id(4));
 assert.equal(state.messages[1].context.baseVersion,2);
});

test('resultado desconhecido impede novo pedido e consulta não é tratada como nova execução',()=>{
 let state=prepareAdjustment(selected(),{requestId:id(20),messageId:id(21),instruction:'Alterar o título',createdAt:at,eventId:id(22)});
 state=settleAdjustment(state,{requestId:id(20),status:'unknown',result:{assetId:id(99)},eventId:id(23)});
 assert.throws(()=>prepareAdjustment(state,{requestId:id(30),messageId:id(31),instruction:'Repetir',createdAt:at,eventId:id(32)}),error=>error.code==='studio_operation_active');
 state=settleAdjustment(state,{requestId:id(20),status:'completed',result:{messageId:id(24),text:'Concluído após consulta'},createdAt:at,eventId:id(25)});
 assert.equal(state.adjustments.length,1);assert.equal(state.messages.filter(m=>m.role==='assistant').length,1);
 assert.equal(state.adjustments[0].result.assetId,id(99),'artefato conhecido não se perde com resultado do turno incerto');
 assert.throws(()=>settleAdjustment(state,{requestId:id(20),status:'in_progress',eventId:id(26)}),error=>error.code==='studio_operation_terminal');
});

test('marcas fora da arte e vínculos de mensagem adulterados são rejeitados',()=>{
 assert.throws(()=>addMark(selected(),{id:id(9),kind:'area',x:.9,y:0,width:.2,height:.2,note:''}));
 assert.throws(()=>addMark(selected(),{id:id(9),kind:'element',elementId:'',note:''}));
 let state=prepareAdjustment(selected(),{requestId:id(20),messageId:id(21),instruction:'Alterar',createdAt:at,eventId:id(22)});
 const changed=JSON.parse(JSON.stringify(state));changed.messages[0].context.pieceId=id(4);
 assert.throws(()=>parseStudioState(changed));
 const foreign=JSON.parse(JSON.stringify(state));foreign.adjustments[0].context.projectId=id(7);
 assert.throws(()=>parseStudioState(foreign));
 assert.throws(()=>addMessage(state,{id:id(9),role:'assistant',text:'Mensagem',createdAt:'ontem'}));
});

test('nova versão a partir da antiga fica atual e herda aprovação com origem real',()=>{
 let state=approveDraft(selected(),{at,eventId:id(40)});
 state=editDraft(state,{field:'caption',value:'Ajuste da base antiga'});
 const saved={...content,caption:'Ajuste da base antiga'};
 state=recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:saved,eventId:id(41)});
 const current=getCurrentDraft(state);
 assert.equal(current.baseVersion,6);assert.equal(current.expectedLatestVersion,6);
 assert.deepEqual(current.approval,{status:'approved',kind:'inherited',sourceVersion:2,at});
 assert.equal(state.drafts.find(item=>item.baseVersion===2).content.caption,'Ajuste da base antiga');
 assert.equal(recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:saved,eventId:id(41)}),state);
 assert.throws(()=>recordSavedVersion(state,{pieceId:id(3),baseVersion:6,version:8,content:saved,eventId:id(42)}),error=>error.code==='studio_version_conflict');
});

test('salvamento adota a aprovação do servidor mesmo quando a base local não a conhecia',()=>{
 const approval={status:'approved',kind:'inherited',sourceVersion:2,at};
 let state=recordSavedVersion(selected(),{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval});
 assert.deepEqual(getCurrentDraft(state).approval,approval);
 assert.deepEqual(state.drafts.find(item=>item.baseVersion===2).approval,{status:'unapproved'});
 assert.equal(recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval}),state);
 state=recordSavedVersion(approveDraft(selected(),{at,eventId:id(40)}),{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval:{status:'unapproved'}});
 assert.deepEqual(getCurrentDraft(state).approval,{status:'unapproved'},'o retorno autoritativo também pode negar a herança calculada localmente');
 const explicit={status:'approved',kind:'explicit',sourceVersion:6,at};
 state=recordSavedVersion(selected(),{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval:explicit});
 assert.deepEqual(getCurrentDraft(state).approval,explicit);
});

test('aprovação retornada deve corresponder à versão salva e não altera a seleção feita durante a espera',()=>{
 const approval={status:'approved',kind:'inherited',sourceVersion:2,at};
 const source=selected();
 for(const invalid of [
  {status:'approved',kind:'explicit',sourceVersion:2,at},
  {status:'approved',kind:'inherited',sourceVersion:7,at},
  {...approval,at:'2026-11-05T12:00:00+00:00'},
 ])assert.throws(()=>recordSavedVersion(source,{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval:invalid}));
 let state=createPost(source,{pieceId:id(4)});
 state=editDraft(state,{field:'headline',value:'Outro post em edição'});
 state=recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content,eventId:id(41),approval});
 assert.equal(getCurrentDraft(state).pieceId,id(4));assert.equal(getCurrentDraft(state).content.headline,'Outro post em edição');
 assert.deepEqual(state.drafts.find(item=>item.pieceId===id(3)&&item.baseVersion===6).approval,approval);
});

test('resposta de salvamento preserva alterações feitas enquanto aguardava',()=>{
 let state=editDraft(selected(),{field:'headline',value:'Versão submetida'});
 const submitted={...getCurrentDraft(state).content};
 state=editDraft(state,{field:'headline',value:'Mais uma alteração local'});
 const approval={status:'approved',kind:'inherited',sourceVersion:2,at};
 state=recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:submitted,eventId:id(41),approval});
 assert.equal(getCurrentDraft(state).baseVersion,6);
 assert.equal(getCurrentDraft(state).expectedLatestVersion,6);
 assert.equal(getCurrentDraft(state).content.headline,'Mais uma alteração local');
 assert.equal(getCurrentDraft(state).dirty,true);
 assert.equal(state.drafts.find(item=>item.baseVersion===6).content.headline,'Mais uma alteração local');
 assert.deepEqual(state.drafts.find(item=>item.baseVersion===6).approval,approval);
 assert.throws(()=>approveDraft(state,{at,eventId:id(42)}),error=>error.code==='studio_unsaved_draft');
 const fresh=createPost(initial(),{pieceId:id(9)});
 assert.throws(()=>approveDraft(fresh,{at,eventId:id(43)}),error=>error.code==='studio_unsaved_draft');
});

const freshPost=()=>Object.entries(content).filter(([field])=>field!=='captionOrigin').reduce((state,[field,value])=>editDraft(state,{field,value}),createPost(initial(),{pieceId:id(3)}));
const reorderedContent=value=>({date:value.date,price:value.price,caption:value.caption,headline:value.headline,captionOrigin:value.captionOrigin});

test('primeiro salvamento segue a versão limpa mesmo quando o servidor reordena as chaves JSONB',()=>{
 const source=freshPost(),submitted=getCurrentDraft(source).content;
 const saved=recordSavedVersion(source,{pieceId:id(3),baseVersion:0,version:1,content:reorderedContent(submitted),eventId:id(41)});
 const current=getCurrentDraft(saved);
 assert.equal(current.baseVersion,1);assert.equal(current.expectedLatestVersion,1);assert.equal(current.dirty,false);
 assert.deepEqual(current.content,submitted);
 assert.equal(saved.drafts.find(draft=>draft.baseVersion===0).dirty,false);
 assert.equal(getCurrentDraft(approveDraft(saved,{at,eventId:id(42)})).approval.status,'approved');
 assert.equal(getCurrentDraft(source).baseVersion,0,'o snapshot anterior permanece imutável');
});

test('resposta com chaves reordenadas preserva cada alteração de conteúdo feita durante a espera',()=>{
 for(const field of ['headline','price','date','caption']){
  const source=freshPost(),submitted=getCurrentDraft(source).content;
  const edited=editDraft(source,{field,value:`Alteração posterior de ${field}`});
  const saved=recordSavedVersion(edited,{pieceId:id(3),baseVersion:0,version:1,content:reorderedContent(submitted),eventId:id(41)});
  const current=getCurrentDraft(saved);
  assert.equal(current.baseVersion,1,field);assert.equal(current.expectedLatestVersion,1,field);assert.equal(current.dirty,true,field);
  assert.equal(current.content[field],`Alteração posterior de ${field}`);
 }
 const source=selectVersion(initial(),{pieceId:id(3),version:1,latestVersion:1,content:{...content,captionOrigin:'agent'}});
 const edited=editDraft(source,{field:'caption',value:content.caption});
 const saved=recordSavedVersion(edited,{pieceId:id(3),baseVersion:1,version:2,content:reorderedContent(getCurrentDraft(source).content),eventId:id(41)});
 assert.equal(getCurrentDraft(saved).baseVersion,2);assert.equal(getCurrentDraft(saved).expectedLatestVersion,2);assert.equal(getCurrentDraft(saved).dirty,true);
 assert.equal(getCurrentDraft(saved).content.captionOrigin,'user','a autoria também faz parte do conteúdo');
});

test('evento duplicado com outra ordem de chaves é inócuo e não aceita conteúdo divergente',()=>{
 const source=freshPost(),submitted=getCurrentDraft(source).content;
 const args={pieceId:id(3),baseVersion:0,version:1,content:submitted,eventId:id(41)};
 const saved=recordSavedVersion(source,args);
 assert.equal(recordSavedVersion(saved,{...args,content:reorderedContent(submitted)}),saved);
 assert.equal(saved.events.length,1);assert.equal(saved.revision,source.revision+1);
 assert.throws(()=>recordSavedVersion(saved,{...args,content:{...reorderedContent(submitted),headline:'Outro título'}}),error=>error.code==='studio_version_conflict');
 assert.throws(()=>recordSavedVersion(saved,{...args,content:{...reorderedContent(submitted),extra:'campo inesperado'}}),error=>error.code==='studio_version_conflict');
});

test('iniciativa das referências preserva evento interno e não inventa mensagem da pessoa',async()=>{
 const {REFERENCE_SELECTION_EVENT}=await import('../lib/studio-state.ts');
 let state=prepareAdjustment(selected(),{requestId:id(20),messageId:id(21),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at,eventId:id(22)});
 assert.equal(state.messages.at(-1).role,'system');assert.equal(state.messages.filter(item=>item.role==='user').length,0);
 state=settleAdjustment(state,{requestId:id(20),status:'completed',result:{messageId:id(23),text:'Essas referências parecem mais editoriais. É por aí?'},createdAt:at,eventId:id(24)});
 assert.equal(state.messages.at(-1).role,'assistant');assert.doesNotThrow(()=>parseStudioState(state));
 assert.throws(()=>prepareAdjustment(selected(),{requestId:id(30),messageId:id(31),instruction:'fala inventada',origin:'system',createdAt:at,eventId:id(32)}));
});


test('campos dinâmicos preservam versões antigas e fazem parte do rascunho salvo',()=>{
 const previous=selected(); const field={id:id(50),label:'Local',value:'Ateliê central',origin:'user'};
 const edited=setCreativeField(previous,field);assert.equal(getCurrentDraft(edited).content.fields[0].value,'Ateliê central');assert.equal(getCurrentDraft(previous).content.fields,undefined);
 const result=recordSavedVersion(edited,{pieceId:id(3),baseVersion:2,version:6,content:getCurrentDraft(edited).content,eventId:id(51)});
 assert.equal(getCurrentDraft(result).content.fields[0].label,'Local');
 const without=removeCreativeField(result,id(50));assert.deepEqual(getCurrentDraft(without).content.fields,[]);assert.equal(getCurrentDraft(result).content.fields.length,1);
 assert.throws(()=>setCreativeField(previous,{...field,label:' '}));assert.throws(()=>setCreativeField(previous,{...field,value:'sk-segredo'}));
});

test('campos dinâmicos com chaves reordenadas pelo banco não criam rascunho sujo',()=>{
 const before=setCreativeField(selected(),{id:id(60),label:'Data da oficina',value:'20/11',origin:'user'}), sent=getCurrentDraft(before).content;
 const returned={captionOrigin:sent.captionOrigin,caption:sent.caption,date:sent.date,price:sent.price,headline:sent.headline,fields:[{value:'20/11',origin:'user',label:'Data da oficina',id:id(60)}]};
 const state=recordSavedVersion(before,{pieceId:id(3),baseVersion:2,version:6,content:returned,eventId:id(61)});
 assert.equal(getCurrentDraft(state).dirty,false);assert.equal(getCurrentDraft(state).content.fields[0].value,'20/11');
});

test('pergunta do turno de seleção aguarda uma mensagem da pessoa ou nova imagem selecionada',()=>{
 const reply=(state,request,origin,instruction)=>settleAdjustment(prepareAdjustment(state,{requestId:id(request),messageId:id(request+1),instruction,origin,createdAt:at,eventId:id(request+2)}),{requestId:id(request),status:'completed',result:{messageId:id(request+3),text:'Leitura.\n\n**Recomendação:** Serifada.\n\nPosso seguir pela serifada?'},createdAt:at,eventId:id(request+4)});
 const asked=reply(addReference(selected(),reference),40,'system',REFERENCE_SELECTION_EVENT);
 assert.equal(pendingSelectionQuestion(asked),id(43));
 assert.equal(pendingSelectionQuestion(prepareAdjustment(asked,{requestId:id(50),messageId:id(51),instruction:'Pode seguir',createdAt:at,eventId:id(52)})),null,'mensagem da pessoa responde');
 assert.equal(pendingSelectionQuestion(addReference(asked,{...reference,id:id(60)})),null,'nova imagem selecionada responde');
 assert.equal(pendingSelectionQuestion(reply(asked,50,'user','Pode seguir')),null,'resposta a uma mensagem da pessoa não pausa a exploração');
 assert.equal(pendingSelectionQuestion(selected()),null);
});

test('editar briefing, remover referência ou falhar turno automático não responde a pergunta anterior',()=>{
 const request={requestId:id(40),messageId:id(41),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at,eventId:id(42)};
 const asked=settleAdjustment(prepareAdjustment(addReference(selected(),reference),request),{requestId:id(40),status:'completed',result:{messageId:id(43),text:'Posso seguir pela serifada?'},createdAt:at,eventId:id(44)});
 const edited=updateBrief(asked,{offer:'Outra oficina'});
 const changed=removeReference(edited,reference.id);
 const pending=prepareAdjustment(changed,{...request,requestId:id(50),messageId:id(51),eventId:id(52)});
 assert.equal(pendingSelectionQuestion(edited),id(43));
 assert.equal(pendingSelectionQuestion(changed),id(43));
 assert.equal(pendingSelectionQuestion(pending),id(43),'turno automático em andamento preserva espera');
 const failed=settleAdjustment(pending,{requestId:id(50),status:'failed',eventId:id(53)});
 assert.equal(pendingSelectionQuestion(parseStudioState(JSON.parse(JSON.stringify(failed)))),id(43),'falha e recarga preservam espera');
 const next=settleAdjustment(prepareAdjustment(failed,{...request,requestId:id(60),messageId:id(61),eventId:id(62)}),{requestId:id(60),status:'completed',result:{messageId:id(63),text:'Posso seguir pelo contraste?'},createdAt:at,eventId:id(64)});
 assert.equal(pendingSelectionQuestion(next),id(63),'nova pergunta substitui a anterior');
 assert.equal(pendingSelectionQuestion(addMessage(failed,{id:id(70),role:'assistant',text:'Aviso técnico.',createdAt:at})),id(43),'outra mensagem automática não responde');
 assert.equal(pendingSelectionQuestion(addMessage(failed,{id:id(71),role:'user',text:'Pode seguir.',createdAt:at})),null);
});

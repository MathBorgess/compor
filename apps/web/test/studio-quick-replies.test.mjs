import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTasteReply,readQuickReplies,rememberQuickReply,recordQuickReplyAnswer,quickReplyStatus,quickReplyMessage,quickReplyKey} from '../lib/studio-quick-replies.ts';
import {tasteReadingReply,parseTasteReading} from '../../../packages/agents-api/src/taste-reading.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reading={leitura:'As referências são editoriais.',recomendacao:'Siga a serifada, porque conversa com quem compra presente.',pergunta:'Posso seguir pela serifada?',opcoes:{sintese:'Serifada com respiro.',alternativas:[{rotulo:'Mais sóbrio',descricao:'Tons neutros e tipografia leve.'},{rotulo:'Agressivo',descricao:'Cores saturadas e contraste alto.'}]}};
const reply=tasteReadingReply(parseTasteReading(JSON.stringify(reading)));
class Memory{constructor(){this.map=new Map();}getItem(key){return this.map.has(key)?this.map.get(key):null;}setItem(key,value){this.map.set(key,String(value));}}
const entry=(overrides={})=>({messageId:id(10),requestId:id(11),fingerprint:'["a"]',context:'c'.repeat(64),epoch:'initial',reply,answer:null,...overrides});

test('the client accepts exactly what the server builds and rejects anything outside the closed contract',()=>{
 assert.deepEqual(parseTasteReply(reply),reply);
 assert.deepEqual(parseTasteReply(tasteReadingReply(parseTasteReading(JSON.stringify({...reading,opcoes:undefined})))).options.map(option=>option.id),['agree','adjust']);
 const invalid=[
  undefined,null,'texto',[],
  {...reply,version:2},{...reply,kind:'other'},{...reply,extra:true},
  {...reply,options:[{id:'run',intent:'tool',label:'Gerar imagem'},...reply.options]},
  {...reply,options:[...reply.options.slice(0,3),{id:'adjust',intent:'adjust',label:'<b>Ajustar</b>'}]},
  {...reply,options:[{...reply.options[0],label:'Aprovo'},...reply.options.slice(1)]},
  {...reply,options:[reply.options[1],reply.options[0],...reply.options.slice(2)]},
  {...reply,options:[reply.options[0],reply.options[2],reply.options[1],reply.options[3]]},
  {...reply,options:[reply.options[0],{...reply.options[1],label:'Veja https://x.y'},reply.options[3]]},
  {...reply,options:[reply.options[0],{...reply.options[1],description:'Pergunta?'},reply.options[3]]},
  {...reply,options:[reply.options[0],{...reply.options[1],onClick:'alert(1)'},reply.options[3]]},
  {...reply,options:[reply.options[0],{...reply.options[1],label:'Agressivo'},reply.options[2],reply.options[3]]},
  {...reply,options:[reply.options[0]]},
  {...reply,reading:'a'.repeat(1201)},{...reply,question:'  '},{...reply,recommendation:'Use sk-abcdefghijklmnopqrstuv'},
  {...reply,synthesis:'**forte**'},
 ];
 for(const value of invalid)assert.equal(parseTasteReply(value),null,String(JSON.stringify(value)).slice(0,120));
});

test('stored entries are validated one by one and only the first answer is kept',()=>{
 const storage=new Memory(),key=quickReplyKey(id(1),id(2));
 assert.deepEqual(readQuickReplies(storage,key),[]);
 rememberQuickReply(storage,key,entry());
 storage.setItem(key,JSON.stringify({version:1,entries:[...JSON.parse(storage.getItem(key)).entries,{...entry({messageId:id(12)}),reply:{...reply,version:9}},{messageId:'x'}]}));
 assert.deepEqual(readQuickReplies(storage,key).map(item=>item.messageId),[id(10)],'defective entries fall back to text');
 assert.equal(recordQuickReplyAnswer(storage,key,id(10),{optionId:'agree',userMessageId:id(20)}),true);
 assert.equal(recordQuickReplyAnswer(storage,key,id(10),{optionId:'prefer_1',userMessageId:id(21)}),false);
 assert.deepEqual(readQuickReplies(storage,key)[0].answer,{optionId:'agree',userMessageId:id(20)});
 assert.equal(recordQuickReplyAnswer(storage,key,id(99),{optionId:'agree',userMessageId:id(20)}),false);
 for(const raw of ['{','null','{"version":2,"entries":[]}','{"version":1,"entries":{}}'])assert.deepEqual(readQuickReplies({getItem:()=>raw},key),[],raw);
 assert.deepEqual(readQuickReplies({getItem:()=>{throw Error('blocked');}},key),[]);
 for(let index=0;index<20;index++)rememberQuickReply(storage,key,entry({messageId:id(100+index)}));
 assert.equal(readQuickReplies(storage,key).length,12,'the sidecar stays bounded');
});

test('status follows the human answer, newer readings and the reading context',()=>{
 const current={fingerprint:'["a"]',epoch:'initial',context:'c'.repeat(64)},base=[{id:id(9),role:'system'},{id:id(10),role:'assistant'}];
 assert.deepEqual(quickReplyStatus(entry(),base,current),{kind:'active'});
 assert.deepEqual(quickReplyStatus(entry(),base,{...current,context:null}),{kind:'checking'});
 assert.deepEqual(quickReplyStatus(entry(),[...base,{id:id(20),role:'user'}],current),{kind:'answered',optionId:null});
 assert.deepEqual(quickReplyStatus(entry({answer:{optionId:'prefer_2',userMessageId:id(20)}}),[...base,{id:id(20),role:'user'}],current),{kind:'answered',optionId:'prefer_2'});
 assert.deepEqual(quickReplyStatus(entry({answer:{optionId:'agree',userMessageId:id(21)}}),[...base,{id:id(20),role:'user'},{id:id(21),role:'user'}],current),{kind:'answered',optionId:null},'only the first human answer counts');
 assert.deepEqual(quickReplyStatus(entry(),[...base,{id:id(30),role:'system'},{id:id(31),role:'assistant'}],current),{kind:'obsolete',reason:'superseded'});
 assert.deepEqual(quickReplyStatus(entry(),[...base,{id:id(30),role:'system'}],{...current,fingerprint:'["a","b"]'}),{kind:'obsolete',reason:'context_changed'});
 assert.deepEqual(quickReplyStatus(entry(),base,{...current,epoch:'new'}),{kind:'obsolete',reason:'context_changed'});
 assert.deepEqual(quickReplyStatus(entry(),base,{...current,context:'d'.repeat(64)}),{kind:'obsolete',reason:'context_changed'});
 assert.deepEqual(quickReplyStatus(entry(),[{id:id(40),role:'assistant'}],current),{kind:'obsolete',reason:'superseded'});
});

test('the recorded human message names what was agreed or preferred; adjust sends nothing',()=>{
 assert.equal(quickReplyMessage(reply,reply.options[0]),'Concordo com a recomendação: Serifada com respiro.');
 assert.equal(quickReplyMessage({...reply,synthesis:undefined},reply.options[0]),'Concordo com a sua recomendação.');
 assert.equal(quickReplyMessage(reply,reply.options[2]),'Prefiro esta alternativa: Agressivo — Cores saturadas e contraste alto.');
 assert.equal(quickReplyMessage(reply,reply.options[3]),null);
});

import {createStudioState,createPost,prepareAdjustment} from '../lib/studio-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),project=id(2),piece=id(3),first=id(4),second=id(5),foreignPiece=id(6);
// The real StudioChat with an in-memory studio state persisted in sessionStorage, so reloads keep the history.
const source=`
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioChat from './studio/studio-chat.tsx';
import {createStudioState,createPost,addMessage,addReference,parseStudioState} from './lib/studio-state.ts';
import {recordReferenceRound} from './lib/studio-reference-round.ts';
const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;canvas.getContext('2d').fillRect(0,0,4,4);
const file=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
const reference=id=>({id,name:'Referência',mime:'image/png',size:file.size,width:4,height:4,source:{originUrl:'https://www.pinterest.com/pin/'+id.slice(-3)+'/',board:'behance/typography'}});
function initial(){const saved=sessionStorage.getItem('fixture-state');if(saved)return parseStudioState(JSON.parse(saved));let state=createPost(createStudioState({userId:'${user}',projectId:'${project}'}),{pieceId:'${piece}'});return addReference(state,reference('${first}'));}
function Fixture(){const [key,setKey]=useState(()=>sessionStorage.getItem('fixture-key')==='1'),[state,setState]=useState(initial),current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});
function change(fn){const next=fn(current.current);current.current=next;sessionStorage.setItem('fixture-state',JSON.stringify(next));setState(next);return next;}
function choose(fn){change(fn);recordReferenceRound(current.current);}
return <main><button onClick={()=>{sessionStorage.setItem('fixture-key','1');setKey(true);}}>Conectar</button><button onClick={()=>choose(s=>addReference(s,reference('${second}')))}>Selecionar outra</button><button onClick={()=>change(s=>addMessage(s,{id:crypto.randomUUID(),role:'user',text:'Mensagem do outro post',createdAt:new Date().toISOString(),conversationId:'${foreignPiece}',context:{pieceId:'${foreignPiece}',baseVersion:0,expectedLatestVersion:0}}))}>Mensagem outro post</button><output id="snapshot">{JSON.stringify(state)}</output>
<div style={{width:380,height:720,display:'flex'}}><StudioChat state={state} conversationId={__CONVERSATION_SCOPE__} getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={key} getApiKey={()=>key?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':''} loadReference={async()=>({file})} onUseImage={async()=>true}/></div></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const reply={version:1,kind:'taste_reading',reading:'As referências são editoriais e sóbrias.',recommendation:'Siga a tipografia serifada, porque conversa com quem compra presente.',question:'Posso seguir pela tipografia serifada?',synthesis:'Tipografia serifada com respiro editorial',options:[
 {id:'agree',intent:'agree',label:'Concordo'},
 {id:'prefer_1',intent:'prefer',label:'Mais sóbrio',description:'Tons neutros, tipografia leve e mais espaço vazio.'},
 {id:'prefer_2',intent:'prefer',label:'Agressivo',description:'Cores saturadas, contraste alto e tipografia pesada.'},
 {id:'adjust',intent:'adjust',label:'Quero ajustar'},
]};
const text=`${reply.reading}\n\n**Recomendação:** ${reply.recommendation}\n\n${reply.question}`;
async function setup(t,{structured=reply,readOnly=false,workbench=false}={}){ // null omits the structure
 const result=await build({stdin:{contents:source.replace('<StudioChat state=',`<StudioChat referenceWorkbench={${workbench}} readOnly={${readOnly}} state=`).replace('__CONVERSATION_SCOPE__',readOnly?'undefined':'"references"'),loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},alias:{'@compor/agile-deliberation/readiness':fileURLToPath(new URL('../../../packages/agile-deliberation/src/readiness.js',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);}else if(req.url?.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/fixture.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(8000);
 const calls=[],dispatches=new EventEmitter();let release=null,holding=false;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await context.route('**/api/studio/**/signals',route=>route.fulfill({json:{signals:[]}}));
 await context.route('**/api/studio/chat',async route=>{
  const body=route.request().postDataJSON();calls.push(body);dispatches.emit('dispatch');
  if(body.op==='reference_selection')return route.fulfill({json:{status:'completed',text,...(structured===null?{}:{reply:structured})}});
  if(holding)await new Promise(resolve=>{release=resolve;});
  return route.fulfill({json:{status:'completed',text:'Seguimos por essa direção.'}});
 });
 function waitForCalls(count,timeoutMs=9000){
  if(calls.length>=count)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{dispatches.off('dispatch',complete);reject(Error(`Nenhum dispatch ${count} em ${timeoutMs} ms; observados ${calls.length}.`));},timeoutMs);
   const complete=()=>{if(calls.length>=count){clearTimeout(timer);dispatches.off('dispatch',complete);resolve();}};
   dispatches.on('dispatch',complete);
  });
 }
 const snapshot=async()=>JSON.parse(await page.locator('#snapshot').textContent());
 const start=async()=>{await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await waitForCalls(1);};
 const reading=async()=>{await start();await page.getByRole('group',{name:reply.question}).waitFor();};
 return {page,calls,origin,waitForCalls,snapshot,start,reading,hold:()=>{holding=true;},release:()=>{holding=false;release?.();}};
}
const options={skip:!existsSync(browserPath),timeout:45000};
const group=page=>page.getByRole('group',{name:reply.question});

test('leitura estruturada mostra recomendação, pergunta e opções fechadas com descrição',options,async t=>{
 const {page,calls,reading}=await setup(t);await reading();
 assert.equal(calls[0].op,'reference_selection');
 await page.getByRole('heading',{name:'Recomendação'}).waitFor();
 const buttons=group(page).getByRole('button');
 assert.deepEqual(await buttons.evaluateAll(items=>items.map(item=>item.textContent)),['Concordo'+reply.synthesis,'Mais sóbrio'+reply.options[1].description,'Agressivo'+reply.options[2].description,'Quero ajustarEscreva o que mudar, com suas palavras']);
 const aggressive=group(page).getByRole('button',{name:'Agressivo',exact:true});
 assert.equal(await aggressive.evaluate(item=>document.getElementById(item.getAttribute('aria-describedby')).textContent),'Cores saturadas, contraste alto e tipografia pesada.');
 assert.match(await page.locator('.studio-taste-card').textContent(),/Escolher não gera imagem nem aprova a arte/);
 const messages=page.locator('.studio-chat-messages');
 assert.equal(await messages.getByText('**Recomendação:**').count(),0,'a estrutura não aparece como Markdown cru');
 assert.equal(await messages.getByText(reply.recommendation,{exact:true}).count(),1);
});

test('“Concordo” registra resposta humana pelo mesmo envio, uma única vez, sem perder o rascunho',options,async t=>{
 const {page,calls,reading,waitForCalls,snapshot,hold,release}=await setup(t);await reading();
 await page.getByLabel('Sua mensagem').fill('meu rascunho em andamento');
 hold();
 const agree=group(page).getByRole('button',{name:'Concordo',exact:true});
 await agree.dblclick();await page.keyboard.press('Enter');
 await waitForCalls(2);await page.waitForTimeout(400);
 assert.equal(calls.length,2,'clique duplo seguido de Enter envia uma única vez');
 assert.equal(await page.locator('.studio-chat-messages .studio-hint').count(),0,'o segundo clique não vira tentativa recusada nem aviso');
 assert.equal((await snapshot()).adjustments.length,2,'só uma tentativa humana foi preparada além da leitura');
 const sent=calls[1];
 assert.equal(sent.message,'Concordo com a recomendação: Tipografia serifada com respiro editorial.');
 assert.deepEqual(sent.quickReply,{version:1,intent:'agree'});
 assert.equal('previousAttemptKey' in sent,false,'a resposta rápida não reaproveita sessão com ferramentas');
 assert.ok(sent.history.some(item=>item.role==='assistant'&&item.text===text),'a recomendação de origem vai no histórico');
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'meu rascunho em andamento');
 const pending=await snapshot();
 assert.deepEqual(pending.messages.filter(item=>item.role==='user').map(item=>item.text),[sent.message]);
 assert.equal(await page.evaluate(()=>document.activeElement?.className),'studio-quick-reply-status','o foco vai para a confirmação da escolha');
 release();await page.getByText('Seguimos por essa direção.',{exact:true}).waitFor();
 await page.getByText('Você escolheu “Concordo”. A resposta está na conversa.',{exact:true}).waitFor();
 assert.equal(await group(page).getByRole('button',{disabled:false}).count(),0,'opções respondidas ficam desativadas');
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'meu rascunho em andamento');
 await page.reload();await group(page).waitFor();
 await page.getByText('Você escolheu “Concordo”. A resposta está na conversa.',{exact:true}).waitFor();
 assert.equal(await group(page).getByRole('button',{disabled:false}).count(),0,'a resposta continua registrada após recarregar');
 assert.equal(calls.length,2);
});

test('mensagem de outro post não bloqueia a resposta rápida da conversa de referências',options,async t=>{
 const {page,calls,reading,waitForCalls}=await setup(t);await reading();
 await page.getByRole('button',{name:'Mensagem outro post'}).click();
 const agree=group(page).getByRole('button',{name:'Concordo',exact:true});
 assert.equal(await agree.isEnabled(),true,'a opção permanece disponível na conversa atual');
 await agree.click();await waitForCalls(2);
 assert.equal(calls[1].conversationId,'references');
 assert.equal(calls[1].message,'Concordo com a recomendação: Tipografia serifada com respiro editorial.');
 assert.equal(calls[1].history.some(item=>item.text==='Mensagem do outro post'),false);
});

test('alternativa pelo teclado envia a descrição; “Quero ajustar” só abre o compositor',options,async t=>{
 const {page,calls,reading,waitForCalls}=await setup(t);await reading();
 const adjust=group(page).getByRole('button',{name:'Quero ajustar',exact:true});
 await adjust.click();
 const composer=page.getByLabel('Sua mensagem');
 assert.equal(await composer.inputValue(),'Quero ajustar a recomendação: ');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'studio-chat-message-references');
 assert.equal(await composer.evaluate(field=>field.selectionStart===field.value.length&&field.selectionEnd===field.value.length),true);
 // Select immediately on refocus and type in the next frame, as when replacing the suggested prefix.
 await adjust.evaluate(async button=>{
  button.focus();
  button.click();
  document.activeElement.select();
  await new Promise(resolve=>requestAnimationFrame(resolve));
 });
 await page.keyboard.insertText('texto meu');
 await adjust.click();
 assert.equal(await composer.inputValue(),'texto meu','um rascunho existente é preservado');
 await page.waitForTimeout(300);assert.equal(calls.length,1,'ajustar não envia nada');
 await group(page).getByRole('button',{name:'Mais sóbrio',exact:true}).focus();await page.keyboard.press('Space');
 await waitForCalls(2);
 assert.equal(calls[1].message,'Prefiro esta alternativa: Mais sóbrio — Tons neutros, tipografia leve e mais espaço vazio.');
 assert.deepEqual(calls[1].quickReply,{version:1,intent:'prefer'});
 await page.getByText('Você escolheu “Mais sóbrio”. A resposta está na conversa.',{exact:true}).waitFor();
 assert.equal(await composer.inputValue(),'texto meu');
});

test('resposta livre responde à pergunta e mudança de seleção torna opções obsoletas',options,async t=>{
 const free=await setup(t);await free.reading();
 await free.page.getByLabel('Sua mensagem').fill('Quero algo com mais cor');
 await free.page.getByRole('button',{name:'Enviar →',exact:true}).click();await free.waitForCalls(2);
 assert.equal(free.calls[1].message,'Quero algo com mais cor');assert.equal('quickReply' in free.calls[1],false);
 await free.page.getByText('Você respondeu na conversa.',{exact:true}).waitFor();
 assert.equal(await group(free.page).getByRole('button',{disabled:false}).count(),0);
 const changed=await setup(t);await changed.reading();
 await changed.page.getByRole('button',{name:'Selecionar outra'}).click();
 await changed.page.getByText('A seleção ou o contexto mudou depois desta leitura. Estas opções não estão mais ativas.',{exact:true}).waitFor();
 assert.equal(await group(changed.page).getByRole('button',{disabled:false}).count(),0);
 assert.equal(changed.calls.length,1,'nenhuma resposta foi enviada pela opção obsoleta');
});

test('estrutura ausente, inválida ou corrompida mostra apenas o texto da leitura',options,async t=>{
 // Each variant is covered exhaustively in studio-quick-replies.test.mjs; here the rendered fallback is checked.
 const invalid=[null,{...reply,options:[{id:'run',intent:'tool',label:'Gerar imagem'},...reply.options]}];
 for(const structured of invalid){
  const {page,start}=await setup(t,{structured});await start();
  await page.getByText(reply.question,{exact:true}).waitFor();
  assert.equal(await page.getByRole('group',{name:reply.question}).count(),0,String(JSON.stringify(structured)).slice(0,80));
  assert.equal(await page.locator('.studio-taste-card').count(),0);
  assert.equal(await page.getByText('Recomendação:',{exact:true}).count(),1,'o fallback textual mantém a recomendação');
 }
 const {page,origin,reading}=await setup(t);await reading();
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,entries:[{messageId:'x'}]})),`compor-quick-replies:v1:${user}:${project}:references`);
 await page.goto(origin);await page.getByText(reply.question,{exact:true}).waitFor();
 assert.equal(await page.locator('.studio-taste-card').count(),0,'registro corrompido volta ao texto');
});


test('histórico somente leitura consulta pendências sem executar ferramentas nem imagens',options,async t=>{
 const pending=prepareAdjustment(createPost(createStudioState({userId:user,projectId:project}),{pieceId:piece}),{requestId:id(90),messageId:id(91),instruction:'Pedido anterior',createdAt:'2026-11-15T12:00:00.000Z',eventId:id(92)});
 const responses=[{status:'action_required',action:{name:'compor_editar_briefing',args:{projectId:project,requestId:id(93),revision:pending.revision,field:'offer',value:'Não aplicar'}},actionBinding:'historical-tool'},
 {status:'consent_required',attemptId:id(94),prompt:'Não gerar',proposal:{prompt:'Não gerar',operation:'create',baseImageId:null,referenceIds:[]},actionBinding:'historical-image',declineBinding:'historical-decline'}];
 for(const response of responses){
  const {page,origin,snapshot}=await setup(t,{readOnly:true});const requests=[];
  await page.context().addInitScript(({pending,user,project})=>{sessionStorage.setItem('fixture-state',JSON.stringify(pending));sessionStorage.setItem('fixture-key','1');sessionStorage.setItem(`compor-studio-chat:${user}:${project}`,JSON.stringify({requestId:pending.adjustments[0].id,credentialSource:'byok'}));},{pending,user,project});
  await page.route('**/api/studio/chat',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:response});});
  await page.route('**/api/studio/action',()=>{throw Error('histórico não pode executar ação');});
  await page.route('**/api/agent/**',()=>{throw Error('histórico não pode gerar imagem');});
  await page.goto(origin);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
  await page.getByText('Este pedido pertence ao histórico anterior. Seus dados foram preservados; consulte o resultado antes de fazer um novo pedido na conversa do post.',{exact:true}).waitFor();
  assert.deepEqual(requests.map(request=>request.op),['poll']);assert.deepEqual(await snapshot(),pending);assert.equal(await page.getByLabel('Sua mensagem',{exact:true}).isDisabled(),true);
 }
});


test('bancada mantém a decisão ativa ao lado do histórico e recolhe leituras respondidas',options,async t=>{
 const {page,reading,waitForCalls}=await setup(t,{workbench:true});await reading();
 const decision=page.getByRole('complementary',{name:'Decisão atual sobre referências'});
 await decision.getByRole('group',{name:reply.question}).waitFor();
 assert.equal(await decision.locator('.studio-reference-recommendation-summary').isVisible(),true,'a recomendação permanece visível antes de concordar');
 const rationale=decision.locator('.studio-taste-rationale');
 assert.equal(await rationale.evaluate(element=>element.open),false);
 await rationale.locator('summary').click();
 assert.equal(await rationale.getByText(reply.recommendation,{exact:true}).isVisible(),true);
 assert.equal(await page.locator('.studio-chat-messages .studio-taste-card').count(),0);
 const context=page.locator('.studio-chat-context');
 assert.equal(await page.locator('.studio-chat-meta').isVisible(),true,'os controles de contexto permanecem acessíveis na conversa');
 assert.equal(await context.evaluate(element=>element.open),false,'o contexto permanece recolhido enquanto a decisão está ativa');
 await context.locator(':scope > summary').click();assert.equal(await context.locator('.studio-context-title').isVisible(),true);await context.locator(':scope > summary').click();
 await decision.getByRole('button',{name:'Concordo',exact:true}).click();await waitForCalls(2);
 await page.getByText('Seguimos por essa direção.',{exact:true}).waitFor();
 assert.equal(await decision.count(),0);
 const history=page.locator('.studio-taste-history');
 assert.equal(await history.evaluate(element=>element.open),false);
 await page.getByText('Você escolheu “Concordo”. A resposta está na conversa.',{exact:true}).waitFor();
 await history.locator(':scope > summary').click();
 assert.equal(await history.getByRole('group',{name:reply.question}).isVisible(),true);
 assert.equal(await history.getByRole('button',{disabled:false}).count(),0);
 assert.equal(await page.getByLabel('Sua mensagem').isVisible(),true);
});

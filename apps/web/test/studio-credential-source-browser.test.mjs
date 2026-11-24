import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {isolateFixtureHmr} from './fixture-hmr.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),pieceId=id(3),marker=`compor-studio-chat:${userId}:${projectId}:conversation:${pieceId}`;
const ownKey=`sk-synthetic-${'x'.repeat(30)}`;

async function openCredentialFixture(t, component) {
 const fixture=await mkdtemp(new URL('../pages/studio-credential-source-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('index.jsx',`file://${fixture}/`),component);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(6000);
 await isolateFixtureHmr(page,`/${basename(fixture)}`);
 return {page,url:`${origin}/${basename(fixture)}`};
}

test('chat usa a fonte escolhida, preserva pendência e descarta resposta da fonte anterior',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,url}=await openCredentialFixture(t,`'use client';
import {useEffect,useRef,useState} from 'react';import StudioChat from '../../studio/studio-chat';
import {createStudioState,createPost} from '../../lib/studio-state.ts';
export default function Fixture(){const[ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);const[source,setSource]=useState('default'),[epoch,setEpoch]=useState(0),[active,setActive]=useState(false),[messageDraft,setMessageDraft]=useState(undefined),[chatVisible,setChatVisible]=useState(true),[state,setState]=useState(()=>createPost(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{pieceId:'${pieceId}'}));const current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}function choose(value){setSource(value);setEpoch(n=>n+1);setActive(false);}return <main data-ready={ready}><button onClick={()=>choose('default')}>Usar fonte padrão</button><button onClick={()=>choose('byok')}>Usar fonte própria</button><output data-testid="credential">{JSON.stringify({source,epoch,active})}</output><output data-testid="snapshot">{JSON.stringify(state)}</output><button onClick={()=>setChatVisible(value=>!value)}>{chatVisible?'Abrir conexão':'Voltar à conversa'}</button>{chatVisible&&<StudioChat messageDraft={messageDraft} onMessageDraftChange={setMessageDraft} state={state} conversationId="${pieceId}" getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={active} canUseAI={true} credentialSource={source} credentialEpoch={epoch} getApiKey={()=>source==='byok'?'${ownKey}':''} onUseAI={()=>setActive(true)} onUseImage={async()=>{throw Error('unexpected image');}} loadReference={async()=>null}/>}</main>;}`);
 const calls=[],errors=[];let outcome='completed',held;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),body=request.postDataJSON(),headers=request.headers();
  calls.push({path:new URL(request.url()).pathname,body,key:headers['x-compor-openai-key'],mediaType:headers['content-type']});
  if(outcome==='held'){held=route;return;}
  if(outcome==='not_submitted')return route.fulfill({status:503,json:{status:'failed',error:'default_credential_unavailable',failurePhase:'before_submission',requestId:body.requestId,retryAutomatically:false}});
  if(outcome==='unavailable')return route.fulfill({status:503,json:{error:'default_credential_unavailable'}});
  if(outcome==='action')return route.fulfill({status:202,json:{status:'action_required',action:{name:'compor_novo_post',args:{}},actionBinding:'signed-synthetic'}});
  return route.fulfill({status:202,json:outcome==='completed'?{status:'completed',text:'Resposta preservada'}:{status:'unknown',...(outcome==='rejected'?{errorCode:'provider_http_401'}:{})}});
 });
 await page.goto(url);
 // SSR contains the initial textarea value before React has attached its input handler.
 await page.locator('main[data-ready="true"]').waitFor();await page.getByLabel('Sua mensagem').waitFor();
 assert.equal(calls.length,0);assert.equal(JSON.parse(await page.getByTestId('credential').innerText()).active,false,'disponibilidade não ativa a IA');
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'','a ideia do projeto não vira mensagem do post');
 await page.getByLabel('Sua mensagem').fill('Meu rascunho antes da conexão');await page.getByRole('button',{name:'Abrir conexão',exact:true}).click();await page.getByRole('button',{name:'Voltar à conversa',exact:true}).click();
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Meu rascunho antes da conexão','o rascunho atravessa a tela que desmonta o chat');
 await page.getByLabel('Sua mensagem').fill('');await page.getByRole('button',{name:'Abrir conexão',exact:true}).click();await page.getByRole('button',{name:'Voltar à conversa',exact:true}).click();
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'','um rascunho vazio explícito não recupera a ideia inicial');assert.equal(calls.length,0);
 async function send(text){await page.getByLabel('Sua mensagem').fill(text);await page.getByRole('button',{name:'Enviar →',exact:true}).click();}
 await send('Minha primeira ideia');await page.getByText('Resposta preservada',{exact:true}).waitFor();
 assert.equal(calls.length,1);assert.equal(calls[0].key,undefined,'a chave padrão nunca atravessa o navegador');
 assert.equal(JSON.parse(await page.getByTestId('credential').innerText()).active,true);
 const firstRequest=calls[0].body.requestId;
 const drafts=JSON.parse(await page.getByTestId('snapshot').innerText()).drafts;
 outcome='not_submitted';await send('O Vault ficou indisponível depois do status positivo');
 await page.getByText('A IA do Compor está indisponível. Você pode usar sua chave OpenAI ou continuar editando.',{exact:true}).waitFor();
 let stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));
 assert.equal(calls.length,2);assert.equal(stored.requestId,null,'somente a nova tentativa comprovadamente não enviada é encerrada');assert.equal(stored.previousAttemptKey,firstRequest,'a prova não apaga uma sessão anterior');
 assert.deepEqual(JSON.parse(await page.getByTestId('snapshot').innerText()).drafts,drafts);assert.equal(await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).count(),0);
 outcome='completed';
 await page.getByRole('button',{name:'Usar fonte própria',exact:true}).click();await send('Outra ação com minha chave');
 await page.getByLabel('Sua mensagem').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.studio-message[data-role="assistant"]').length===2);
 assert.equal(calls.length,3);assert.equal(calls[2].key,ownKey);assert.equal(Object.hasOwn(calls[2].body,'previousAttemptKey'),false,'trocar fonte inicia sessão nova sem perder a conversa');
 assert.notEqual(calls[2].body.requestId,firstRequest);
 outcome='rejected';await send('Verificar minha chave recusada');await page.getByText('A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.',{exact:true}).waitFor();
 const rejectedCount=calls.length;await page.waitForTimeout(2200);assert.equal(calls.length,rejectedCount,'recusa da BYOK não usa fallback nem consulta automática');assert.equal(calls.at(-1).key,ownKey);
 const ownPending=calls.at(-1).body.requestId;
 await page.getByRole('button',{name:'Usar fonte padrão',exact:true}).click();
 await page.getByText('Esta tentativa começou com sua chave OpenAI. Reconecte a chave original para consultá-la; ela não será reenviada.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).isDisabled(),true);assert.equal(calls.length,rejectedCount);
 stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.equal(stored.requestId,ownPending);assert.equal(stored.credentialSource,'byok');
 await page.getByRole('button',{name:'Usar fonte própria',exact:true}).click();outcome='action';const beforeInactivePoll=calls.length;await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Comece a criar com IA para continuar esta solicitação. Nenhuma nova ação foi executada.',{exact:true}).waitFor();assert.equal(calls.length,beforeInactivePoll+1,'consulta com fonte disponível e IA pausada não executa ferramenta nem ACK');
 outcome='completed';await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor({state:'detached'});
 assert.equal(calls.at(-1).body.requestId,ownPending);assert.equal(calls.at(-1).body.op,'poll');assert.equal(calls.at(-1).key,ownKey);
 await page.getByRole('button',{name:'Usar fonte padrão',exact:true}).click();outcome='rejected';await send('Uma tentativa padrão ficou incerta');
 await page.getByText('Não foi possível confirmar o resultado desta solicitação. Consulte seu estado antes de iniciar outra. Você pode continuar editando.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor();const uncertain=calls.at(-1).body.requestId;
 stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.equal(stored.requestId,uncertain);assert.equal(stored.credentialSource,'default','o 401 mantém a tentativa na fonte original, sem fallback');
 await page.getByLabel('Sua mensagem').fill('Rascunho preservado enquanto consulto a tentativa');
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Rascunho preservado enquanto consulto a tentativa');
 assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true,'editar continua disponível, mas uma tentativa incerta impede um novo envio');
 for(const failure of ['not_submitted','unavailable']){
  outcome=failure;const before=calls.length,responded=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/studio/chat'&&response.status()===503);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await responded;
  await page.getByText('A IA do Compor está indisponível. A tentativa anterior continua preservada para consulta.',{exact:true}).waitFor();
  stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.equal(stored.requestId,uncertain,'falha ao consultar uma tentativa incerta nunca a encerra');assert.equal(calls.length,before+1);assert.equal(calls.at(-1).body.op,'poll');
 }
 outcome='completed';await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor({state:'detached'});
 outcome='held';await send('Resposta em trânsito');
 await page.waitForFunction(marker=>Boolean(JSON.parse(sessionStorage.getItem(marker)||'null')?.requestId),marker);
 const heldDeadline=Date.now()+6000;while(!held){if(Date.now()>heldDeadline)throw Error('requisição em trânsito não observada');await new Promise(resolve=>setTimeout(resolve,20));}
 await page.getByRole('button',{name:'Usar fonte própria',exact:true}).click();
 await held.fulfill({status:202,json:{status:'completed',text:'RESPOSTA_DA_FONTE_ANTERIOR'}}).catch(()=>{});
 await page.getByText('Esta tentativa começou com a IA do Compor. Volte a essa opção para consultá-la; ela não será reenviada.',{exact:true}).waitFor();
 assert.equal(await page.getByText('RESPOSTA_DA_FONTE_ANTERIOR',{exact:true}).count(),0);
 assert.equal(calls.some(call=>Object.hasOwn(call.body,'apiKey')||JSON.stringify(call.body).includes(ownKey)),false);
 assert.ok(calls.every(call=>call.mediaType===(call.key?'application/vnd.compor.byok+json':'application/json')),'BYOK sinaliza o transporte versionado e a fonte padrão mantém JSON comum');
 const storage=await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]));assert.equal(storage.includes(ownKey),false);assert.deepEqual(errors,[]);
});

test('recibo de imagem anterior coexiste com uma nova tentativa pausada e consulta retoma o mesmo pedido', {
 skip: !existsSync(browserPath), timeout: 90000,
}, async t => {
 const version = 11;
 const priorRequestId = id(11);
 const actionId = id(12);
 const imageReceipt = {userId, projectId, pieceId, version, requestId: priorRequestId, assetId: id(13)};
 const instruction = 'Gere as cinco lâminas do carrossel de teste.';
 const {page, url} = await openCredentialFixture(t, `'use client';
import {useRef, useState} from 'react';
import {createStudioState, selectVersion} from '../../lib/studio-state';
import StudioChat from '../../studio/studio-chat';
import {useAICredentials} from '../../studio/use-ai-credentials';

export default function Fixture() {
 const userId = '${userId}', projectId = '${projectId}', pieceId = '${pieceId}', version = ${version};
 const credentials = useAICredentials(userId, true);
 const [state, setState] = useState(() => selectVersion(createStudioState({userId, projectId}), {
  pieceId, version, latestVersion: version,
  content: {headline: 'Carrossel de teste', price: '', date: '', caption: '', captionOrigin: 'user'},
 }));
 const current = useRef(state);
 const [executed, setExecuted] = useState([]);
 const result = {status: 'completed', projectId, pieceId, baseVersion: version};
 const tools = useRef({execute: async (name, args) => {
  setExecuted(previous => [...previous, {name, args}]);
  return result;
 }});
 function change(update) {
  const next = update(current.current);
  current.current = next;
  setState(next);
  return next;
 }
 return <main>
  <button onClick={credentials.pauseAI}>Pausar IA</button>
  <button onClick={credentials.useAI}>Ativar IA</button>
  <output data-testid="active">{String(credentials.hasApiKey)}</output>
  <output data-testid="executed">{JSON.stringify(executed)}</output>
  <StudioChat state={state} conversationId={pieceId} getState={() => current.current}
   change={change} flush={async () => {}} tools={tools} hasApiKey={credentials.hasApiKey}
   canUseAI={credentials.canUseAI} credentialSource={credentials.source} credentialEpoch={credentials.epoch}
   getApiKey={credentials.getApiKey} onUseAI={credentials.useAI}
   onUseImage={async () => { throw Error('new image applied unexpectedly'); }} loadReference={async () => null} />
 </main>;
}`);
 // Seed the receipt at its reload boundary. The subsequent message is submitted through the chat UI.
 await page.addInitScript(({marker, imageReceipt}) => {
  sessionStorage.setItem(marker, JSON.stringify({
   requestId: null, previousAttemptKey: null, credentialSource: 'default', imageReceipt,
  }));
 }, {marker, imageReceipt});
 const calls = [];
 const action = {name: 'compor_contexto', args: {projectId, requestId: actionId}};
 const actionBinding = 'synthetic-action-binding';
 const finalReply = 'A ação do pedido foi concluída.';
 await page.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/ai/credential-status' && request.method() === 'GET') {
   return route.fulfill({json: {defaultAvailable: true}});
  }
  const body = request.postDataJSON();
  calls.push({path, body});
  if (path === '/api/studio/chat') {
   return route.fulfill({status: 202, json: body.op === 'poll'
    ? {status: 'action_required', requestId: body.requestId, action, actionBinding}
    : {status: 'unknown', requestId: body.requestId}});
  }
  if (path === '/api/studio/action') {
   return route.fulfill({json: {status: 'completed', requestId: body.requestId, text: finalReply}});
  }
  return route.fulfill({status: 501, json: {error: 'unexpected_request'}});
 });

 await page.goto(url);
 const receipt = page.getByText('Imagem gerada e adicionada a este post · versão 11.', {exact: true});
 const ask = page.getByRole('button', {name: 'Consultar esta tentativa', exact: true});
 const submit = page.getByRole('button', {name: 'Enviar →', exact: true});
 await receipt.waitFor();
 assert.equal(await page.getByTestId('active').innerText(), 'false');
 await page.getByLabel('Sua mensagem').fill(instruction);
 await submit.click();
 await page.getByText('O resultado ainda não foi confirmado. Consulte a mesma tentativa antes de enviar outro pedido.', {exact: true}).waitFor();
 const sent = calls[0];
 assert.equal(sent.body.message, instruction);
 assert.notEqual(sent.body.requestId, priorRequestId);
 assert.equal(await page.getByTestId('active').innerText(), 'true');

 await page.getByRole('button', {name: 'Pausar IA', exact: true}).click();
 assert.equal(await page.getByTestId('active').innerText(), 'false');
 await ask.click();
 await page.getByText('Comece a criar com IA para continuar esta solicitação. Nenhuma nova ação foi executada.', {exact: true}).waitFor();
 assert.equal(await receipt.isVisible(), true);
 assert.equal(await ask.isEnabled(), true);
 assert.equal(await page.getByText(instruction, {exact: true}).isVisible(), true);
 assert.deepEqual(JSON.parse(await page.getByTestId('executed').innerText()), []);
 const pending = JSON.parse(await page.evaluate(key => sessionStorage.getItem(key), marker));
 assert.equal(pending.requestId, sent.body.requestId);
 assert.deepEqual(pending.imageReceipt, imageReceipt);
 const lookup = {path: '/api/studio/chat', body: {op: 'poll', projectId, requestId: sent.body.requestId, conversationId: pieceId}};
 assert.deepEqual(calls, [sent, lookup], 'a consulta pausada só lê o pedido atual');

 await page.getByRole('button', {name: 'Ativar IA', exact: true}).click();
 assert.equal(await page.getByTestId('active').innerText(), 'true');
 assert.deepEqual(calls, [sent, lookup], 'o gesto de ativação aguarda a consulta da pessoa');
 await ask.click();
 await page.getByText(finalReply, {exact: true}).waitFor();
 await ask.waitFor({state: 'detached'});
 assert.deepEqual(JSON.parse(await page.getByTestId('executed').innerText()), [action]);
 assert.deepEqual(calls.slice(0, 3), [sent, lookup, lookup]);
 assert.equal(calls.length, 4);
 assert.equal(calls[3].path, '/api/studio/action');
 assert.equal(calls[3].body.requestId, sent.body.requestId);
 assert.equal(calls[3].body.actionBinding, actionBinding);
 assert.equal(calls[3].body.result.status, 'completed');
 assert.equal(await receipt.isVisible(), true);
});

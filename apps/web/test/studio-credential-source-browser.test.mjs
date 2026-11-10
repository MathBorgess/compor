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
const userId=id(1),projectId=id(2),pieceId=id(3),marker=`compor-studio-chat:${userId}:${projectId}`;
const ownKey=`sk-synthetic-${'x'.repeat(30)}`;

test('chat usa a fonte escolhida, preserva pendência e descarta resposta da fonte anterior',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../app/studio-credential-source-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useRef,useState} from 'react';import StudioChat from '../studio-chat';
import {createStudioState,createPost} from '../../lib/studio-state.ts';
export default function Fixture(){const[source,setSource]=useState('default'),[epoch,setEpoch]=useState(0),[active,setActive]=useState(false),[messageDraft,setMessageDraft]=useState(undefined),[chatVisible,setChatVisible]=useState(true),[state,setState]=useState(()=>createPost(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{pieceId:'${pieceId}'}));const current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}function choose(value){setSource(value);setEpoch(n=>n+1);setActive(false);}return <main><button onClick={()=>choose('default')}>Usar fonte padrão</button><button onClick={()=>choose('byok')}>Usar fonte própria</button><output data-testid="credential">{JSON.stringify({source,epoch,active})}</output><output data-testid="snapshot">{JSON.stringify(state)}</output><button onClick={()=>setChatVisible(value=>!value)}>{chatVisible?'Abrir conexão':'Voltar à conversa'}</button>{chatVisible&&<StudioChat initialMessage="Ideia inicial" messageDraft={messageDraft} onMessageDraftChange={setMessageDraft} state={state} getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={active} canUseAI={true} credentialSource={source} credentialEpoch={epoch} getApiKey={()=>source==='byok'?'${ownKey}':''} onUseAI={()=>setActive(true)} onUseImage={async()=>{throw Error('unexpected image');}} loadReference={async()=>null}/>}</main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(6000);
 await isolateFixtureHmr(page,`/${basename(fixture)}`);
 const calls=[],errors=[];let outcome='completed',held;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const body=route.request().postDataJSON();calls.push({path:new URL(route.request().url()).pathname,body});
  if(outcome==='held'){held=route;return;}
  if(outcome==='not_submitted')return route.fulfill({status:503,json:{status:'failed',error:'default_credential_unavailable',failurePhase:'before_submission',requestId:body.requestId,retryAutomatically:false}});
  if(outcome==='unavailable')return route.fulfill({status:503,json:{error:'default_credential_unavailable'}});
  if(outcome==='action')return route.fulfill({status:202,json:{status:'action_required',action:{name:'compor_novo_post',args:{}},actionBinding:'signed-synthetic'}});
  return route.fulfill({status:202,json:outcome==='completed'?{status:'completed',text:'Resposta preservada'}:{status:'unknown',...(outcome==='rejected'?{errorCode:'provider_http_401'}:{})}});
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByLabel('Sua mensagem').waitFor();
 assert.equal(calls.length,0);assert.equal(JSON.parse(await page.getByTestId('credential').innerText()).active,false,'disponibilidade não ativa a IA');
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Ideia inicial');
 await page.getByLabel('Sua mensagem').fill('Meu rascunho antes da conexão');await page.getByRole('button',{name:'Abrir conexão',exact:true}).click();await page.getByRole('button',{name:'Voltar à conversa',exact:true}).click();
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Meu rascunho antes da conexão','o rascunho atravessa a tela que desmonta o chat');
 await page.getByLabel('Sua mensagem').fill('');await page.getByRole('button',{name:'Abrir conexão',exact:true}).click();await page.getByRole('button',{name:'Voltar à conversa',exact:true}).click();
 assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'','um rascunho vazio explícito não recupera a ideia inicial');assert.equal(calls.length,0);
 async function send(text){await page.getByLabel('Sua mensagem').fill(text);await page.getByRole('button',{name:'Enviar →',exact:true}).click();}
 await send('Minha primeira ideia');await page.getByText('Resposta preservada',{exact:true}).waitFor();
 assert.equal(calls.length,1);assert.equal(Object.hasOwn(calls[0].body,'apiKey'),false,'a chave padrão nunca atravessa o navegador');
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
 assert.equal(calls.length,3);assert.equal(calls[2].body.apiKey,ownKey);assert.equal(Object.hasOwn(calls[2].body,'previousAttemptKey'),false,'trocar fonte inicia sessão nova sem perder a conversa');
 assert.notEqual(calls[2].body.requestId,firstRequest);
 outcome='rejected';await send('Verificar minha chave recusada');await page.getByText('A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.',{exact:true}).waitFor();
 const rejectedCount=calls.length;await page.waitForTimeout(2200);assert.equal(calls.length,rejectedCount,'recusa da BYOK não usa fallback nem consulta automática');assert.equal(calls.at(-1).body.apiKey,ownKey);
 const ownPending=calls.at(-1).body.requestId;
 await page.getByRole('button',{name:'Usar fonte padrão',exact:true}).click();
 await page.getByText('Esta tentativa começou com sua chave OpenAI. Reconecte a chave original para consultá-la; ela não será reenviada.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).isDisabled(),true);assert.equal(calls.length,rejectedCount);
 stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.equal(stored.requestId,ownPending);assert.equal(stored.credentialSource,'byok');
 await page.getByRole('button',{name:'Usar fonte própria',exact:true}).click();outcome='action';const beforeInactivePoll=calls.length;await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Comece a criar com IA para continuar esta solicitação. Nenhuma nova ação foi executada.',{exact:true}).waitFor();assert.equal(calls.length,beforeInactivePoll+1,'consulta com fonte disponível e IA pausada não executa ferramenta nem ACK');
 outcome='completed';await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor({state:'detached'});
 assert.equal(calls.at(-1).body.requestId,ownPending);assert.equal(calls.at(-1).body.op,'poll');
 await page.getByRole('button',{name:'Usar fonte padrão',exact:true}).click();outcome='unknown';await send('Uma tentativa padrão ficou incerta');
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor();const uncertain=calls.at(-1).body.requestId;
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
 const storage=await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]));assert.equal(storage.includes(ownKey),false);assert.deepEqual(errors,[]);
});

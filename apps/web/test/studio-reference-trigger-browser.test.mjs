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
const user=id(1),project=id(2),piece=id(3),first=id(4),second=id(5);
const source=`
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioChat from './app/studio-chat.tsx';
import {createStudioState,createPost,addReference,removeReference,updateBrief} from './lib/studio-state.ts';
import {recordReferenceRound} from './lib/studio-reference-round.ts';
const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;canvas.getContext('2d').fillRect(0,0,4,4);
const file=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
const reference=id=>({id,name:'Referência',mime:'image/png',size:file.size,width:4,height:4,...(id==='${first}'?{source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography'}}:{})});
function initial(){let state=createPost(createStudioState({userId:'${user}',projectId:'${project}'}),{pieceId:'${piece}'});return addReference(state,reference('${first}'));}
function Fixture(){const [key,setKey]=useState(false),[state,setState]=useState(initial),current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});
function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}
function choose(fn){change(fn);recordReferenceRound(current.current);}
return <main><button onClick={()=>setKey(true)}>Conectar</button><button onClick={()=>choose(s=>addReference(s,reference('${second}')))}>Selecionar outra</button><button onClick={()=>{change(s=>addReference(s,reference('${second}')));setTimeout(()=>recordReferenceRound(current.current),6500);}}>Persistência lenta</button><button onClick={()=>choose(s=>addReference(s,reference('${first}')))}>Selecionar primeira</button><button onClick={()=>choose(s=>removeReference(removeReference(s,'${first}'),'${second}'))}>Limpar seleção</button><button onClick={()=>change(s=>updateBrief(s,{offer:'Uma oferta diferente'}))}>Alterar oferta</button><output id="snapshot">{JSON.stringify(state)}</output>
<StudioChat state={state} conversationId="references" getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={key} getApiKey={()=>key?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':''} loadReference={async()=>({file})} onUseImage={async()=>true}/></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
async function setup(t,{feedbackDelayMs=0}={}){
 const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},alias:{'@compor/agile-deliberation/readiness':fileURLToPath(new URL('../../../packages/agile-deliberation/src/readiness.js',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);}else if(req.url?.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');}else{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/fixture.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(7000);const calls=[],pinSignals=[],dispatches=new EventEmitter();let answer='completed',release,delayedFeedback=false;
 await context.route('**/api/studio/**/signals',async route=>{if(feedbackDelayMs&&!delayedFeedback){delayedFeedback=true;await new Promise(resolve=>setTimeout(resolve,feedbackDelayMs));}return route.fulfill({json:{signals:route.request().url().includes('/references/')?pinSignals:[]}});});
 await page.context().route('**/api/studio/chat',async route=>{const body=route.request().postDataJSON();calls.push(body);dispatches.emit('dispatch');if(answer==='unknown')return route.abort('failed');if(answer==='hold')await new Promise(resolve=>{release=resolve;});return route.fulfill({json:{status:'completed',text:'As referências parecem editoriais.\n\n**Recomendação:** Uma direção sóbria, porque combina com a oferta.\n\nPosso seguir pela direção sóbria?'}});});
 function waitForCalls(count,timeoutMs=7000){
  if(calls.length>=count)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timer);dispatches.off('dispatch',complete);t.signal.removeEventListener('abort',aborted);if(error)reject(error);else resolve();};
   const complete=()=>{if(calls.length>=count)finish();},aborted=()=>finish(t.signal.reason);
   const timer=setTimeout(()=>finish(Error(`Nenhum dispatch ${count} em ${timeoutMs} ms; observados ${calls.length}.`)),timeoutMs);
   dispatches.on('dispatch',complete);t.signal.addEventListener('abort',aborted,{once:true});if(t.signal.aborted)aborted();else complete();
  });
 }
 const waitForAnswer=count=>page.getByText('Posso seguir pela direção sóbria?',{exact:true}).nth(count-1).waitFor();
 return {page,calls,origin,pinSignals,waitForCalls,waitForAnswer,unknown:()=>{answer='unknown';},hold:()=>{answer='hold';},release:()=>{answer='completed';release?.();}};
}
test('seleção existente espera digitação, inicia uma vez e não repete em reload',{skip:!existsSync(browserPath),timeout:45000},async t=>{
 const {page,calls,origin,waitForCalls,waitForAnswer}=await setup(t);await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await page.getByLabel('Sua mensagem').fill('Estou escrevendo');
 await page.waitForTimeout(5500);assert.equal(calls.length,0);
 await page.getByLabel('Sua mensagem').fill('');await waitForCalls(1);await waitForAnswer(1);
 assert.equal(calls.length,1);assert.equal(calls[0].op,'reference_selection');assert.equal('message' in calls[0],false);assert.equal(calls[0].referenceImages.length,1);
 const snapshot=JSON.parse(await page.locator('#snapshot').textContent());assert.equal(snapshot.messages.filter(x=>x.role==='user').length,0);assert.equal(snapshot.messages.filter(x=>x.role==='assistant').length,1);
 await page.reload();await page.getByRole('button',{name:'Conectar'}).click();await page.waitForTimeout(5500);assert.equal(calls.length,1);
});
test('remover todas as referências cancela a espera e resultado incerto não é reenviado',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,calls,origin,unknown,waitForCalls}=await setup(t,{feedbackDelayMs:900});await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await page.getByRole('button',{name:'Limpar seleção'}).click();await page.waitForTimeout(5500);assert.equal(calls.length,0);
 await page.reload();unknown();await page.getByRole('button',{name:'Conectar'}).click();await page.getByRole('button',{name:'Selecionar outra'}).click();await waitForCalls(1);assert.equal(calls.length,1);assert.equal(calls[0].referenceImages.length,2);
 await page.getByRole('button',{name:'Limpar seleção'}).click();await page.getByRole('button',{name:'Selecionar primeira'}).click();await page.waitForTimeout(5500);assert.equal(calls.length,1,'seleção nova não contorna resultado incerto');
 await page.reload();await page.getByRole('button',{name:'Conectar'}).click();await page.waitForTimeout(5500);assert.equal(calls.length,1);
});

test('abas concorrentes enviam uma única iniciativa para o mesmo conjunto',{skip:!existsSync(browserPath),timeout:30000},async t=>{
 const {page,calls,origin,waitForCalls}=await setup(t);const other=await page.context().newPage();await Promise.all([page.goto(origin),other.goto(origin)]);
 await Promise.all([page.getByRole('button',{name:'Conectar'}).click(),other.getByRole('button',{name:'Conectar'}).click()]);
 await waitForCalls(1);
 await page.waitForTimeout(2000);assert.equal(calls.length,1);
});
test('resposta de seleção alterada durante o turno não aparece como atual',{skip:!existsSync(browserPath),timeout:25000},async t=>{
 const {page,calls,origin,hold,release,waitForCalls}=await setup(t);hold();await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();
 await waitForCalls(1);assert.equal(calls.length,1);await page.getByRole('button',{name:'Selecionar outra'}).click();release();
 await page.waitForTimeout(500);const snapshot=JSON.parse(await page.locator('#snapshot').textContent());assert.equal(snapshot.messages.filter(x=>x.role==='assistant').length,0);
 await waitForCalls(2);assert.equal(calls.length,2);assert.equal(calls[1].referenceImages.length,2);
});

test('comentário já registrado acompanha nova análise e não provoca repetição após reload',{skip:!existsSync(browserPath),timeout:20000},async t=>{
 const {page,calls,origin,pinSignals,waitForCalls,waitForAnswer}=await setup(t);pinSignals.push({id:id(7),projectId:project,originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography',action:'comment',comment:'Prefiro essa tipografia editorial',supersedes:null,createdAt:'2026-11-06T12:00:00.000Z'});
 await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await waitForCalls(1);await waitForAnswer(1);assert.equal(calls.length,1);assert.equal(calls[0].context.referenceFeedback[0].text,'Prefiro essa tipografia editorial');await page.reload();await page.getByRole('button',{name:'Conectar'}).click();await page.waitForTimeout(5500);assert.equal(calls.length,1);
});

test('nova oferta ou limpar e remarcar a mesma imagem iniciam nova rodada',{skip:!existsSync(browserPath),timeout:35000},async t=>{
 const {page,calls,origin,waitForCalls,waitForAnswer}=await setup(t);await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await waitForCalls(1);await waitForAnswer(1);assert.equal(calls.length,1);
 await page.getByRole('button',{name:'Alterar oferta'}).click();await waitForCalls(2);await waitForAnswer(2);assert.equal(calls.length,2);assert.equal(calls[1].context.brief.offer,'Uma oferta diferente');
 await page.getByRole('button',{name:'Limpar seleção'}).click();await page.getByRole('button',{name:'Selecionar primeira'}).click();await waitForCalls(3);assert.equal(calls.length,3);assert.equal(calls[2].context.references[0].id,first);
});
test('pedido explícito é enviado sem recomendação interna contraditória',{skip:!existsSync(browserPath),timeout:15000},async t=>{
 const {page,calls,origin}=await setup(t);await page.goto(origin);await page.getByLabel('Sua mensagem').fill('Gere uma peça agora');await page.getByRole('button',{name:'Conectar'}).click();
 const response=page.waitForResponse(result=>new URL(result.url()).pathname==='/api/studio/chat'&&result.request().method()==='POST');
 await page.getByRole('button',{name:'Enviar →',exact:true}).click();await response;
 assert.equal(calls.length,1);assert.equal(calls[0].message,'Gere uma peça agora');assert.equal('next' in calls[0].context.readiness,false);
});

test('seleção com persistência lenta rearma iniciativa após o salvamento',{skip:!existsSync(browserPath),timeout:35000},async t=>{
 const {page,calls,origin,waitForCalls}=await setup(t);await page.goto(origin);await page.getByRole('button',{name:'Conectar'}).click();await page.getByRole('button',{name:'Persistência lenta'}).click();
 await waitForCalls(1,12000);assert.equal(calls.length,1);assert.equal(calls[0].context.references.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),requestId=id(3),pieceId=id(4),assetId=id(5),otherPiece=id(6),marker=`compor-studio-chat:${userId}:${projectId}`;
const apiKey=`sk-synthetic-${'x'.repeat(30)}`,staleText='A proposta está pronta e aguarda sua confirmação.';
const receipt='Imagem gerada e adicionada a este post · versão 2.';
const failure='A imagem foi gerada, mas não foi possível confirmar sua aplicação à versão de origem. Consulte as imagens dessa versão para recuperá-la; não haverá nova geração automática.';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');

test('receipt confirma aplicação aguardada sem alterar o agente; escopo e falha não regeneram imagem',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../app/studio-image-receipt-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useEffect,useRef,useState} from 'react';import StudioChat from '../studio-chat';
import {createStudioState,selectVersion,selectDraft,prepareAdjustment,parseStudioState} from '../../lib/studio-state.mjs';
const content={headline:'Post de origem',price:'',date:'',caption:'',captionOrigin:'user'};
function initial(userId='${userId}',projectId='${projectId}',restore=false){if(restore&&typeof window!=='undefined'){try{const old=JSON.parse(sessionStorage.getItem('receipt-test-state'));if(old?.userId===userId&&old?.projectId===projectId)return parseStudioState(old);}catch{}}let s=selectVersion(createStudioState({userId,projectId}),{pieceId:'${otherPiece}',version:2,latestVersion:2,content:{...content,headline:'Outro post'}});s=selectVersion(s,{pieceId:'${pieceId}',version:2,latestVersion:2,content});return prepareAdjustment(s,{requestId:'${requestId}',messageId:'${id(7)}',instruction:'Gere uma imagem',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(8)}'});}
export default function Fixture(){const[state,setState]=useState(initial),current=useRef(state),counts=useRef({image:0}),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});useEffect(()=>{const next=initial('${userId}','${projectId}',true);current.current=next;setState(next);},[]);function change(fn){const next=fn(current.current);current.current=next;setState(next);sessionStorage.setItem('receipt-test-state',JSON.stringify(next));return next;}function scope(user,project){const next=initial(user,project,true);current.current=next;setState(next);}return <main><button onClick={()=>change(s=>selectDraft(s,{pieceId:'${otherPiece}',baseVersion:2}))}>Outro post</button><button onClick={()=>change(s=>selectDraft(s,{pieceId:'${pieceId}',baseVersion:2}))}>Post de origem</button><button onClick={()=>scope('${id(10)}','${projectId}')}>Outra conta</button><button onClick={()=>scope('${userId}','${id(11)}')}>Outro projeto</button><button onClick={()=>scope('${userId}','${projectId}')}>Escopo original</button><StudioChat state={state} getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={true} getApiKey={()=>'${apiKey}'} onUseImage={async()=>{counts.current.image++;if(window.__receiptMode==='throw')throw Error('synthetic private error');if(window.__receiptMode==='false')return false;return new Promise(resolve=>{window.__releaseImage=()=>resolve(true);});}}/><output data-testid="counts">{JSON.stringify(counts.current)}</output></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(`${origin}/${basename(fixture)}`)).ok)break;}catch{}if(Date.now()>until)throw Error(`fixture indisponível: ${startup}`);await new Promise(resolve=>setTimeout(resolve,100));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let polls=0;
 await page.addInitScript(({marker,requestId})=>{if(sessionStorage.getItem(marker)===null)sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageContext:{pieceId:'00000000-0000-4000-8000-000000000004',baseVersion:2}}));},{marker,requestId});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path:url.pathname,body,query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/studio/chat'){assert.equal(body.op,'poll');return route.fulfill({status:202,json:++polls===1?{status:'consent_required',attemptId:id(12),prompt:'Proposta sintética',actionBinding:'synthetic-binding',declineBinding:'synthetic-decline'}:{status:'completed',text:staleText}});}
  if(url.pathname==='/api/agent/image')return route.fulfill({status:202,json:{status:'accepted',assetId}});
  if(url.pathname==='/api/images')return route.fulfill({contentType:'image/png',body:png});
  throw Error('unexpected API');
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.waitForFunction(()=>typeof window.__releaseImage==='function');
 assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'a resposta da API não basta antes da aplicação local');assert.equal(polls,1);
 await page.getByRole('button',{name:'Outro post',exact:true}).click();await page.evaluate(()=>window.__releaseImage());await page.getByText(staleText,{exact:true}).waitFor();assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'o receipt da origem não pertence ao post aberto depois');
 await page.getByRole('button',{name:'Post de origem',exact:true}).click();await page.getByText(receipt,{exact:true}).waitFor();assert.equal(await page.getByText(staleText,{exact:true}).count(),1,'a resposta original não foi reescrita');
 const saved=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.deepEqual(saved.imageReceipt,{userId,projectId,requestId,pieceId,version:2,assetId});assert.equal(saved.requestId,null);assert.equal(calls.filter(c=>c.path==='/api/agent/image').length,1);assert.deepEqual(calls.find(c=>c.path==='/api/images').query,{projectId,pieceId,version:'2',assetId});
 const beforeReload=calls.length;await page.reload();await page.getByText(receipt,{exact:true}).waitFor();assert.equal(calls.length,beforeReload,'reload conserva só metadados e não consulta nem gera');
 await page.getByRole('button',{name:'Outra conta',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0);await page.getByRole('button',{name:'Outro projeto',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0);
 await page.evaluate(({marker,saved,projectId})=>sessionStorage.setItem(marker,JSON.stringify({...saved,imageReceipt:{...saved.imageReceipt,projectId}})),{marker,saved,projectId:id(11)});await page.getByRole('button',{name:'Escopo original',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'metadados copiados de outro escopo são rejeitados');
 for(const mode of['false','throw']){
  await page.evaluate(()=>sessionStorage.clear());polls=0;await page.reload();await page.evaluate(mode=>{window.__receiptMode=mode;},mode);const start=calls.length;
  await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.getByText(failure,{exact:true}).waitFor();
  assert.equal(await page.getByText(receipt,{exact:true}).count(),0);assert.equal(polls,1,'aplicação incerta não avança o fluxo');assert.equal(calls.slice(start).filter(c=>c.path==='/api/agent/image').length,1);assert.equal(await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).count(),0);
  assert.equal(JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker)).imageReceipt,undefined);await page.waitForTimeout(2200);assert.equal(calls.length,start+3,'falha de aplicação não repete geração, fetch ou poll');
 }
 assert.equal(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)])).then(value=>value.includes('sk-synthetic')),false);assert.doesNotMatch(await page.locator('body').innerText(),/synthetic private error|sk-synthetic/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

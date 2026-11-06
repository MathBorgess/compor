import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {stopApp,waitForApp} from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),requestId=id(3),pieceId=id(4),assetId=id(5);
const marker=`compor-studio-chat:${userId}:${projectId}`,submission=`compor-image-submission:${userId}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
const contentSha256=createHash('sha256').update(png).digest('hex');
const confirmed={status:'image_completed',requestId,pieceId,version:2,assetId,contentSha256};
const failed='Não foi possível confirmar o envio. A tentativa continua preservada.';
const localUnavailable='Não foi possível preservar a imagem recuperada sem substituir um arquivo local. Revise a versão e o armazenamento; a tentativa continua preservada.';

test('reconciliação aplica apenas imagem com hash e escopo confirmados e preserva fence nos demais casos',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../app/studio-image-proof-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useRef,useState} from 'react';import StudioChat from '../studio-chat';
import {createStudioState,selectVersion} from '../../lib/studio-state.ts';
const content={headline:'Post de origem',price:'',date:'',caption:'',captionOrigin:'user'};
function initial(user='${userId}',project='${projectId}'){return selectVersion(createStudioState({userId:user,projectId:project}),{pieceId:'${pieceId}',version:2,latestVersion:2,content});}
export default function Fixture(){const[state,setState]=useState(initial),current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}function scope(user,project){const next=initial(user,project);current.current=next;setState(next);}return <main><button onClick={()=>scope('${id(10)}','${projectId}')}>Outra conta</button><button onClick={()=>scope('${userId}','${id(11)}')}>Outro projeto</button><StudioChat state={state} getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={true} getApiKey={()=>'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'} onUseImage={async()=>{throw Error('not safe for recovery');}} onRecoverImage={async({blob,pieceId,version})=>{window.__applied=(window.__applied||0)+1;window.__selection={pieceId,version,size:blob.size};if(window.__applyMode==='false')return false;if(window.__applyMode==='throw')throw Error('unavailable');return true;}}/></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-8000);});
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});browser=await chromium.launch({executablePath:browserPath,headless:true});
 const page=await browser.newPage(),errors=[],calls=[];page.setDefaultTimeout(6000);let result={status:'unverified'},imageBody=png,releaseImage=null,imageGate=null;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),body:req.method()==='POST'?req.postDataJSON():null});
  if(url.pathname==='/api/agent/image/reconcile-closed')return route.fulfill({json:result});
  if(url.pathname==='/api/images'){if(imageGate)await imageGate;try{return await route.fulfill({contentType:'image/png',body:imageBody});}catch{return;}}
  throw Error('unexpected API');
 });
 await page.goto(`${origin}/${basename(fixture)}`);
 async function reset(){await page.evaluate(({marker,submission,requestId})=>{sessionStorage.clear();localStorage.clear();sessionStorage.setItem(marker,JSON.stringify({requestId:null,previousAttemptKey:requestId,imageProtocolVersion:1}));localStorage.setItem(submission,requestId);},{marker,submission,requestId});await page.reload();await page.getByRole('button',{name:'Verificar envio anterior'}).waitFor();}
 async function preserved(){assert.equal(await page.evaluate(key=>localStorage.getItem(key),submission),requestId);}
 for(const value of [{status:'unverified'},{...confirmed,requestId:id(7)},{...confirmed,contentSha256:'0'.repeat(64)},{...confirmed,extra:'invalid'}]){
  result=value;await reset();const before=await page.evaluate(()=>window.__applied||0);await page.getByRole('button',{name:'Verificar envio anterior'}).click();await page.getByText(failed,{exact:true}).waitFor();await preserved();assert.equal(await page.evaluate(()=>window.__applied||0),before);
 }
 result=confirmed;imageBody=Buffer.concat([png,Buffer.from([0])]);await reset();await page.getByRole('button',{name:'Verificar envio anterior'}).click();await page.getByText(failed,{exact:true}).waitFor();await preserved();assert.equal(await page.evaluate(()=>window.__applied||0),0,'bytes divergentes não são aplicados');imageBody=png;
 result=confirmed;await reset();await page.evaluate(()=>{window.__applyMode='false';});await page.getByRole('button',{name:'Verificar envio anterior'}).click();await page.getByText(localUnavailable,{exact:true}).waitFor();await preserved();
 await reset();await page.evaluate(marker=>{const original=Storage.prototype.setItem;window.__failMarker=true;Storage.prototype.setItem=function(key,value){if(window.__failMarker&&this===sessionStorage&&key===marker)throw Error('synthetic quota');return original.call(this,key,value);};},marker);
 await page.getByRole('button',{name:'Verificar envio anterior'}).click();await page.getByText(failed,{exact:true}).waitFor();await preserved();
 await page.evaluate(()=>{window.__failMarker=false;});
 for(const change of ['Outra conta','Outro projeto','marker','pending']){
  await reset();imageGate=new Promise(resolve=>{releaseImage=resolve;});const imageCount=calls.filter(c=>c.path==='/api/images').length;await page.getByRole('button',{name:'Verificar envio anterior'}).click();
  await page.waitForFunction(()=>document.querySelector('button[disabled]')!==null);for(let i=0;i<100&&calls.filter(c=>c.path==='/api/images').length===imageCount;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls.filter(c=>c.path==='/api/images').length,imageCount+1);
  const before=await page.evaluate(()=>window.__applied||0);if(change==='marker')await page.evaluate(({submission,other})=>localStorage.setItem(submission,other),{submission,other:id(9)});else if(change==='pending')await page.evaluate(({marker,other})=>sessionStorage.setItem(marker,JSON.stringify({requestId:other,previousAttemptKey:null,imageProtocolVersion:1})),{marker,other:id(8)});else await page.getByRole('button',{name:change}).click();
  releaseImage();await page.waitForTimeout(300);assert.equal(await page.evaluate(key=>localStorage.getItem(key),submission),change==='marker'?id(9):requestId);assert.equal(await page.evaluate(()=>window.__applied||0),before,'mudança de conta, projeto ou marker não aplica bytes');if(change==='pending')assert.equal(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),marker)).requestId,id(8));imageGate=null;
 }
 await reset();await page.getByRole('button',{name:'Verificar envio anterior'}).click();await page.getByText('A imagem confirmada foi recuperada para a versão original.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),submission),null);assert.deepEqual(await page.evaluate(()=>window.__selection),{pieceId,version:2,size:png.length});
 const stored=JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),marker));assert.deepEqual(stored.imageReceipt,{userId,projectId,requestId,pieceId,version:2,assetId});assert.equal(stored.requestId,null);
 const downloads=calls.filter(c=>c.path==='/api/images');assert.deepEqual(downloads.at(-1).query,{projectId,pieceId,version:'2',assetId});assert.equal(calls.filter(c=>c.path==='/api/agent/image').length,0);assert.deepEqual(errors,[]);
});

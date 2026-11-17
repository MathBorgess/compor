import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {openSettings} from './guided-navigation.mjs';
import {validateExplorationPlan} from '../../../packages/agents-api/src/exploration-plan-contract.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,userId=id(1),projectId=id(2);
test('o estúdio pede lote paralelo apenas pelo gesto, inclusive com IA padrão',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../app/parallel-studio-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';import StudioApp from '../studio-app';export default function Fixture(){return <StudioApp userId="${userId}" hasApiKey={true} canUseAI={true} credentialSource="default" credentialEpoch={0} defaultAvailable={true} parallelAvailable={true} getApiKey={()=>''} keyInput={<span>Conectada</span>} onRemoveKey={()=>{}} initialObjective="Oficina de cerâmica" isAuthenticated={()=>true}/>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 const calls=[],batches=new Map(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;calls.push({path,body,method:request.method()});
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto paralelo',revision:1,created_at:'2026-11-17T12:00:00Z'}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/intent/epoch'))return route.fulfill({json:{epoch:0}});
  if(path.endsWith('/intent'))return route.fulfill({json:{status:'created',epoch:1}});
  if(path.endsWith('/plan')){const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},body.context);return route.fulfill({json:{status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'}});}
  if(path.endsWith('/execute')){batches.set(body.batchId,body);return;}
  if(path==='/api/studio/exploration-batches/status'){const batch=batches.get(body.batchId);if(!batch)return route.fulfill({json:{status:'absent',projectId,batchId:body.batchId}});return route.fulfill({json:{projectId,batchId:body.batchId,pieceId:null,state:'running',completedAt:null,nextAt:null,closedAt:null,images:batch.imageIds.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:'running',revision:1,replacesImageId:null}))}});}
  if(path.endsWith('/intent/revoke'))return route.fulfill({json:{status:'revoked',epoch:2,revocationEpoch:2}});
  return route.fulfill({status:503,json:{error:'unavailable'}});
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:/Projeto paralelo/}).click();
 const contextPanel=await openSettings(page,'Contexto');await contextPanel.locator('summary').filter({hasText:'Oferta'}).first().click();await contextPanel.getByLabel('Oferta',{exact:true}).fill('Oficina de cerâmica');
 await openSettings(page,'Referências');
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 assert.equal(calls.filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'abrir referências não inicia efeitos');
 const button=page.getByRole('button',{name:'Pedir 3 propostas',exact:true});await button.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Pedir 3 propostas'&&!button.disabled));await button.click();
 try{await page.waitForFunction(()=>document.body.textContent.includes('Aguardando confirmação das propostas'));}catch(error){throw Error(`Estado: ${JSON.stringify({statuses:await page.getByRole('status').allTextContents(),calls:calls.map(({path,body})=>({path,op:body?.op})),errors})}`,{cause:error});}
 assert.equal(calls.filter(call=>call.path.endsWith('/plan')).length,1);assert.equal(calls.filter(call=>call.path.endsWith('/execute')).length,1);
 assert.equal(Object.hasOwn(calls.find(call=>call.path.endsWith('/plan')).body,'apiKey'),false,'IA padrão é resolvida no servidor');
 assert.deepEqual(errors,[]);
});

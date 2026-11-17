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
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('conflito do snapshot expõe revisão remota e não inicia intenção ou geração',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const user=id(1),project=id(2),remoteRef=id(9),fixture=await mkdtemp(new URL('../app/authority-conflict-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';import StudioApp from '../studio-app';export default function Fixture(){return <StudioApp userId="${user}" hasApiKey canUseAI credentialSource="default" defaultAvailable parallelAvailable selectedVisualsRequired selectedVisualsAvailable referenceAuthorityEnabled getApiKey={()=>''} keyInput={<span>Conectada</span>} onRemoveKey={()=>{}} initialObjective="Oficina de cerâmica" isAuthenticated={()=>true}/>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,APP_ORIGIN:origin}});await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const calls=[];let changed=false;
 const empty={version:1,references:[],projectReferenceIds:[],posts:[]};
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;calls.push({path,body});
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Projeto teste',revision:1,created_at:'2026-11-17T12:00:00Z'}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/intent/epoch'))return route.fulfill({json:{epoch:0}});
  if(path.endsWith('/intent/revoke'))return route.fulfill({json:{status:'revoked',epoch:1,revocationEpoch:1}});
  if(path.endsWith('/reference-authority/selection')&&body?.op==='read')return route.fulfill({json:{status:'ready',revision:changed?1:0,state:changed?{...empty,references:[{id:remoteRef,inputOrigin:'local-upload',sourceDigest:'a'.repeat(64)}],projectReferenceIds:[remoteRef]}:empty}});
  if(path.endsWith('/reference-authority/snapshot')){changed=true;return route.fulfill({status:409,json:{error:'conflict'}});}
  return route.fulfill({status:503,json:{error:'unavailable'}});
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:/Projeto teste/}).click();
 const context=await openSettings(page,'Contexto');await context.locator('summary').filter({hasText:'Oferta'}).first().click();await context.getByLabel('Oferta',{exact:true}).fill('Oficina de cerâmica');
 await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByText('Revisar seleção e alcance',{exact:true}).click();await page.getByText('Seleção de referências confirmada.').waitFor();
 const button=page.getByRole('button',{name:'Pedir 3 propostas',exact:true});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Pedir 3 propostas'&&!button.disabled));await button.click();
 await page.getByText(/seleção deste navegador diverge/i).waitFor();await page.getByRole('button',{name:'Revisar seleção deste navegador'}).click();const review=page.getByRole('region',{name:'Revisão da seleção local'});await review.waitFor();assert.match(await review.innerText(),new RegExp(remoteRef));assert.match(await review.innerText(),/Seleção remota/);assert.equal(calls.filter(call=>call.path.endsWith('/intent')||call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0);assert.equal(calls.filter(call=>call.path.endsWith('/reference-authority/selection')&&call.body?.op==='write').length,0,'revisar não publica automaticamente');
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:/Projeto teste/}).click();await openSettings(page,'Referências');await page.getByText('Revisar seleção e alcance',{exact:true}).click();await page.getByText(/seleção deste navegador diverge/i).waitFor();assert.equal(calls.filter(call=>call.path.endsWith('/reference-authority/selection')&&call.body?.op==='write').length,0,'reabertura observa o espelho sem publicar');
});

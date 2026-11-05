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
const project='11111111-1111-4111-8111-111111111111',piece='22222222-2222-4222-8222-222222222222',recovered='33333333-3333-4333-8333-333333333333';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64');
const markerKey=user=>`compor-studio-image-upload:${user}:${project}:${piece}:1`;

test('PNG final exige autorização, preserva envio incerto e recupera a versão apenas com uso explícito',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 // The fixture is a temporary route, never part of a production build.
 const fixture=await mkdtemp(new URL('../app/studio-assets-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useState} from 'react';import StudioAssets from '../studio-assets';
export default function Fixture(){const[preview,setPreview]=useState(null),[version,setVersion]=useState(1),[userId,setUser]=useState('alice'),[used,setUsed]=useState('');return <main><label>PNG de teste<input type="file" onChange={e=>setPreview(e.target.files?.[0]??null)}/></label><button onClick={()=>setVersion(v=>v===1?2:1)}>Trocar versão</button><button onClick={()=>setUser(u=>u==='alice'?'bob':'alice')}>Trocar conta</button><output data-testid="used">{used}</output><StudioAssets userId={userId} projectId="${project}" pieceId="${piece}" version={version} canSave={true} preview={preview} onUseImage={({blob,pieceId,version})=>setUsed(JSON.stringify({size:blob.size,pieceId,version}))}/></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,APP_ORIGIN:origin}});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;while(true){try{if((await fetch(`${origin}/${basename(fixture)}`)).ok)break;}catch{}if(Date.now()>deadline)throw Error('fixture indisponível');await new Promise(resolve=>setTimeout(resolve,200));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(6000);
 const writes=[],reads=[],external=[],agentCalls=[];let uncertain=false;
 page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());if(request.url().includes('/api/agent'))agentCalls.push(request.url());});
 await page.route('**/api/image-assets?**',route=>route.fulfill({json:{assets:[{assetId:recovered,origin:'unknown'}],nextCursor:null}}));
 await page.route('**/api/images?**',async route=>{
  const request=route.request(),query=new URL(request.url()).searchParams;
  if(request.method()==='GET'){reads.push(Object.fromEntries(query));return route.fulfill({status:200,contentType:'image/png',body:png});}
  const marker=await page.evaluate(key=>sessionStorage.getItem(key),markerKey('alice'));
  writes.push({query:Object.fromEntries(query),body:request.postDataBuffer(),marker});
  return uncertain?route.abort():route.fulfill({status:201,json:{status:'stored',assetId:query.get('assetId')}});
 });
 await page.goto(`${origin}/${basename(fixture)}`);
 const save=page.getByRole('button',{name:'Salvar PNG final no projeto'}),permission=page.getByLabel('Tenho autorização para guardar esta imagem no projeto');
 await page.getByLabel('PNG de teste').setInputFiles({name:'final.png',mimeType:'image/png',buffer:png});assert.equal(await save.isDisabled(),true);await permission.check();await save.click();await page.getByText('PNG final salvo na versão 1.').waitFor();
 assert.equal(writes.length,1);assert.deepEqual(writes[0].body,png);assert.equal(writes[0].query.version,'1');assert.equal(writes[0].query.pieceId,piece);assert.equal(writes[0].query.projectId,project);assert.equal(JSON.parse(writes[0].marker).assetId,writes[0].query.assetId);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),markerKey('alice')),null);
 await page.getByLabel('PNG de teste').setInputFiles({name:'grande.png',mimeType:'image/png',buffer:Buffer.alloc(4*1024*1024+1)});await permission.check();await save.click();await page.getByText(/no máximo 4 MiB/).waitFor();assert.equal(writes.length,1);
 uncertain=true;await page.getByLabel('PNG de teste').setInputFiles({name:'final.png',mimeType:'image/png',buffer:png});await permission.check();await save.click();await page.getByText(/O resultado do envio é desconhecido/).waitFor();assert.equal(writes.length,2);assert.equal(await save.isDisabled(),true);const uncertainId=writes[1].query.assetId;
 await page.reload();await page.getByText(/O resultado do envio é desconhecido/).waitFor();assert.equal(writes.length,2);assert.match(await page.locator('body').innerText(),new RegExp(uncertainId));
 await page.getByRole('button',{name:'Consultar a mesma referência'}).click();const image=page.getByRole('img',{name:'Imagem recuperada para revisão'});await image.waitFor();await page.waitForFunction(()=>document.querySelector('img[alt="Imagem recuperada para revisão"]')?.naturalWidth===1);
 assert.equal(reads.at(-1).assetId,uncertainId);assert.equal(reads.at(-1).version,'1');assert.equal(await page.getByTestId('used').innerText(),'');await page.getByRole('button',{name:'Usar imagem na composição'}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="used"]').textContent.length>0);assert.deepEqual(JSON.parse(await page.getByTestId('used').innerText()),{size:png.length,pieceId:piece,version:1});
 await page.getByRole('button',{name:'Trocar versão'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).waitFor();assert.equal(await image.count(),0);assert.equal(await page.getByText(/O resultado do envio é desconhecido/).count(),0);
 await page.getByRole('button',{name:'Ver imagem recuperada 1'}).click();await image.waitFor();assert.equal(reads.at(-1).version,'2');await page.getByRole('button',{name:'Trocar versão'}).click();await page.getByText(/O resultado do envio é desconhecido/).waitFor();assert.equal(await image.count(),0);
 await page.getByRole('button',{name:'Trocar conta'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).waitFor();assert.equal(await page.getByText(/O resultado do envio é desconhecido/).count(),0);assert.equal(await image.count(),0);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('compor-studio-image-upload:'))throw Error('storage unavailable');return original.call(this,key,value);};});
 await page.getByLabel('PNG de teste').setInputFiles({name:'final.png',mimeType:'image/png',buffer:png});await permission.check();await save.click();await page.getByText(/Não foi possível preservar a referência/).waitFor();assert.equal(writes.length,2);
 assert.deepEqual(agentCalls,[]);assert.deepEqual(external,[]);
});

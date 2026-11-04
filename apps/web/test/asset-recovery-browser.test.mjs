import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const project='11111111-1111-4111-8111-111111111111',piece='22222222-2222-4222-8222-222222222222';
const id=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
test('recupera páginas de uma versão em nova sessão sem misturar contas', {skip:!existsSync(browserPath)},async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;while(true){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>deadline)throw Error('app indisponível');await new Promise(r=>setTimeout(r,200));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(4000);let user='alice',calls=[],failSecond=true,blockAlice=false,enteredAlice=false,releaseAlice;let aliceGate;
 await page.route('**/auth/session',r=>r.fulfill({json:{state:'connected',userId:user}}));
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:project,title:'Projeto'}]}}));
 await page.route('**/api/pieces*',r=>r.fulfill({json:{versions:[{project_id:project,piece_id:piece,version:1,content:{headline:'Título',price:'',date:'',caption:'',captionOrigin:'user'}}]}}));
 await page.route('**/api/image-assets**',async r=>{const capturedUser=user,u=new URL(r.request().url()),after=u.searchParams.get('after');calls.push({user:capturedUser,after,version:u.searchParams.get('version')});if(capturedUser==='alice' && blockAlice){enteredAlice=true;await aliceGate;}if(capturedUser==='bob')return r.fulfill({json:{assets:[{assetId:id(101),origin:'unknown'}],nextCursor:null}});if(after && failSecond){failSecond=false;return r.fulfill({status:503,json:{error:'unavailable'}});}return r.fulfill({json:after?{assets:[{assetId:id(51),origin:'unknown'}],nextCursor:null}:{assets:Array.from({length:50},(_,i)=>({assetId:id(i+1),origin:'unknown'})),nextCursor:id(50)}}).catch(()=>{});});
 await page.route('**/api/images?**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64')}));
 await page.goto(origin);await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();
 await page.getByRole('button',{name:'Carregar mais imagens'}).click();await page.getByText(/Não foi possível consultar as imagens/).waitFor();await page.getByRole('button',{name:'Ver imagem recuperada 50'}).waitFor();await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 51'}).click();await page.getByRole('img',{name:'Imagem para revisão'}).waitFor();await page.getByText(/origem desconhecida/i).first().waitFor();assert.equal(calls.at(-1).after,id(50));
 await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByRole('button',{name:'Carregar mais imagens'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 51'}).waitFor();
 user='bob';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Abrir Projeto'}).waitFor();await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).waitFor();assert.equal(await page.getByRole('button',{name:'Ver imagem recuperada 51'}).count(),0);assert.equal(await page.getByRole('img',{name:'Imagem para revisão'}).count(),0);assert.ok(calls.every(c=>c.version==='1'));
 blockAlice=true;aliceGate=new Promise(resolve=>{releaseAlice=resolve;});user='alice';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();
 const waitForAlice=Date.now()+4000;while(!enteredAlice && Date.now()<waitForAlice)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(enteredAlice,true);user='bob';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();releaseAlice();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).waitFor();await page.waitForTimeout(100);assert.equal(await page.getByRole('button',{name:'Ver imagem recuperada 50'}).count(),0);

});

test('consulta somente a versão aberta e descarta a prévia anterior', {skip:!existsSync(browserPath)},async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;while(true){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>deadline)throw Error('app indisponível');await new Promise(r=>setTimeout(r,200));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(4000);const calls=[];
 await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.startsWith('compor-agent-attempt:'))throw Error('storage indisponível');return original.call(this,key);};});
 await page.route('**/auth/session',r=>r.fulfill({json:{state:'connected',userId:'alice'}}));await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:project,title:'Projeto'}]}}));
 const content={headline:'Título',price:'',date:'',caption:'',captionOrigin:'user'};await page.route('**/api/pieces*',r=>r.fulfill({json:{versions:[1,2].map(version=>({project_id:project,piece_id:piece,version,content}))}}));
 await page.route('**/api/image-assets**',r=>{const version=new URL(r.request().url()).searchParams.get('version');calls.push(version);return r.fulfill({json:{assets:[{assetId:id(Number(version)),origin:'unknown'}],nextCursor:null}});});
 await page.route('**/api/images?**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64')}));
 await page.goto(origin);await page.getByRole('button',{name:'Abrir Projeto'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 2'}).click();await page.getByText(/Não foi possível preservar o estado da tentativa/).waitFor();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).click();await page.getByRole('img',{name:'Imagem para revisão'}).waitFor();
 await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByRole('button',{name:'Ver imagem recuperada 1'}).waitFor();assert.equal(await page.getByRole('img',{name:'Imagem para revisão'}).count(),0);assert.deepEqual(calls.filter((value,index)=>index===0 || calls[index-1]!==value),['2','1']);
});

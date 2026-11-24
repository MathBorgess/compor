import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer as createSocket} from 'node:net';
import {waitForApp,stopApp} from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('consentimento não atravessa conta nem pedido antigo após troca de projeto',{skip:!existsSync(browserPath),timeout:20000},async t=>{
 const source=`
 import {useState} from 'react';import {createRoot} from 'react-dom/client';
 import ReferenceExploration from './studio/reference-exploration.tsx';
 import {clearReferenceAuthorityConsent,readReferenceAuthorityConsent} from './lib/reference-authority-consent.ts';
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 window.pending=[];window.readConsent=()=>readReferenceAuthorityConsent(id(1));window.readOther=()=>readReferenceAuthorityConsent(id(2));
 window.fetch=async(path,options)=>{const body=JSON.parse(options.body);if(path.endsWith('/consent'))return new Promise(resolve=>window.pending.push({body,resolve:()=>resolve(Response.json({status:'granted',consentId:body.consentId,capability:'A'.repeat(43)}))}));if(path.endsWith('/history'))return Response.json({references:[]});throw Error('unexpected');};
 if(!location.search.includes('no-search'))sessionStorage.setItem('compor-reference-session-consent',JSON.stringify({userId:id(1),granted:true}));
 function Fixture(){const [user,setUser]=useState(id(1)),[project,setProject]=useState(id(3)),[required,setRequired]=useState(true);return <><button onClick={()=>setProject(id(4))}>Projeto B</button><button onClick={()=>setProject(id(3))}>Projeto A</button><button onClick={()=>setRequired(value=>!value)}>Alternar capacidade</button><button onClick={()=>{clearReferenceAuthorityConsent();setUser(id(2));}}>Outra conta</button><button onClick={()=>{clearReferenceAuthorityConsent();}}>Sair</button><ReferenceExploration userId={user} projectId={project} idea="" selectedOrigins={[]} authorityConsentRequired={required} onUseReference={async()=>{}}/></>;}
 createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('content-type','text/javascript');response.end(result.outputFiles[0].text);}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(4000);await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText(/sessão do agente mantém estado e não usa retenção zero/).waitFor();
 await page.getByRole('button',{name:'Permitir uso na geração'}).click();await page.waitForFunction(()=>window.pending.length===1);
 await page.getByRole('button',{name:'Projeto B'}).click();await page.getByRole('button',{name:'Permitir uso na geração'}).click();await page.waitForFunction(()=>window.pending.length===2);
 await page.evaluate(()=>window.pending[1].resolve());await page.getByText('Referências externas escolhidas podem orientar a geração nesta página.').waitFor();
 const current=await page.evaluate(()=>window.readConsent().consentId);await page.evaluate(()=>window.pending[0].resolve());await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.readConsent().consentId),current);assert.equal(await page.evaluate(()=>(JSON.stringify(localStorage)+JSON.stringify(sessionStorage)).includes('A'.repeat(43))),false);
 await page.getByRole('button',{name:'Sair'}).click();assert.equal(await page.evaluate(()=>window.readConsent()),null);
 await page.getByRole('button',{name:'Outra conta'}).click();await page.getByRole('button',{name:'Permitir uso na geração'}).click();await page.waitForFunction(()=>window.pending.length===3);
 await page.getByRole('button',{name:'Sair'}).click();await page.evaluate(()=>window.pending[2].resolve());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.readOther()),null);
 await page.reload();await page.getByRole('button',{name:'Permitir uso na geração'}).evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>window.pending.length===1);
 await page.getByRole('button',{name:'Projeto B'}).click();await page.getByRole('button',{name:'Projeto A'}).click();await page.evaluate(()=>window.pending[0].resolve());await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.readConsent()),null,'retornar ao escopo anterior não restaura grant obsoleto');assert.equal(await page.getByRole('button',{name:'Permitir uso na geração'}).isEnabled(),true);
 await page.getByRole('button',{name:'Permitir uso na geração'}).click();await page.waitForFunction(()=>window.pending.length===2);await page.getByRole('button',{name:'Alternar capacidade'}).click();await page.getByRole('button',{name:'Alternar capacidade'}).click();await page.evaluate(()=>window.pending[1].resolve());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.readConsent()),null);
 await page.evaluate(()=>sessionStorage.removeItem('compor-reference-session-consent'));await page.goto(`http://127.0.0.1:${server.address().port}/?no-search`);
 await page.getByRole('button',{name:'Permitir uso na geração'}).waitFor();assert.equal(await page.getByRole('button',{name:'Permitir nesta sessão'}).count(),0);assert.equal(await page.evaluate(()=>window.pending.length),0,'busca automática não autoriza geração');
});

test('Workspace invalida consentimento ao trocar conta e ao sair',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const fixture=await mkdtemp(new URL('../pages/authority-consent-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('index.jsx',`file://${fixture}/`),`'use client';import Workspace from '../../studio/workspace';import {grantReferenceAuthorityConsent,readReferenceAuthorityConsent} from '../../lib/reference-authority-consent';if(typeof window!=='undefined'){window.testGrant=user=>grantReferenceAuthorityConsent(user);window.testRead=user=>readReferenceAuthorityConsent(user);}export default function Page(){return <Workspace loginAvailable/>;}`);
 const socket=createSocket();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);
 const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';let identity=alice,holdGrant=false,releaseGrant,markGrant;
 const grantPending=new Promise(resolve=>{markGrant=resolve;});
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:identity}}));await page.route('**/auth/sign-out',route=>route.fulfill({json:{state:'signed-out'}}));await page.route('**/api/projects',route=>route.fulfill({json:{projects:[]}}));
 await page.route('**/api/studio/reference-authority/consent',route=>{const body=route.request().postDataJSON(),finish=()=>route.fulfill({json:{status:'granted',consentId:body.consentId,capability:'A'.repeat(43)}});if(holdGrant)return new Promise(resolve=>{releaseGrant=()=>{void finish().then(resolve);};markGrant();});return finish();});
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByLabel('Nome do projeto',{exact:true}).waitFor();await page.evaluate(user=>window.testGrant(user),alice);assert.ok(await page.evaluate(user=>window.testRead(user),alice));
 identity=bob;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(user=>window.testRead(user)===null,alice);await page.evaluate(user=>window.testGrant(user),bob);assert.ok(await page.evaluate(user=>window.testRead(user),bob));
 holdGrant=true;await page.evaluate(user=>{window.pendingGrant=window.testGrant(user).then(()=>true,()=>false);},bob);await grantPending;
 await page.getByLabel(/Conta:/).click();await page.getByRole('button',{name:'Sair',exact:true}).click();await page.waitForFunction(user=>window.testRead(user)===null,bob);
 releaseGrant();assert.equal(await page.evaluate(()=>window.pendingGrant),false);assert.equal(await page.evaluate(user=>window.testRead(user),bob),null);
});

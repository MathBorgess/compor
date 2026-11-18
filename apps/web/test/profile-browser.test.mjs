import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),project=id(3),at='2026-11-16T15:00:00.000Z';
const pageData={userId:alice,projects:[{id:project,title:'Café Aurora',deletedAt:at}],signals:[{kind:'reference',id:id(5),projectId:project,pieceId:null,action:'comment',comment:'Prefiro a luz suave da manhã.',supersedes:null,createdAt:at,originUrl:'https://www.pinterest.com/pin/123/',title:'Café com luz natural'}],nextOffset:null,limitedSources:[]};
const source=`
import {StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioProfile from './studio/studio-profile.tsx';
import {createStudioStorage} from './lib/studio-storage.ts';
import {createStudioState,addCreativeCriterion,recordCreativeDecision} from './lib/studio-state.ts';
import './studio/studio-shell.css';
import './studio/studio-guided.css';
const storage=createStudioStorage();
for(const [userId,statement] of [['${alice}','Contraste suave'],['${bob}','Critério privado da outra conta']]){
 let state=createStudioState({userId,projectId:'${project}'});
 state=addCreativeCriterion(state,{id:'${id(7)}',viewpoint:'creator',dimension:'visual',statement,example:{description:'Creme e azul',referenceId:null},counterexample:{description:'Neon',referenceId:null},provenance:'creator_report',source:'Conversa do projeto',tension:''});
 state=recordCreativeDecision(state,{id:'${id(8)}',criterionId:'${id(7)}',choice:'accept',reason:'Direção desta cafeteria',at:'${at}'});
 await storage.save(state,{expectedRevision:null});
}
storage.close();
function Screen(){const [open,setOpen]=useState(false);return <><button type="button" onClick={()=>setOpen(true)}>Seu perfil</button>{open&&<StudioProfile userId="${alice}" isAuthenticated={()=>true} onClose={()=>setOpen(false)}/>}</>;}
createRoot(document.getElementById('root')).render(<StrictMode><Screen/></StrictMode>);`;

async function fixture(t,viewport={width:1100,height:850}) {
  const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',outdir:'/tmp/compor-profile-test',external:['/studio/*'],define:{'process.env.NODE_ENV':'"test"'}});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js')).text,css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
  const server=createServer((req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}
    else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}
    else{res.setHeader('content-type','text/html');res.end('<html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body class="compor-studio" style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:browserPath,headless:true});
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage({viewport});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  return {page,origin:`http://127.0.0.1:${server.address().port}`};
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:30000};

test('perfil consulta projeto excluído e critérios locais sem expor outra conta',options,async t=>{
  const {page,origin}=await fixture(t,{width:320,height:780});let calls=0;
  await page.route('**/api/profile',route=>{calls++;assert.equal(route.request().method(),'POST');assert.deepEqual(route.request().postDataJSON(),{offset:0});return route.fulfill({json:pageData});});
  await page.goto(origin);
  const open=page.getByRole('button',{name:'Seu perfil',exact:true});await open.click();
  const dialog=page.getByRole('dialog',{name:'Seu perfil',exact:true});
  await dialog.getByText('Excluído da lista',{exact:true}).waitFor();
  await dialog.locator('.profile-project > summary').click();
  await dialog.getByText('Contraste suave',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('Prefiro a luz suave da manhã.',{exact:true}).isVisible(),true);
  assert.equal(await dialog.getByText('Aceito',{exact:true}).isVisible(),true);
  assert.equal(await dialog.getByText('Critério privado da outra conta',{exact:true}).count(),0);
  assert.match(await dialog.innerText(),/Neste navegador.*não são sincronizados/s);
  assert.ok(await page.evaluate(()=>{const dialog=document.querySelector('dialog');return dialog.scrollWidth<=dialog.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth;}));
  const box=await dialog.getByRole('button',{name:'Fechar perfil'}).boundingBox();assert.ok(box.width>=44&&box.height>=44);
  const previousReads=calls;
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await open.evaluate(element=>element===document.activeElement),true);
  await open.click();await page.getByText('Excluído da lista',{exact:true}).waitFor();assert.ok(calls>previousReads,'reabrir o perfil consulta novamente a conta');
});

test('falha e resposta de outra conta nunca aparecem como perfil vazio ou próprio',options,async t=>{
  const {page,origin}=await fixture(t);let outcome='failure';
  await page.route('**/api/profile',route=>outcome==='failure'?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:outcome==='foreign'?{...pageData,userId:bob}:pageData}));
  await page.goto(origin);await page.getByRole('button',{name:'Seu perfil',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Seu perfil'});await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByText('Café Aurora',{exact:true}).count(),0);
  outcome='foreign';await dialog.getByRole('button',{name:'Tentar novamente'}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByText('Café Aurora',{exact:true}).count(),0);
  outcome='success';await dialog.getByRole('button',{name:'Tentar novamente'}).click();await dialog.getByText('Café Aurora',{exact:true}).waitFor();
});

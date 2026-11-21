import {openPostEditor} from './guided-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie,sessionCookieHeaders} from './session-cookie.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),projectId=id(3);
const red=[255,0,0,255],blue=[0,0,255,255];

test('salvar no navegador A mostra a imagem num navegador B limpo e não troca a versão',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_publictest',APP_ORIGIN:origin,NEXT_TELEMETRY_DISABLED:'1'}});
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,headers:sessionCookieHeaders(origin),nextApp:true});
 browser=await chromium.launch({executablePath:browserPath,headless:true});
 const versions=[],images=new Map(),links=new Map(),uploads=[];
 let loseNextSave=true,loseNextUpload=true,privateImagesDisabled=false;
 async function install(page){
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/auth/session')return route.fulfill({json:{state:'connected',userId:alice}});
   if(url.pathname==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
   if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto sintético',revision:1}]}});
   if(url.pathname==='/api/pieces'&&request.method()==='GET')return route.fulfill({json:{versions}});
   if(url.pathname==='/api/pieces'&&request.method()==='POST'){
    const body=request.postDataJSON();
    const latest=versions.filter(item=>item.piece_id===body.pieceId).reduce((max,item)=>Math.max(max,item.version),0);
    if(latest!==body.expectedVersion)return route.fulfill({status:409,json:{status:'conflict',currentVersion:latest}});
    const version={project_id:projectId,piece_id:body.pieceId,version:latest+1,content:body.content,metadata:{revision:1,baseVersion:body.baseVersion||null,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}};
    versions.push(version);
    if(loseNextSave){loseNextSave=false;return route.fulfill({status:500,json:{error:'lost'}});}
    return route.fulfill({json:{status:'saved',version}});
   }
   if(url.pathname==='/api/piece-version-images'&&request.method()==='GET'){
    if(privateImagesDisabled)return route.fulfill({status:503,json:{error:'private_images_disabled'}});
    const key=`${url.searchParams.get('pieceId')}:${url.searchParams.get('version')}`;
    return route.fulfill({json:{assetId:links.get(key)??null}});
   }
   if(url.pathname==='/api/piece-version-images'&&request.method()==='POST'){
    const body=request.postDataJSON(),key=`${body.pieceId}:${body.version}`,existing=links.get(key);
    if(existing&&existing!==body.assetId)return route.fulfill({json:{status:'conflict',assetId:existing}});
    links.set(key,body.assetId);
    return route.fulfill({json:{status:'bound',assetId:body.assetId}});
   }
   if(url.pathname==='/api/images'&&request.method()==='POST'){
    const assetId=url.searchParams.get('assetId'),key=`${url.searchParams.get('pieceId')}:${url.searchParams.get('version')}:${assetId}`,body=request.postDataBuffer();
    const previous=images.get(key);
    uploads.push({assetId,version:url.searchParams.get('version'),duplicate:Boolean(previous),same:previous?previous.equals(body):false});
    if(previous)return route.fulfill({status:409,json:{error:'asset_exists',retryAutomatically:false}});
    images.set(key,Buffer.from(body));
    if(loseNextUpload){loseNextUpload=false;return route.fulfill({status:502,json:{error:'result_unknown'}});}
    return route.fulfill({status:201,json:{status:'stored',assetId}});
   }
   if(url.pathname==='/api/images'&&request.method()==='GET'){
    const bytes=images.get(`${url.searchParams.get('pieceId')}:${url.searchParams.get('version')}:${url.searchParams.get('assetId')}`);
    if(!bytes)return route.fulfill({status:404,json:{error:'not_found'}});
    return route.fulfill({contentType:'image/png',body:bytes});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'unavailable'}});
   return route.continue();
  });
  return errors;
 }
 async function solidPng(page,color,width=12){
  const data=await page.evaluate(({color,width})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=12;const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,width,12);return canvas.toDataURL('image/png').split(',')[1];},{color,width});
  return Buffer.from(data,'base64');
 }
 async function pixel(page,name){
  const image=page.getByRole('img',{name,exact:true}).first();
  await image.waitFor();
  await page.waitForFunction(alt=>{const node=document.querySelector(`img[alt="${alt}"]`);return node instanceof HTMLImageElement&&node.naturalWidth>0;},name);
  return image.evaluate(node=>{const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;const context=canvas.getContext('2d');context.drawImage(node,0,0);return Array.from(context.getImageData(0,0,1,1).data);});
 }
 async function chooseImage(page,buffer,name){
  if(!await page.getByLabel('Imagem-base PNG ou JPEG',{exact:true}).isVisible())await page.getByRole('button',{name:'Imagem-base',exact:true}).click();
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel('Imagem-base PNG ou JPEG',{exact:true}).click()]);
  await chooser.setFiles({name,mimeType:'image/png',buffer});
 }
 const contextA=await browser.newContext({viewport:{width:1440,height:1000}});
 await contextA.addCookies([sessionCookie(origin)]);
 const page=await contextA.newPage();page.setDefaultTimeout(8000);
 const errorsA=await install(page);
 await page.goto(origin);
 await page.getByRole('button',{name:'Projeto sintético Abrir projeto',exact:true}).click();
 await page.getByRole('button',{name:'Criar novo post',exact:true}).click();
 await openPostEditor(page);
 await page.getByLabel('Título',{exact:true}).fill('Arte salva sintética');
 await chooseImage(page,await solidPng(page,'#ff0000',2049),'larga.png');
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===2049);
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('Seu rascunho foi preservado. Para salvar a versão, use uma imagem de até 2048 × 2048 pixels que resulte em um PNG de até 4 MB.',{exact:true}).waitFor();
 assert.equal(versions.length,0,'uma imagem incompatível não deixa uma versão parcialmente salva');
 assert.equal(uploads.length,0);
 await chooseImage(page,await solidPng(page,'#ff0000'),'vermelha.png');
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===12);
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('O resultado do salvamento é desconhecido. Seu rascunho continua nesta aba; consulte as versões antes de repetir.',{exact:true}).waitFor();
 assert.equal(uploads.length,0,'uma resposta perdida não publica a imagem antes de confirmar a versão');
 const lostUpload=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/images'&&response.request().method()==='POST'&&response.status()===502);
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await lostUpload;
 await page.getByText('O resultado do salvamento é desconhecido. Seu rascunho continua nesta aba; consulte as versões antes de repetir.',{exact:true}).waitFor();
 assert.equal(images.size,1);assert.equal(links.size,0);
 await chooseImage(page,await solidPng(page,'#0000ff'),'azul-retry.png');
 await page.waitForFunction(()=>{const node=document.querySelector('img[alt="Arte integral da versão selecionada"]');if(!(node instanceof HTMLImageElement)||!node.naturalWidth)return false;const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');context.drawImage(node,0,0,1,1);return context.getImageData(0,0,1,1).data[2]>200;});
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('Recuperamos a versão que já havia sido salva. Seu rascunho foi preservado; solicite a geração novamente.',{exact:true}).waitFor();
 assert.equal(versions.length,1);assert.equal(uploads.length,2);assert.equal(images.size,1);assert.equal(links.size,1);
 assert.deepEqual(uploads.map(({duplicate,same})=>({duplicate,same})),[{duplicate:false,same:false},{duplicate:true,same:false}]);
 const versionsButton=page.getByRole('button',{name:'Versões',exact:true});
 if(await versionsButton.getAttribute('aria-expanded')!=='true')await versionsButton.click();
 assert.deepEqual(await pixel(page,'Arte da versão 1'),red);
 await chooseImage(page,await solidPng(page,'#0000ff'),'azul.png');
 await page.waitForFunction(()=>{const node=document.querySelector('img[alt="Arte integral da versão selecionada"]');if(!(node instanceof HTMLImageElement)||!node.naturalWidth)return false;const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');context.drawImage(node,0,0,1,1);const [r,g,b]=context.getImageData(0,0,1,1).data;return b>200&&r<30;});
 assert.deepEqual(await pixel(page,'Arte integral da versão selecionada'),blue);
 assert.deepEqual(await pixel(page,'Arte da versão 1'),red,'Imagem-base não substitui a versão salva');
 assert.equal(uploads.length,2,'trocar a imagem-base não envia outro PNG');
 const postUrl=page.url();
 assert.match(postUrl,/\/projetos\/[^/]+\/posts\/[^/]+$/);
 const contextB=await browser.newContext({viewport:{width:1440,height:1000}});
 t.after(()=>contextB.close());
 await contextB.addCookies([sessionCookie(origin)]);
 const clean=await contextB.newPage();clean.setDefaultTimeout(8000);
 const errorsB=await install(clean);
 await clean.goto(postUrl);
 await clean.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 assert.deepEqual(await pixel(clean,'Arte integral da versão selecionada'),red);
 assert.equal(await clean.getByRole('button',{name:/Recuperar imagem da versão/}).count(),0);
 assert.equal(uploads.length,2,'reabrir não envia a imagem de novo');
 privateImagesDisabled=true;
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 assert.deepEqual(await pixel(page,'Arte da versão 2'),blue,'salvar localmente preserva o PNG com envio desativado');
 assert.equal(versions.length,2);assert.equal(uploads.length,2);assert.equal(links.size,1);
 assert.deepEqual(errorsA,[]);assert.deepEqual(errorsB,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie,sessionCookieHeaders} from './session-cookie.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),projectId=id(3),existingPiece=id(4);
const key=`sk-synthetic-${'x'.repeat(30)}`;
const content=headline=>({headline,price:'R$ 20,00',date:'10/11/2026',caption:'Legenda sintética',captionOrigin:'user'});
async function eventually(fn,predicate,timeout=5000){const until=Date.now()+timeout;for(;;){const value=await fn();if(predicate(value))return value;if(Date.now()>until)throw Error('expected persistent state was not observed');await new Promise(resolve=>setTimeout(resolve,40));}}
async function stored(page,userId=alice){return page.evaluate(async scope=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction('states').objectStore('states').get(JSON.stringify([scope.userId,scope.projectId]));request.onsuccess=()=>resolve(request.result?.state??null);request.onerror=()=>reject(request.error);});}finally{db.close();}},{userId,projectId});}
async function openDrawer(page,name){const panel=page.getByRole('dialog',{name,exact:true});if(!await panel.isVisible())await page.getByRole('button',{name:name==='Bases'?/^Bases \(\d+\)$/:name,exact:true}).click();await panel.waitFor();return panel;}
async function closeDrawer(page){await page.keyboard.press('Escape');await page.getByRole('dialog',{name:/^(Bases|Marca)$/}).waitFor({state:'hidden'});}
async function openEditor(page){
 const title=page.getByLabel('Título',{exact:true}),open=page.getByRole('button',{name:'Definir textos da arte',exact:true});
 await title.or(open).first().waitFor();
 if(await open.isVisible()){
  // The floating conversation may cover the briefing; use its visible control
  // to reveal the editor action, as a person can, and restore it afterwards.
  const collapse=page.getByRole('button',{name:'Recolher conversa',exact:true});
  const wasOpen=await collapse.isVisible();
  if(wasOpen)await collapse.click();
  await open.click();await title.waitFor();
  if(wasOpen)await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
 }
 await title.waitFor();
}
async function chooseFiles(page,label,files){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel(label,{exact:true}).click()]);await chooser.setFiles(files);}

async function app(t){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_publictest',APP_ORIGIN:origin}});
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,headers:sessionCookieHeaders(origin),nextApp:true});
 browser=await chromium.launch({executablePath:browserPath,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addCookies([sessionCookie(origin)]);
 const page=await context.newPage(),errors=[],external=[],calls=[],revokedImages=[];
 page.setDefaultTimeout(6000);
 await page.exposeFunction('reportRevokedImage',image=>revokedImages.push(image));
 await page.addInitScript(()=>{
  const revoke=URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL=url=>{
   for(const image of document.images)if(image.src===url)window.reportRevokedImage({url,alt:image.alt});
   revoke(url);
  };
 });
 page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(entry.type()==='error')errors.push(`${entry.text()} (${entry.location().url})`);});
 const session={state:'connected',userId:alice,hold:null};
 const versions=[{project_id:projectId,piece_id:existingPiece,version:1,content:content('Original antigo')},{project_id:projectId,piece_id:existingPiece,version:2,content:content('Atual existente')}];
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/session'){if(session.hold)await session.hold;return route.fulfill({status:session.state==='unavailable'?503:200,json:{state:session.state,userId:session.userId}});}
  if (url.pathname === '/api/studio/explorations/signals') return route.fulfill({json:{signals:[]}});
  if (url.pathname === '/api/studio/explorations/status') return route.fulfill({json:{status:'active'}});
  if (url.pathname === '/api/studio/references/signals') {
   assert.deepEqual(request.postDataJSON(), {projectId, scope:'account'});
   return route.fulfill({json:{signals:[]}});
  }
    if(url.pathname==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto sintético'}]}});
  if(url.pathname==='/api/pieces'){
   if(request.method()==='GET')return route.fulfill({json:{versions}});
   const body=request.postDataJSON();calls.push({path:url.pathname,body});const version={project_id:projectId,piece_id:body.pieceId,version:body.expectedVersion+1,content:body.content};versions.push(version);return route.fulfill({json:{status:'saved',version}});
  }
  if(url.pathname==='/api/studio/chat'){
   const body=request.postDataJSON();calls.push({path:url.pathname,body});
   return route.fulfill({status:202,json:{status:'action_required',action:{name:'compor_novo_post',args:{projectId,requestId:id(80),revision:body.context.revision}},actionBinding:'synthetic-binding'}});
  }
  if(url.pathname==='/api/studio/action'){calls.push({path:url.pathname,body:request.postDataJSON()});return route.fulfill({json:{status:'completed',text:'Novo post preparado no navegador.'}});}
  if(url.pathname.startsWith('/api/')){calls.push({path:url.pathname});return route.fulfill({status:500,json:{error:'unexpected_test_operation'}});}
  return route.continue();
 });
 return{page,origin,session,errors,external,calls,revokedImages};
}

test('Workspace preserva conversa, marcações e referências e exporta a arte integral sem chamada paga', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,session,errors,external,calls,revokedImages}=await app(t);
 await page.goto(origin);await page.getByRole('button',{name:/Projeto sintético/}).click();await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
 await openEditor(page);
 await openDrawer(page,'Marca');
 await page.getByLabel('Quem você quer alcançar?',{exact:true}).fill('Pessoas interessadas em aprender');
 await page.getByRole('button',{name:'Continuar com o que sei',exact:true}).click();
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);
 await page.getByRole('button',{name:'Continuar',exact:true}).click();
 const files=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#2244aa';ctx.fillRect(0,0,128,128);return{png:c.toDataURL('image/png').split(',')[1],jpeg:c.toDataURL('image/jpeg').split(',')[1]};});
 assert.equal(await page.getByRole('button',{name:'Preparar PNG',exact:true}).isDisabled(),true,'an empty draft cannot export placeholder artwork');
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 await chooseFiles(page,'Imagem-base PNG ou JPEG',{name:'artwork.png',mimeType:'image/png',buffer:Buffer.from(files.png,'base64')});
 await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 await page.getByRole('button',{name:'Pedir ajuste no estúdio',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isDisabled(),true,'an unsaved post cannot be approved');
 await page.getByLabel('Título',{exact:true}).fill('Meu primeiro post sintético');
 await page.getByLabel('Legenda',{exact:true}).fill('Somente uma legenda de teste');
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 assert.deepEqual(revokedImages,[],'saving preserves a live URL for every rendered image');
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isEnabled(),true,'a saved clean version can be approved');
 assert.equal(await page.getByRole('button',{name:'Marcar elemento título',exact:true}).count(),0,'literal text is an instruction for the engine, without a local title overlay');
 const frame=page.getByLabel('Arte integral do post',{exact:true});
 for(const [index,instruction] of ['Destacar esta região','Ajustar esta região'].entries()){
  await page.getByRole('button',{name:'Marcar área',exact:true}).click();
  await frame.scrollIntoViewIfNeeded();const rect=await frame.boundingBox();
  await page.mouse.move(rect.x+40+index*10,rect.y+40);await page.mouse.down();await page.mouse.move(rect.x+140,rect.y+150,{steps:4});await page.mouse.up();
  await page.getByLabel('O que deve mudar nesta área?',{exact:true}).fill(instruction);
  await page.getByRole('button',{name:'Adicionar ao pedido',exact:true}).click();
 }
 await eventually(()=>stored(page),value=>value?.marks?.length===2);
 const markList=page.getByRole('region',{name:'Marcações deste post',exact:true});
 await markList.getByText('Destacar esta região',{exact:true}).waitFor();
 await markList.getByText('Ajustar esta região',{exact:true}).waitFor();
 await markList.getByRole('button',{name:'Remover marcação 1',exact:true}).click();
 await eventually(()=>stored(page),value=>value?.marks?.length===1&&value.marks[0].kind==='area');
 assert.equal(await markList.getByText('Destacar esta região',{exact:true}).count(),0);
 await page.screenshot({path:'/tmp/compor-studio-visual-marks.png',fullPage:true});
 await openDrawer(page,'Bases');
 await chooseFiles(page,'Adicionar PNG ou JPEG',[{name:'reference.png',mimeType:'image/png',buffer:Buffer.from(files.png,'base64')},{name:'reference.jpg',mimeType:'image/jpeg',buffer:Buffer.from(files.jpeg,'base64')}]);
 await page.getByRole('img',{name:'reference.png',exact:true}).waitFor();await page.getByRole('img',{name:'reference.jpg',exact:true}).waitFor();
 await eventually(()=>stored(page),value=>value?.references?.length===2);
 await page.getByRole('button',{name:'Remover referência',exact:true}).first().click();
 await eventually(()=>stored(page),value=>value?.references?.length===1);
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Original antigo.*Versão 1/}).click();
 await page.getByLabel('Título',{exact:true}).fill('Alteração local da base antiga');
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isDisabled(),true,'editing a saved version requires saving before approval');
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Atual existente.*Versão 2/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Atual existente');
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Original antigo.*Versão 1/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Alteração local da base antiga');
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Inicie um novo post para outra ideia');
 await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByText('Novo post preparado no navegador.',{exact:true}).waitFor();await openEditor(page);
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'');
 await page.getByLabel('Título',{exact:true}).fill('Rascunho que permanece local');
 await page.getByText('Adicionar outras informações',{exact:true}).click();await page.getByRole('button',{name:'Adicionar preço',exact:true}).click();await page.getByRole('button',{name:'Adicionar data',exact:true}).click();await page.getByLabel('Preço',{exact:true}).fill('R$ 15');await page.getByLabel('Data',{exact:true}).fill('20/11');
 await eventually(()=>stored(page),value=>value?.drafts?.some(d=>d.content.headline==='Rascunho que permanece local'));
 let release;session.hold=new Promise(resolve=>{release=resolve;});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByText('Verificando sua conta…',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('studio-auth-boundary').isVisible(),false);
 release();session.hold=null;
 await openEditor(page);
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Rascunho que permanece local','same-account check keeps the active project mounted');
 await page.getByLabel('Sua mensagem',{exact:true}).fill('A chave ainda está nesta sessão');assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isEnabled(),true);await page.getByLabel('Sua mensagem',{exact:true}).fill('');
 const persisted=await stored(page);assert.equal(persisted.persona.audience,'Pessoas interessadas em aprender');assert.equal(persisted.messages.length,2);assert.equal(persisted.references[0].mime,'image/jpeg');
 const storageText=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);});const records=await new Promise(resolve=>{const r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return JSON.stringify([records,Object.entries(localStorage),Object.entries(sessionStorage)]);});
 assert.equal(storageText.includes(key),false);
 const conversation=page.getByRole('complementary',{name:'Conversa com a IA',exact:true});
 // Reopening the conversation replays its 180 ms expand animation; measure the settled layout, not two frames of it.
 await conversation.evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
 const chatBounds=await conversation.boundingBox(),composerBounds=await page.locator('form.studio-chat-composer').boundingBox();
 assert.ok(Math.abs(chatBounds.y+chatBounds.height-composerBounds.y-composerBounds.height)<=2,'the composer stays at the conversation bottom');
 const connectionButton=page.getByRole('button',{name:'IA conectada',exact:true});assert.ok((await connectionButton.boundingBox()).height>=40,'the connection action has the same minimum target size as other header actions');
 assert.equal(await page.locator('.studio-chat-header img').evaluate(element=>element.complete&&element.naturalWidth>0),true,'the Compor avatar asset is visible');
 await page.screenshot({path:'/tmp/compor-studio-visual-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'page itself must not overflow; board may scroll internally');
 for(const name of [/^Bases \(\d+\)$/,'Marca']){const control=await page.getByRole('button',{name,exact:true}).boundingBox();assert.ok(control.x>=0&&control.x+control.width<=390,'the mobile navigation controls remain visible');}
 await page.screenshot({path:'/tmp/compor-studio-visual-mobile.png',fullPage:true});
 await page.getByLabel('Título',{exact:true}).scrollIntoViewIfNeeded();
 const mobileField=await page.getByLabel('Título',{exact:true}).boundingBox();assert.ok(mobileField.x>=0&&mobileField.x+mobileField.width<=390,'the mobile inspector remains readable within the screen');
 await page.screenshot({path:'/tmp/compor-studio-visual-mobile-inspector.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.reload();await page.getByRole('button',{name:/Projeto sintético/}).click();
 await openEditor(page);
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Rascunho que permanece local');
 assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true,'key does not survive reload');
 await openDrawer(page,'Bases');await page.getByRole('img',{name:'reference.jpg',exact:true}).waitFor();
 await closeDrawer(page);
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 await chooseFiles(page,'Imagem-base PNG ou JPEG',{name:'artwork.png',mimeType:'image/png',buffer:Buffer.from(files.png,'base64')});
 await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).click();
 await page.getByRole('img',{name:'Prévia da arte integral, sem textos adicionados pelo aplicativo',exact:true}).waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();const file=await(await download).path();const bytes=await readFile(file);
 assert.deepEqual(bytes,Buffer.from(files.png,'base64'),'export preserves every pixel and PNG byte despite title, price and date instructions');
 await chooseFiles(page,'Imagem-base PNG ou JPEG',{name:'base.jpg',mimeType:'image/jpeg',buffer:Buffer.from(files.jpeg,'base64')});
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Baixar PNG',exact:true}).isDisabled(),true,'new base invalidates the earlier preview');
 assert.equal(calls.filter(call=>call.path==='/api/studio/chat').length,1);assert.equal(calls.filter(call=>call.path==='/api/studio/action').length,1);
 assert.equal(calls.some(call=>call.path.includes('/image')),false);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 assert.deepEqual(revokedImages,[],'switching versions, references and previews never revokes a URL still rendered by an image');
});

test('revalidação de identidade oculta a conta anterior e troca de conta limpa a chave', {skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,session,errors}=await app(t);await page.goto(origin);await page.getByRole('button',{name:/Projeto sintético/}).click();
 await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Somente de Alice');await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);
 let release;session.hold=new Promise(resolve=>{release=resolve;});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Verificando sua conta…',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('studio-auth-boundary').isVisible(),false);session.userId=bob;release();session.hold=null;
 await page.getByRole('button',{name:/Projeto sintético/}).click();await openEditor(page);assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'');
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).inputValue(),'');
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);session.state='signed-out';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Entrar com Google',exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).count(),0);
 session.state='connected';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:/Projeto sintético/}).click();await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).inputValue(),'');
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);session.state='unavailable';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Login temporariamente indisponível.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).count(),0);
 assert.deepEqual(errors,[`Failed to load resource: the server responded with a status of 503 (Service Unavailable) (${origin}/auth/session)`]);
});

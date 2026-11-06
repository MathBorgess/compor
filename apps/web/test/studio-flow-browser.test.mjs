import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),projectId=id(3),existingPiece=id(4);
const key=`sk-synthetic-${'x'.repeat(30)}`;
const content=headline=>({headline,price:'R$ 20,00',date:'10/11/2026',caption:'Legenda sintética',captionOrigin:'user'});
async function eventually(fn,predicate,timeout=5000){const until=Date.now()+timeout;for(;;){const value=await fn();if(predicate(value))return value;if(Date.now()>until)throw Error('expected persistent state was not observed');await new Promise(resolve=>setTimeout(resolve,40));}}
async function stored(page,userId=alice){return page.evaluate(async scope=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction('states').objectStore('states').get(JSON.stringify([scope.userId,scope.projectId]));request.onsuccess=()=>resolve(request.result?.state??null);request.onerror=()=>reject(request.error);});}finally{db.close();}},{userId,projectId});}

async function app(t){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,COMPOR_STUDIO_WEB_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_publictest',APP_ORIGIN:origin}});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>until||child.exitCode!==null)throw Error('app unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage(),errors=[],external=[],calls=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text());});
 const session={state:'connected',userId:alice,hold:null};
 const versions=[{piece_id:existingPiece,version:1,content:content('Original antigo')},{piece_id:existingPiece,version:2,content:content('Atual existente')}];
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/session'){if(session.hold)await session.hold;return route.fulfill({status:session.state==='unavailable'?503:200,json:{state:session.state,userId:session.userId}});}
  if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto sintético'}]}});
  if(url.pathname==='/api/pieces'){
   if(request.method()==='GET')return route.fulfill({json:{versions}});
   const body=request.postDataJSON();calls.push({path:url.pathname,body});const version={piece_id:body.pieceId,version:body.expectedVersion+1,content:body.content};versions.push(version);return route.fulfill({json:{status:'saved',version}});
  }
  if(url.pathname==='/api/studio/chat'){
   const body=request.postDataJSON();calls.push({path:url.pathname,body});
   return route.fulfill({status:202,json:{status:'action_required',action:{name:'compor_novo_post',args:{projectId,requestId:id(80),revision:body.context.revision}},actionBinding:'synthetic-binding'}});
  }
  if(url.pathname==='/api/studio/action'){calls.push({path:url.pathname,body:request.postDataJSON()});return route.fulfill({json:{status:'completed',text:'Novo post preparado no navegador.'}});}
  if(url.pathname==='/api/studio/decision')return route.fulfill({json:{ok:true}});
  if(url.pathname.startsWith('/api/')){calls.push({path:url.pathname});return route.fulfill({status:500,json:{error:'unexpected_test_operation'}});}
  return route.continue();
 });
 return{page,origin,session,errors,external,calls};
}

test('Workspace entrega jornada local, marcações, moodboard e PNG retrato sem chamada paga', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,session,errors,external,calls}=await app(t);
 await page.goto(origin);await page.getByRole('button',{name:/Projeto sintético/}).click();
 await page.getByText('O que você quer divulgar?',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/compor-interview-options.png',fullPage:false});
 await page.getByRole('button',{name:'Escolher Aula curta',exact:true}).click();
 await page.getByRole('button',{name:'Escolher Pessoas interessadas em aprender',exact:true}).click();
 await page.getByRole('button',{name:'Escolher Pedir para conhecer',exact:true}).click();
 await page.getByRole('button',{name:'Seguir sem personalidade',exact:true}).click();
 for (const name of ['fatos','referências','preço','data']) await page.getByRole('button',{name:`Pular ${name}`,exact:true}).click();
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);
 await page.getByRole('button',{name:'Estúdio',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isDisabled(),true,'an unsaved post cannot be approved');
 await page.getByLabel('Título',{exact:true}).fill('Meu primeiro post sintético');
 await page.getByLabel('Legenda',{exact:true}).fill('Somente uma legenda de teste');
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();
 await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isEnabled(),true,'a saved clean version can be approved');
 await page.getByRole('button',{name:'Marcar elemento título',exact:true}).click();
 await page.getByLabel('O que deve mudar nesta seleção?',{exact:true}).fill('Destacar este título');
 await page.getByRole('button',{name:'Adicionar ao pedido',exact:true}).click();
 await page.getByRole('button',{name:'Marcar área',exact:true}).click();
 const frame=page.getByLabel('Arte do post em formato retrato',{exact:true});await frame.scrollIntoViewIfNeeded();const rect=await frame.boundingBox();
 await page.mouse.move(rect.x+40,rect.y+40);await page.mouse.down();await page.mouse.move(rect.x+140,rect.y+150,{steps:4});await page.mouse.up();
 await page.getByLabel('O que deve mudar nesta área?',{exact:true}).fill('Ajustar esta região');
 await page.getByRole('button',{name:'Adicionar ao pedido',exact:true}).click();
 await eventually(()=>stored(page),value=>value?.marks?.length===2);
 const markList=page.getByRole('region',{name:'Marcações deste post',exact:true});
 await markList.getByText('Destacar este título',{exact:true}).waitFor();
 await markList.getByText('Ajustar esta região',{exact:true}).waitFor();
 await markList.getByRole('button',{name:'Remover marcação 1',exact:true}).click();
 await eventually(()=>stored(page),value=>value?.marks?.length===1&&value.marks[0].kind==='area');
 assert.equal(await markList.getByText('Destacar este título',{exact:true}).count(),0);
 await page.screenshot({path:'/tmp/compor-studio-visual-marks.png',fullPage:true});
 await page.getByRole('button',{name:/^Bases/}).click();
 const files=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#2244aa';ctx.fillRect(0,0,128,128);return{png:c.toDataURL('image/png').split(',')[1],jpeg:c.toDataURL('image/jpeg').split(',')[1]};});
 await page.getByLabel('Adicionar PNG ou JPEG',{exact:true}).setInputFiles([{name:'reference.png',mimeType:'image/png',buffer:Buffer.from(files.png,'base64')},{name:'reference.jpg',mimeType:'image/jpeg',buffer:Buffer.from(files.jpeg,'base64')}]);
 await page.getByRole('img',{name:'reference.png',exact:true}).waitFor();await page.getByRole('img',{name:'reference.jpg',exact:true}).waitFor();
 await eventually(()=>stored(page),value=>value?.references?.length===2);
 await page.getByRole('button',{name:'Remover referência',exact:true}).first().click();
 await eventually(()=>stored(page),value=>value?.references?.length===1);
 await page.getByRole('button',{name:/Original antigo.*Versão 1/}).click();
 await page.getByLabel('Título',{exact:true}).fill('Alteração local da base antiga');
 assert.equal(await page.getByRole('button',{name:'Aprovar esta versão',exact:true}).isDisabled(),true,'editing a saved version requires saving before approval');
 await page.getByRole('button',{name:/^Bases/}).click();
 await page.getByRole('button',{name:/Atual existente.*Versão 2/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Atual existente');
 await page.getByRole('button',{name:/^Bases/}).click();
 await page.getByRole('button',{name:/Original antigo.*Versão 1/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Alteração local da base antiga');
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Inicie um novo post para outra ideia');
 await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByText('Novo post preparado no navegador.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'');
 await page.getByLabel('Título',{exact:true}).fill('Rascunho que permanece local');
 await page.getByLabel('Preço',{exact:true}).fill('R$ 15');await page.getByLabel('Data',{exact:true}).fill('20/11');
 await eventually(()=>stored(page),value=>value?.drafts?.some(d=>d.content.headline==='Rascunho que permanece local'));
 let release;session.hold=new Promise(resolve=>{release=resolve;});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByText('Verificando sua conta…',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('studio-auth-boundary').isVisible(),false);
 release();session.hold=null;
 await page.getByLabel('Título',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Rascunho que permanece local','same-account check keeps the active project mounted');
 await page.getByLabel('Sua mensagem',{exact:true}).fill('A chave ainda está nesta sessão');assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isEnabled(),true);await page.getByLabel('Sua mensagem',{exact:true}).fill('');
 const persisted=await stored(page);assert.equal(persisted.persona.audience,'Pessoas interessadas em aprender');assert.equal(persisted.messages.length,2);assert.equal(persisted.references[0].mime,'image/jpeg');
 const storageText=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);});const records=await new Promise(resolve=>{const r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return JSON.stringify([records,Object.entries(localStorage),Object.entries(sessionStorage)]);});
 assert.equal(storageText.includes(key),false);
 const conversation=page.getByRole('complementary',{name:'Conversa com a IA',exact:true});
 const chatBounds=await conversation.boundingBox(),composerBounds=await page.locator('form.studio-chat-composer').boundingBox();
 assert.ok(Math.abs(chatBounds.y+chatBounds.height-composerBounds.y-composerBounds.height)<=2,'the composer stays at the conversation bottom');
 const connectionButton=page.getByRole('button',{name:'IA conectada',exact:true});assert.ok((await connectionButton.boundingBox()).height>=40,'the connection action has the same minimum target size as other header actions');
 assert.equal(await page.locator('.studio-chat-header img').evaluate(element=>element.complete&&element.naturalWidth>0),true,'the Compor avatar asset is visible');
 await page.screenshot({path:'/tmp/compor-studio-visual-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'page itself must not overflow; board may scroll internally');
 const marca=await page.getByRole('button',{name:'Marca',exact:true}).boundingBox();assert.ok(marca.x>=0&&marca.x+marca.width<=390,'the Marca chip stays inside the mobile width');
 await page.screenshot({path:'/tmp/compor-studio-visual-mobile.png',fullPage:true});
 await page.getByLabel('Título',{exact:true}).scrollIntoViewIfNeeded();
 const mobileField=await page.getByLabel('Título',{exact:true}).boundingBox();assert.ok(mobileField.x>=0&&mobileField.x+mobileField.width<=390,'the mobile inspector remains readable within the screen');
 await page.screenshot({path:'/tmp/compor-studio-visual-mobile-inspector.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.reload();await page.getByRole('button',{name:/Projeto sintético/}).click();
 await page.getByLabel('Título',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Rascunho que permanece local');
 assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true,'key does not survive reload');
 await page.getByRole('button',{name:/^Bases/}).click();await page.getByRole('img',{name:'reference.jpg',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).click();
 await page.getByRole('img',{name:'Prévia da arte em 1080 por 1350 pixels',exact:true}).waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();const file=await(await download).path();const bytes=await readFile(file);
 assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);
 await page.getByLabel('Imagem-base PNG ou JPEG',{exact:true}).setInputFiles({name:'base.jpg',mimeType:'image/jpeg',buffer:Buffer.from(files.jpeg,'base64')});
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Baixar PNG',exact:true}).isDisabled(),true,'new base invalidates the earlier preview');
 assert.equal(calls.filter(call=>call.path==='/api/studio/chat').length,1);assert.equal(calls.filter(call=>call.path==='/api/studio/action').length,1);
 assert.equal(calls.some(call=>call.path.includes('/image')),false);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});

test('revalidação de identidade oculta a conta anterior e troca de conta limpa a chave', {skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,session,errors}=await app(t);await page.goto(origin);await page.getByRole('button',{name:/Projeto sintético/}).click();
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);
 let release;session.hold=new Promise(resolve=>{release=resolve;});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Verificando sua conta…',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('studio-auth-boundary').isVisible(),false);session.userId=bob;release();session.hold=null;
 await page.getByRole('button',{name:/Projeto sintético/}).click();await page.getByText('O que você quer divulgar?',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).inputValue(),'');
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);session.state='signed-out';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Entrar com Google',exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).count(),0);
 session.state='connected';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:/Projeto sintético/}).click();await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).inputValue(),'');
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(key);session.state='unavailable';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Login temporariamente indisponível.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).count(),0);
 assert.deepEqual(errors,['Failed to load resource: the server responded with a status of 503 (Service Unavailable)']);
});

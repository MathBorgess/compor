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
const userId=id(1),projectId=id(3),originalPiece=id(4),newPiece=id(11);
const apiKey=`sk-synthetic-${'x'.repeat(30)}`;
const content=headline=>({headline,price:'R$ 20',date:'20/11',caption:'Legenda sintética',captionOrigin:'user'});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
async function eventually(fn,predicate,timeout=6000){const until=Date.now()+timeout;for(;;){const value=await fn();if(predicate(value))return value;if(Date.now()>until)throw Error('estado esperado não observado');await new Promise(resolve=>setTimeout(resolve,25));}}
async function stored(page){return page.evaluate(async scope=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').get(JSON.stringify([scope.userId,scope.projectId]));r.onsuccess=()=>resolve(r.result?.state??null);r.onerror=()=>reject(r.error);});}finally{db.close();}},{userId,projectId});}
async function assetBytes(page,pieceId,version){return page.evaluate(async ({userId,projectId,pieceId,version})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const row=await new Promise((resolve,reject)=>{const key=JSON.stringify([JSON.stringify([userId,projectId]),pieceId,version,'base']);const r=db.transaction('draftAssets').objectStore('draftAssets').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return row?Array.from(new Uint8Array(await row.file.arrayBuffer())):null;}finally{db.close();}},{userId,projectId,pieceId,version});}
async function openDrawer(page,name){const panel=page.getByRole('dialog',{name,exact:true});if(!await panel.isVisible())await page.getByRole('button',{name:name==='Bases'?/^Bases \(\d+\)$/:name,exact:true}).click();await panel.waitFor();return panel;}
async function closeDrawer(page){await page.keyboard.press('Escape');await page.getByRole('dialog',{name:/^(Bases|Marca)$/}).waitFor({state:'hidden'});}
async function openEditor(page){const title=page.getByLabel('Título',{exact:true}),open=page.getByRole('button',{name:'Definir textos da arte',exact:true});await title.or(open).first().waitFor();if(await open.isVisible())await open.click();await title.waitFor();}
async function chooseFiles(page,label,files){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel(label,{exact:true}).click()]);await chooser.setFiles(files);}
async function app(t){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const recordStartup=chunk=>{const output=startup+chunk;startup=output.length>6000?output.slice(0,4500)+output.slice(-1500):output;};
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});child.stdout.on('data',recordStartup);child.stderr.on('data',recordStartup);
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,headers:sessionCookieHeaders(origin),nextApp:true,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);
 await page.context().addCookies([sessionCookie(origin)]);
 await page.addInitScript(()=>{const tools=Object.create(null);Object.defineProperty(window,'__studioNative',{value:tools});Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(definition,{signal}={})=>{tools[definition.name]=definition;signal?.addEventListener('abort',()=>{if(tools[definition.name]===definition)delete tools[definition.name];},{once:true});}}});});
 const calls=[],external=[],errors=[],flow={},projectReads={count:0};const projects=[{id:projectId,title:'Projeto integrado',revision:1}],versions=[{project_id:projectId,piece_id:originalPiece,version:1,content:content('Original preservado')}];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/session')return route.fulfill({json:{state:'connected',userId}});
  if (url.pathname === '/api/studio/explorations/signals') return route.fulfill({json:{signals:[]}});
  if (url.pathname === '/api/studio/explorations/status') return route.fulfill({json:{status:'active'}});
  if (url.pathname === '/api/studio/references/signals') {
   assert.deepEqual(request.postDataJSON(), {projectId, scope:'account'});
   return route.fulfill({json:{signals:[]}});
  }
    if(url.pathname==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(url.pathname==='/api/projects'){
   if(request.method()==='GET'){projectReads.count++;return route.fulfill({json:{projects}});}
   assert.equal(request.method(),'PATCH');const body=request.postDataJSON();calls.push({path:url.pathname,body});const index=projects.findIndex(project=>project.id===body.projectId),previous=projects[index];
   if(!previous||body.expectedRevision!==previous.revision)return route.fulfill({status:409,json:{error:'revision_conflict'}});
   const project={...previous,title:body.title,revision:previous.revision+1};projects[index]=project;return route.fulfill({json:{status:'renamed',project}});
  }
  if(url.pathname==='/api/pieces'){
   if(request.method()==='GET')return route.fulfill({json:{versions:versions.filter(version=>version.project_id===url.searchParams.get('projectId'))}});
   const body=request.postDataJSON();calls.push({path:url.pathname,body});const version={project_id:projectId,piece_id:body.pieceId,version:body.expectedVersion+1,content:body.content};versions.push(version);return route.fulfill({json:{status:'saved',version}});
  }
  if(url.pathname==='/api/studio/chat'||url.pathname==='/api/studio/action'){
   const body=request.postDataJSON();calls.push({path:url.pathname,body});const handler=url.pathname.endsWith('/chat')?flow.chat:flow.action;
   if(!handler)throw Error(`chamada inesperada ${url.pathname}`);return route.fulfill({status:202,json:await handler(body)});
  }
  if(url.pathname==='/api/agent/image'){const body=request.postDataJSON();calls.push({path:url.pathname,body});return route.fulfill({json:{status:'accepted',assetId:id(90)}});}
  if(url.pathname==='/api/images'){calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams)});return route.fulfill({contentType:'image/png',body:png});}
  if(url.pathname==='/api/image-assets')return route.fulfill({json:{assets:[],nextCursor:null}});
  if(url.pathname.startsWith('/api/'))throw Error(`API inesperada ${url.pathname}`);
  return route.continue();
 });
 return {page,origin,calls,projects,projectReads,versions,flow,errors,external};
}
async function openOriginal(page,origin,{key=true}={}){
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();await openDrawer(page,'Bases');await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();
 if(key){await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Estúdio',exact:true}).click();}
 await page.getByLabel('Título',{exact:true}).waitFor();
}
async function attachImage(page,{mime='image/jpeg',name='source.jpg',buffer}={}){
 if(!buffer)buffer=Buffer.from(await page.evaluate(mime=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;const context=canvas.getContext('2d');context.fillStyle='#2244aa';context.fillRect(0,0,96,128);return canvas.toDataURL(mime).split(',')[1];},mime),'base64');
 await chooseFiles(page,'Imagem-base PNG ou JPEG',{name,mimeType:mime,buffer});
 try{await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();}catch(error){throw Error(`${error.message}\nUpload: ${JSON.stringify({mime,size:buffer.length,alerts:await page.getByRole('alert').allTextContents(),selection:(await stored(page))?.selection})}`,{cause:error});}
 return buffer;
}
const action=(name,args,binding)=>({status:'action_required',action:{name,args},actionBinding:binding});
const consent=(suffix='one')=>({status:'consent_required',attemptId:id(80),prompt:`Proposta sintética ${suffix}`,proposal:{prompt:`Proposta sintética ${suffix}`,operation:'create',baseImageId:null,referenceIds:[]},actionBinding:`image-binding-${suffix}`,declineBinding:`decline-binding-${suffix}`});

test('chat cria e salva versões com confirmação; imagem usa snapshot novo automaticamente',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,calls,versions,flow,errors,external}=await app(t);let submits=0;
 flow.chat=body=>body.op==='poll'?{status:'completed',text:'Imagem integrada concluída.'}:++submits===1?action('compor_novo_post',{projectId,requestId:newPiece,revision:body.context.revision},'new'):consent('decline');
 flow.action=body=>{
  const scope={projectId,revision:body.result.revision};
  switch(body.actionBinding){
   case 'new':return action('compor_editar_peca',{...scope,requestId:id(12),pieceId:newPiece,baseVersion:0,field:'headline',value:'Título novo inicial'},'edit-one');
   case 'edit-one':return action('compor_salvar_versao',{...scope,requestId:id(13),pieceId:newPiece,baseVersion:0,expectedLatestVersion:0},'save-one');
   case 'save-one':return action('compor_editar_peca',{...scope,requestId:id(14),pieceId:newPiece,baseVersion:1,field:'headline',value:'Título novo refinado'},'edit-two');
   case 'edit-two':return action('compor_salvar_versao',{...scope,requestId:id(15),pieceId:newPiece,baseVersion:1,expectedLatestVersion:1},'save-two');
   case 'save-two':return consent();
   case 'decline-binding-decline':return {status:'completed',text:'Proposta recusada sem gerar outra imagem.'};
   default:throw Error('resultado inesperado');
  }
 };
 await openOriginal(page,origin);await page.getByLabel('Sua mensagem',{exact:true}).fill('Crie outro post, refine e salve antes de propor a imagem.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 try{await page.getByRole('dialog',{name:'Confirmar alteração no projeto?'}).waitFor();}catch(error){throw Error(`${error.message}\nUI: ${await page.locator('body').innerText()}\nAções: ${JSON.stringify(calls.map(call=>({path:call.path,binding:call.body?.actionBinding,result:call.body?.result})))}`,{cause:error});}assert.equal(calls.filter(call=>call.path==='/api/pieces').length,0,'primeiro salvamento espera confirmação explícita');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await eventually(()=>page.getByLabel('Título',{exact:true}).inputValue(),value=>value==='Título novo refinado');await page.getByRole('dialog',{name:'Confirmar alteração no projeto?'}).waitFor();assert.equal(calls.filter(call=>call.path==='/api/pieces').length,1,'segunda versão também espera confirmação');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByText('Imagem integrada concluída.',{exact:true}).waitFor();
 await page.getByText('Imagem gerada e adicionada a este post · versão 3.',{exact:true}).waitFor();await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 const generated=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generated.length,1);assert.deepEqual(generated[0].body,{projectId,pieceId:newPiece,version:3,attemptId:id(80),actionBinding:'image-binding-one',explicitApproval:true,artworkInput:{literalText:{headline:'Título novo refinado',price:'',date:''},source:null,images:[]},apiKey});
 const fetched=calls.find(call=>call.path==='/api/images');assert.equal(fetched.query.pieceId,newPiece);assert.equal(fetched.query.version,'3');assert.equal(calls.filter(call=>call.path==='/api/pieces').length,3,'confirmar a geração preserva a origem e prepara uma versão nova');assert.equal(versions[0].content.headline,'Original preservado');
 const persisted=await eventually(()=>stored(page),value=>value?.selection?.baseVersion===3&&value?.actionReceipts?.length===5);assert.equal(persisted.selection.pieceId,newPiece);assert.equal(persisted.adjustments[0].context.pieceId,originalPiece,'snapshot inicial permanece histórico e não determina o destino da imagem');assert.equal(persisted.adjustments[0].context.baseVersion,1);
 assert.equal(JSON.stringify(await stored(page)).includes(apiKey),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('efeito WebMCP persistido não se repete após refresh e recriação do executor sem chave',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,errors}=await app(t);await openOriginal(page,origin,{key:false});
 await page.waitForFunction(()=>typeof window.__studioNative?.compor_editar_briefing?.execute==='function');
 const before=await eventually(()=>stored(page),value=>value?.selection?.pieceId===originalPiece),args={projectId,requestId:id(70),revision:before.revision,field:'offer',value:'Oferta registrada uma única vez'};
 const first=await page.evaluate(args=>window.__studioNative.compor_editar_briefing.execute(args),args);assert.equal(first.status,'completed');const persisted=await eventually(()=>stored(page),value=>value?.actionReceipts?.some(receipt=>receipt.requestId===id(70)&&receipt.result.status==='completed'));assert.equal(persisted.brief.offer,args.value);
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await page.getByLabel('Título',{exact:true}).waitFor();await page.waitForFunction(()=>typeof window.__studioNative?.compor_editar_briefing?.execute==='function');assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true,'a chave não sobrevive ao refresh e não é requisito do WebMCP local');
 const restored=await stored(page),repeated=await page.evaluate(args=>window.__studioNative.compor_editar_briefing.execute(args),args);assert.equal(repeated.status,'completed');assert.equal(repeated.revision,restored.revision);assert.deepEqual(await stored(page),restored,'nem o efeito nem o recibo são gravados novamente');assert.equal(restored.actionReceipts.length,1);
 const conflict=await page.evaluate(async args=>{try{await window.__studioNative.compor_editar_briefing.execute({...args,value:'Oferta trocada'});return null;}catch(error){return error.message;}},args);assert.equal(conflict,'action_conflict');assert.deepEqual(await stored(page),restored);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('proposta de imagem mantém a origem quando a pessoa troca de post enquanto a resposta está em andamento',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,versions,flow,errors,external}=await app(t);
 versions.push({project_id:projectId,piece_id:newPiece,version:2,content:content('Post B fora do pedido')});
 let release,entered,submitted;
 const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;}),starting=new Promise(resolve=>{submitted=resolve;});
 flow.chat=async body=>{
  if(body.op!=='poll'){submitted();return{status:'running'};}
  if(calls.some(call=>call.path==='/api/agent/image'))return{status:'completed',text:'Imagem preservada na origem.'};
  entered();await gate;return consent('origin');
 };
 await openOriginal(page,origin);
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Proponha uma imagem para este post original.');
 await page.getByRole('button',{name:'Enviar →',exact:true}).click();await starting;
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Post B fora do pedido.*Versão 2/}).click();
 await waiting;release();
 const proposal=page.locator('.studio-image-consent');await proposal.waitFor();
 assert.match(await proposal.innerText(),/Original preservado · versão 1/,'a proposta identifica a origem capturada, sem adotar a seleção feita durante a espera');
 await page.waitForLoadState('networkidle');
 assert.equal(calls.filter(call=>call.path==='/api/agent/image').length,0,'a seleção B não pode receber a geração pedida em A');
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();
 await page.getByRole('button',{name:'Consultar a mesma proposta',exact:true}).click();
 await page.getByText('Imagem preservada na origem.',{exact:true}).waitFor();
 await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 const generated=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generated.length,1);assert.equal(generated[0].body.pieceId,originalPiece);assert.equal(generated[0].body.version,2);assert.equal(versions.find(version=>version.piece_id===originalPiece&&version.version===1).content.headline,'Original preservado');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('download pendente não exporta a arte no post aberto depois',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,calls,errors}=await app(t);
 versions.push({project_id:projectId,piece_id:newPiece,version:2,content:content('Post B preservado')});
 await openOriginal(page,origin,{key:false});
 await attachImage(page);
 await page.evaluate(()=>{
  const original=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.__releasePreviewEncoding=()=>original.call(this,blob=>{callback(blob);window.__previewEncodingDone=true;},...args);};
 });
 const downloads=[];page.on('download',file=>downloads.push(file));
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releasePreviewEncoding==='function');
 await page.getByRole('button',{name:'Estúdio',exact:true}).click();
 await openDrawer(page,'Bases');
 await page.getByRole('button',{name:/Post B preservado.*Versão 2/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Post B preservado');
 await page.evaluate(()=>window.__releasePreviewEncoding());
 await page.waitForFunction(()=>window.__previewEncodingDone===true);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByRole('heading',{name:'Revise seu post',exact:true}).count(),0,'a prévia da instância desmontada não muda a navegação nem se associa a B');
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Post B preservado');
 assert.equal(downloads.length,0);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('trocar a imagem durante a codificação descarta a prévia anterior e conserva a nova arte',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,errors}=await app(t);await openOriginal(page,origin,{key:false});
 await attachImage(page);
 await page.evaluate(()=>{
  const original=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.__releasePreviewEncoding=()=>original.call(this,blob=>{callback(blob);window.__previewEncodingDone=true;},...args);};
 });
 const downloads=[];page.on('download',file=>downloads.push(file));
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releasePreviewEncoding==='function');
 await page.getByRole('button',{name:'Pedir ajuste no estúdio',exact:true}).click();
 await attachImage(page,{mime:'image/png',name:'replacement.png',buffer:png});
 await page.evaluate(()=>window.__releasePreviewEncoding());
 await page.waitForFunction(()=>window.__previewEncodingDone===true);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByRole('heading',{name:'Revise seu post',exact:true}).count(),0,'a imagem substituída não se torna a prévia da arte atual');
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
 assert.equal(downloads.length,0,'a preparação antiga não inicia o download depois da troca');
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Baixar PNG',exact:true}).isEnabled(),true);
 assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('leitura antiga de versões não remove do histórico uma versão salva durante a espera',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,calls,errors}=await app(t);let release,entered,first=true;
 const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});
 await page.route('**/api/pieces?*',async route=>{
  if(route.request().method()!=='GET')return route.fallback();
  if(first){first=false;const captured=structuredClone(versions);entered();await gate;return route.fulfill({headers:{'x-compor-old-read':'true'},json:{versions:captured}});}
  return route.fulfill({json:{versions}});
 });
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await waiting;
 await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Post criado durante a leitura anterior');
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 await openDrawer(page,'Bases');
 const saved=page.getByRole('button',{name:/Post criado durante a leitura anterior.*Versão 1/});await saved.waitFor();
 const oldRead=page.waitForResponse(response=>response.headers()['x-compor-old-read']==='true');release();await oldRead;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await saved.count(),1,'a resposta anterior ao salvamento não substitui a versão que já foi confirmada');
 await saved.click();assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Post criado durante a leitura anterior');
 assert.equal(calls.filter(call=>call.path==='/api/pieces').length,1);assert.deepEqual(errors,[]);
});

test('a conversa gera a arte integral de um rascunho sem exigir salvamento prévio',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,versions,flow,errors,external}=await app(t);
 flow.chat=body=>body.op==='poll'?{status:'completed',text:'Primeira arte pronta.'}:consent('draft');
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);
 assert.equal(await page.getByLabel('Preço',{exact:true}).count(),0);assert.equal(await page.getByLabel('Data',{exact:true}).count(),0);
 await page.getByLabel('Título',{exact:true}).fill('Curso de planilhas');await page.getByText('Adicionar outras informações',{exact:true}).click();await page.getByRole('button',{name:'Adicionar preço',exact:true}).click();await page.getByRole('button',{name:'Adicionar data',exact:true}).click();await page.getByLabel('Preço',{exact:true}).fill('R$ 49');await page.getByLabel('Data',{exact:true}).fill('12/12');
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Continuar',exact:true}).click();
 const before=await eventually(()=>stored(page),state=>state?.drafts?.some(draft=>draft.content.headline==='Curso de planilhas'));assert.equal(before.selection.baseVersion,0);
 await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Gere o post completo com esses textos.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByText('Primeira arte pronta.',{exact:true}).waitFor();await page.getByText('Imagem gerada e adicionada a este post · versão 1.',{exact:true}).waitFor();
 const generation=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generation.length,1);assert.equal(generation[0].body.pieceId,before.selection.pieceId);assert.equal(generation[0].body.version,1);assert.deepEqual(generation[0].body.artworkInput,{literalText:{headline:'Curso de planilhas',price:'R$ 49',date:'12/12'},source:null,images:[]});
 assert.equal(calls.filter(call=>call.path==='/api/pieces').length,1);assert.equal(versions.find(version=>version.piece_id===before.selection.pieceId).content.caption,'');
 const after=await eventually(()=>stored(page),state=>state?.selection?.baseVersion===1);assert.equal(after.selection.pieceId,before.selection.pieceId);assert.equal(JSON.stringify(after).includes(apiKey),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('edição envia os bytes aprovados da origem e referência e preserva a imagem anterior',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,flow,errors,external}=await app(t);let referenceId;
 flow.chat=body=>{
  if(body.op==='poll')return{status:'completed',text:'Nova arte editada.'};
  referenceId=body.context.references[0].id;
  return{...consent('edit'),proposal:{prompt:'Mude a paleta seguindo a referência, mantendo os textos.',operation:'edit',baseImageId:originalPiece,referenceIds:[referenceId]}};
 };
 await openOriginal(page,origin);
 const source=await attachImage(page,{mime:'image/png',name:'original.png'});
 await openDrawer(page,'Bases');await chooseFiles(page,'Adicionar PNG ou JPEG',{name:'reference.png',mimeType:'image/png',buffer:png});await page.getByRole('img',{name:'reference.png',exact:true}).waitFor();await closeDrawer(page);
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Ajuste esta arte usando minha referência.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByText('Nova arte editada.',{exact:true}).waitFor();await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();
 const generation=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generation.length,1);assert.equal(generation[0].body.version,2);assert.deepEqual(generation[0].body.artworkInput,{literalText:{headline:'Original preservado',price:'R$ 20',date:'20/11'},source:{pieceId:originalPiece,version:1},images:[{id:originalPiece,role:'base',mime:'image/png',data:source.toString('base64')},{id:referenceId,role:'reference',mime:'image/png',data:png.toString('base64')}]});
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
 await openDrawer(page,'Bases');await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===96);
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===96);
 await openDrawer(page,'Bases');await page.getByRole('button',{name:/Original preservado.*Versão 2/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
 assert.equal(calls.filter(call=>call.path==='/api/agent/image').length,1,'reabrir versões e recarregar não regenera a imagem');assert.equal(JSON.stringify(await stored(page)).includes(apiKey),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('critério proposto mostra contraste e tensão, e só o criador registra uma decisão persistida',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,errors}=await app(t);await openOriginal(page,origin,{key:false});
 await page.waitForFunction(()=>typeof window.__studioNative?.compor_propor_criterio?.execute==='function');
 const state=await stored(page),args={projectId,requestId:id(170),revision:state.revision,viewpoint:'recipient',dimension:'message',statement:'Convidativo sem pressionar',example:'Conheça a oficina e veja se combina com você.',counterexample:'Compre agora ou fique para trás.',exampleReferenceId:'',counterexampleReferenceId:'',provenance:'hypothesis',source:'',tension:'O criador prefere urgência; a persona pode precisar de contexto.'};
 const result=await page.evaluate(args=>window.__studioNative.compor_propor_criterio.execute(args),args);assert.equal(result.status,'completed');
 await page.getByRole('heading',{name:'Uma direção com significado',exact:true}).waitFor();
 await page.getByText(args.example,{exact:true}).waitFor();await page.getByText(args.counterexample,{exact:true}).waitFor();
 assert.match(await page.locator('.direction-tension').innerText(),/O criador prefere urgência/);
 const proposed=await eventually(()=>stored(page),value=>value?.direction.criteria.length===1);assert.equal(proposed.direction.decisions.length,0);assert.equal(proposed.direction.criteria[0].provenance,'hypothesis');
 await page.getByRole('button',{name:'Usar este critério',exact:true}).click();
 const chosen=await eventually(()=>stored(page),value=>value?.direction.decisions.length===1);assert.equal(chosen.direction.decisions[0].choice,'accept');assert.equal(chosen.direction.criteria[0].provenance,'hypothesis','decisão criativa não inventa evidência de público');
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await openDrawer(page,'Marca');
 await page.getByRole('button',{name:'Usar este critério',exact:true,pressed:true}).waitFor();
 await page.getByRole('button',{name:'Reabrir decisão',exact:true}).click();
 const reopened=await eventually(()=>stored(page),value=>value?.direction.decisions.length===2);assert.deepEqual(reopened.direction.decisions.map(decision=>decision.choice),['accept','reopen']);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('nome confirmado pelo chat permanece no menu e a segunda renomeação usa a revisão atual após trocar de projeto',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,projects,projectReads,flow,errors,external}=await app(t);
 const renamed='Nome confirmado pelo chat',finalName='Nome final do projeto',otherTitle='Outro projeto';
 projects.push({id:id(190),title:otherTitle,revision:7});
 flow.chat=body=>action('compor_renomear_projeto',{projectId,requestId:id(191),revision:body.context.revision,title:renamed},'rename-first');
 flow.action=body=>{assert.equal(body.actionBinding,'rename-first');assert.equal(body.result.status,'completed');return{status:'completed',text:'Primeiro nome confirmado.'};};
 const trigger=title=>page.getByRole('heading',{level:1}).getByRole('button',{name:title,exact:true});
 await openOriginal(page,origin);
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Renomeie este projeto com o título confirmado.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByRole('dialog',{name:'Confirmar alteração no projeto?',exact:true}).waitFor();
 assert.equal(calls.filter(call=>call.path==='/api/projects').length,0,'o chat aguarda confirmação antes da renomeação persistida');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByText('Primeiro nome confirmado.',{exact:true}).waitFor();
 await trigger(renamed).waitFor();const readsBeforeSwitch=projectReads.count;
 await trigger(renamed).click();const menu=page.getByRole('dialog',{name:'Projetos',exact:true});
 assert.equal(await menu.getByRole('button',{name:renamed,exact:true}).count(),1,'a lista do menu recebe o título confirmado pelo agente');
 assert.equal(await menu.getByRole('button',{name:'Projeto integrado',exact:true}).count(),0);
 await menu.getByRole('button',{name:otherTitle,exact:true}).click();await trigger(otherTitle).waitFor();
 await trigger(otherTitle).click();await menu.getByRole('button',{name:renamed,exact:true}).click();await trigger(renamed).waitFor();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Original preservado','voltar pelo menu reabre a seleção do projeto original');
 await trigger(renamed).click();await menu.getByLabel('Renomear',{exact:true}).fill(finalName);await menu.getByRole('button',{name:'Salvar nome',exact:true}).click();await trigger(finalName).waitFor();
 assert.equal(projectReads.count,readsBeforeSwitch,'a troca usa a lista atualizada em memória, sem depender de refetch para corrigir o título ou a revisão');
 assert.deepEqual(calls.filter(call=>call.path==='/api/projects').map(call=>call.body),[
  {projectId,title:renamed,expectedRevision:1},
  {projectId,title:finalName,expectedRevision:2},
 ]);
 await trigger(finalName).click();assert.equal(await menu.getByRole('button',{name:finalName,exact:true}).count(),1);assert.equal(await menu.getByRole('button',{name:renamed,exact:true}).count(),0);
 assert.equal(projects.find(project=>project.id===projectId).revision,3);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('formato real da versão salva é aceito pelo estúdio',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,errors}=await app(t);
 await page.route('**/api/pieces',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const body=route.request().postDataJSON();
  const version={project_id:projectId,piece_id:body.pieceId,version:1,content:body.content,created_at:'2026-11-06T12:00:00.000Z',metadata:{baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}};
  versions.push(version);return route.fulfill({json:{status:'saved',version}});
 });
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Conteúdo persistido');
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 const state=await eventually(()=>stored(page),s=>s?.selection?.baseVersion===1);assert.equal(state.drafts.find(d=>d.baseVersion===1).content.headline,'Conteúdo persistido');assert.deepEqual(errors,[]);
});

test('409 recupera versão idêntica e imagem-base sem perder edição durante consulta',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,calls,errors,flow}=await app(t);let release,entered;
 const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Conteúdo já salvo');
 const image=await attachImage(page,{mime:'image/png',name:'original.png'});
 const before=await eventually(()=>stored(page),s=>s?.drafts?.some(d=>d.content.headline==='Conteúdo já salvo'));const draft=before.drafts.find(d=>d.pieceId===before.selection.pieceId&&d.baseVersion===0);
 versions.push({project_id:projectId,piece_id:draft.pieceId,version:1,content:draft.content,created_at:'2026-11-06T12:00:00.000Z',metadata:{baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}});
 await page.route('**/api/pieces?*',async route=>{entered();await gate;return route.fulfill({json:{versions}});});
 await page.route('**/api/pieces',async route=>route.request().method()==='POST'?route.fulfill({status:409,json:{status:'conflict',currentVersion:1}}):route.fallback());
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await waiting;await page.getByLabel('Título',{exact:true}).fill('Edição posterior preservada');release();
 await page.getByText('Recuperamos a versão que já havia sido salva. Seu rascunho foi preservado; solicite a geração novamente.',{exact:true}).waitFor();
 const after=await eventually(()=>stored(page),s=>s?.selection?.baseVersion===1);const recovered=after.drafts.find(d=>d.baseVersion===1&&d.pieceId===draft.pieceId);assert.equal(recovered.content.headline,'Edição posterior preservada');assert.equal(recovered.dirty,true);assert.equal(versions.find(v=>v.piece_id===draft.pieceId).content.headline,'Conteúdo já salvo');
 assert.deepEqual(Buffer.from(await assetBytes(page,draft.pieceId,1)),image,'a versão recuperada recebe os bytes da imagem-base original');
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await page.getByRole('button',{name:'Revisar post',exact:true}).click();await page.getByRole('img',{name:'Prévia da arte integral, sem textos adicionados pelo aplicativo',exact:true}).waitFor();assert.deepEqual(Buffer.from(await assetBytes(page,draft.pieceId,1)),image);
 assert.equal(calls.filter(c=>c.path==='/api/agent/image').length,0);
 // A subsequent simulated edit must transport the recovered bytes, not just
 // show a cached preview from the previous selection.
 await page.unroute('**/api/pieces');
 flow.chat=body=>body.op==='poll'?{status:'completed',text:'Arte recuperada editada.'}:{...consent('recovered'),proposal:{prompt:'Ajuste a arte preservada.',operation:'edit',baseImageId:draft.pieceId,referenceIds:[]}};
 await page.getByRole('button',{name:'Pedir ajuste no estúdio',exact:true}).click();
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Estúdio',exact:true}).click();
 await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();await page.getByLabel('Sua mensagem',{exact:true}).fill('Ajuste esta arte.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByText('Arte recuperada editada.',{exact:true}).waitFor();
 const generation=calls.filter(c=>c.path==='/api/agent/image');assert.equal(generation.length,1);assert.deepEqual(generation[0].body.artworkInput.source,{pieceId:draft.pieceId,version:1});assert.equal(generation[0].body.artworkInput.images[0].data,image.toString('base64'));assert.deepEqual(errors,[]);
});

test('409 divergente preserva rascunho e exige revisão do histórico',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,errors}=await app(t);await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Minha edição');
 const before=await eventually(()=>stored(page),s=>s?.drafts?.some(d=>d.content.headline==='Minha edição'));const draft=before.drafts.find(d=>d.pieceId===before.selection.pieceId&&d.baseVersion===0);
 versions.push({project_id:projectId,piece_id:draft.pieceId,version:1,content:{...draft.content,headline:'Outra edição'},created_at:'2026-11-06T12:00:00.000Z',metadata:{baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}});
 await page.route('**/api/pieces',async route=>route.request().method()==='POST'?route.fulfill({status:409,json:{status:'conflict',currentVersion:1}}):route.fallback());
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await page.getByText('Outra versão foi salva. Seu rascunho foi preservado; consulte o histórico antes de continuar.',{exact:true}).waitFor();
 const after=await stored(page);assert.equal(after.selection.baseVersion,0);assert.equal(after.drafts.find(d=>d.pieceId===draft.pieceId&&d.baseVersion===0).content.headline,'Minha edição');assert.deepEqual(errors,[]);
});

test('falha ao copiar imagem para versão recuperada não troca a seleção nem perde a origem',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,errors}=await app(t);await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);await page.getByLabel('Título',{exact:true}).fill('Arte preservada');
 const image=await attachImage(page,{mime:'image/png',name:'original.png'});
 const before=await eventually(()=>stored(page),s=>s?.drafts?.some(d=>d.content.headline==='Arte preservada'));const draft=before.drafts.find(d=>d.pieceId===before.selection.pieceId&&d.baseVersion===0);
 versions.push({project_id:projectId,piece_id:draft.pieceId,version:1,content:draft.content,created_at:'2026-11-06T12:00:00.000Z',metadata:{baseVersion:null,revision:0,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null}}});
 await page.route('**/api/pieces',async route=>route.request().method()==='POST'?route.fulfill({status:409,json:{status:'conflict',currentVersion:1}}):route.fallback());
 await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='draftAssets')throw new DOMException('synthetic quota','QuotaExceededError');return add.apply(this,args);};});
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await page.getByText('O resultado do salvamento é desconhecido. Seu rascunho continua nesta aba; consulte as versões antes de repetir.',{exact:true}).waitFor();
 assert.equal((await stored(page)).selection.baseVersion,0);assert.deepEqual(Buffer.from(await assetBytes(page,draft.pieceId,0)),image);assert.equal(await assetBytes(page,draft.pieceId,1),null);assert.deepEqual(errors,[]);
});

test('campo sugerido pela IA é preenchido pela pessoa, salvo e incluído na geração',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,versions,flow,errors}=await app(t);
 flow.chat=body=>body.op==='poll'?{status:'completed',text:'Arte com local pronta.'}:consent('custom-field');
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await openEditor(page);
 await page.waitForFunction(()=>typeof window.__studioNative?.compor_adicionar_campo?.execute==='function');
 const before=await eventually(()=>stored(page),state=>state?.selection?.baseVersion===0),fieldId=id(75);
 const args={projectId,requestId:fieldId,revision:before.revision,pieceId:before.selection.pieceId,baseVersion:0,label:'Local'};
 const result=await eventually(()=>page.evaluate(async args=>{try{return await window.__studioNative.compor_adicionar_campo.execute(args);}catch(error){if(error.message!=='action_unavailable')throw error;return null;}},args),value=>value?.status==='completed');assert.equal(result.status,'completed');
 assert.equal(await page.getByLabel('Local',{exact:true}).inputValue(),'','sugestão não inventa um valor');
 await page.getByLabel('Local',{exact:true}).fill('Ateliê central');
 await eventually(()=>stored(page),state=>state?.drafts?.some(draft=>draft.content.fields?.[0]?.value==='Ateliê central'));
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();await page.getByLabel('Sua mensagem',{exact:true}).fill('Gere o post com o local informado.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByText('Arte com local pronta.',{exact:true}).waitFor();await page.getByText('Imagem gerada e adicionada a este post · versão 1.',{exact:true}).waitFor();
 const field={id:fieldId,label:'Local',value:'Ateliê central',origin:'user'};
 assert.deepEqual(versions.find(version=>version.piece_id===before.selection.pieceId).content.fields,[field]);
 assert.deepEqual(calls.find(call=>call.path==='/api/agent/image').body.artworkInput.literalText.fields,[field]);
 assert.deepEqual(errors,[]);
});

test('escolher mais referências preserva post e conversa e cada escolha inicia um único turno',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,versions,flow,errors}=await app(t);
 const reference={id:'pin33',title:'Referência adicional',board:'behance/typography',originUrl:'https://www.pinterest.com/pin/pin33/',previewUrl:'https://i.pinimg.com/236x/pin33.png'};
 const selected=[],selectionTurns=[];
 await page.route('https://i.pinimg.com/**',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.route('**/api/studio/references/history',route=>route.fulfill({json:{references:[]}}));
 await page.route('**/api/studio/references/search',route=>route.fulfill({json:{status:'ok',references:[reference]}}));
 await page.route('**/api/studio/references/preview',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.route('**/api/studio/references/signals',route=>{
  const body=route.request().postDataJSON();if(!body.action)return route.fulfill({json:{signals:[]}});
  selected.push(body);return route.fulfill({status:201,json:{signal:{...body,createdAt:'2026-11-09T12:00:00.000Z'}}});
 });
 await page.route(url=>url.pathname==='/api/studio/explorations'&&url.origin===origin,route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
  const body=route.request().postDataJSON();return route.fulfill({status:202,json:{status:'unknown',requestId:body.requestId}});
 });
 flow.chat=body=>{
  if(body.op==='reference_selection'){selectionTurns.push(body);return {status:'completed',text:'Leitura editorial.\n\n**Recomendação:** Usar contraste.\n\nPosso seguir com contraste?'};}
  return {status:'completed',text:'Contexto preservado na conversa.'};
 };
 await openOriginal(page,origin);await attachImage(page);
 await page.getByLabel(/^Legenda/).fill('Legenda preservada ao procurar referências.');
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Quero comunicar uma oficina');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByText('Contexto preservado na conversa.',{exact:true}).waitFor();
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Rascunho de conversa não enviado');
 const before=await eventually(()=>stored(page),state=>state?.drafts.some(draft=>draft.content.caption==='Legenda preservada ao procurar referências.'));
 const originalVersions=structuredClone(versions);
 await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();
 await page.getByRole('heading',{name:'Referências para sua ideia',exact:true}).waitFor();
 await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Original preservado');
 assert.equal(await page.getByLabel(/^Legenda/).inputValue(),'Legenda preservada ao procurar referências.');
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===96);
 assert.equal(await page.getByLabel('Sua mensagem',{exact:true}).inputValue(),'Rascunho de conversa não enviado');
 assert.deepEqual(await stored(page),before);assert.deepEqual(versions,originalVersions);
 await page.getByLabel('Sua mensagem',{exact:true}).fill('');
 await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();
 await page.getByRole('button',{name:'Permitir nesta sessão'}).click();
 await page.getByRole('button',{name:'Usar como referência: Referência adicional'}).click();
 await page.getByText('Posso seguir com contraste?',{exact:true}).waitFor({timeout:15000});
 assert.equal(selected.length,1);assert.equal(selectionTurns.length,1);assert.equal(selected[0].action,'selected');
 await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();
 await page.getByRole('button',{name:'Selecionada: Referência adicional'}).waitFor();
 assert.equal(selected.length,1);assert.equal(selectionTurns.length,1,'reabrir a seleção não repete a iniciativa');
 await openDrawer(page,'Bases');await page.getByRole('button',{name:'Remover referência',exact:true}).click();await closeDrawer(page);
 await page.getByRole('button',{name:'Usar como referência: Referência adicional'}).click();
 await eventually(()=>selectionTurns.length,count=>count===2,15000);
 assert.equal(selected.length,2);assert.notEqual(selected[0].id,selected[1].id);
 assert.deepEqual(errors,[]);
});

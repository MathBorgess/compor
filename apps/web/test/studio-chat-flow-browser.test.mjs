import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(3),originalPiece=id(4),newPiece=id(11);
const apiKey=`sk-synthetic-${'x'.repeat(30)}`;
const content=headline=>({headline,price:'R$ 20',date:'20/11',caption:'Legenda sintética',captionOrigin:'user'});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
async function eventually(fn,predicate,timeout=6000){const until=Date.now()+timeout;for(;;){const value=await fn();if(predicate(value))return value;if(Date.now()>until)throw Error('estado esperado não observado');await new Promise(resolve=>setTimeout(resolve,25));}}
async function stored(page){return page.evaluate(async scope=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').get(JSON.stringify([scope.userId,scope.projectId]));r.onsuccess=()=>resolve(r.result?.state??null);r.onerror=()=>reject(r.error);});}finally{db.close();}},{userId,projectId});}
async function app(t){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const recordStartup=chunk=>{const output=startup+chunk;startup=output.length>6000?output.slice(0,4500)+output.slice(-1500):output;};
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin,COMPOR_STUDIO_WEB_ENABLED:'true'}});child.stdout.on('data',recordStartup);child.stderr.on('data',recordStartup);
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);
 await page.addInitScript(()=>{const tools=Object.create(null);Object.defineProperty(window,'__studioNative',{value:tools});Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async(definition,{signal}={})=>{tools[definition.name]=definition;signal?.addEventListener('abort',()=>{if(tools[definition.name]===definition)delete tools[definition.name];},{once:true});}}});});
 const calls=[],external=[],errors=[],flow={};const versions=[{project_id:projectId,piece_id:originalPiece,version:1,content:content('Original preservado')}];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/session')return route.fulfill({json:{state:'connected',userId}});
  if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto integrado',revision:1}]}});
  if(url.pathname==='/api/pieces'){
   if(request.method()==='GET')return route.fulfill({json:{versions}});
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
 return {page,origin,calls,versions,flow,errors,external};
}
async function openOriginal(page,origin,{key=true}={}){
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();await page.getByRole('button',{name:'Versões',exact:true}).click();await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();
 if(key){await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Estúdio',exact:true}).click();}
 await page.getByLabel('Título',{exact:true}).waitFor();
}
async function attachImage(page,{mime='image/jpeg',name='source.jpg',buffer}={}){
 if(!buffer)buffer=Buffer.from(await page.evaluate(mime=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;const context=canvas.getContext('2d');context.fillStyle='#2244aa';context.fillRect(0,0,96,128);return canvas.toDataURL(mime).split(',')[1];},mime),'base64');
 await page.getByRole('button',{name:'Revisar post',exact:true}).click();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel('Imagem-base PNG ou JPEG',{exact:true}).click()]);
 await chooser.setFiles({name,mimeType:mime,buffer});
 try{await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();}catch(error){throw Error(`${error.message}\nUpload: ${JSON.stringify({mime,size:buffer.length,alerts:await page.getByRole('alert').allTextContents(),selection:(await stored(page))?.selection})}`,{cause:error});}
 await page.getByRole('button',{name:'Pedir ajuste no estúdio',exact:true}).click();
 return buffer;
}
const action=(name,args,binding)=>({status:'action_required',action:{name,args},actionBinding:binding});
const consent=(suffix='one')=>({status:'consent_required',attemptId:id(80),prompt:`Proposta sintética ${suffix}`,proposal:{prompt:`Proposta sintética ${suffix}`,operation:'create',baseImageId:null,referenceIds:[]},actionBinding:`image-binding-${suffix}`,declineBinding:`decline-binding-${suffix}`});

test('chat cria e salva versões com confirmação; imagem usa snapshot novo e recusa não chama Images',{skip:!existsSync(browserPath),timeout:90000},async t=>{
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
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('heading',{name:'Gerar a arte completa'}).waitFor();
 const proposal=page.locator('.studio-image-consent');assert.match(await proposal.innerText(),/Título novo refinado · versão 2/);const saves=calls.filter(call=>call.path==='/api/pieces');assert.deepEqual(saves.map(call=>[call.body.pieceId,call.body.baseVersion,call.body.expectedVersion]),[[newPiece,0,0],[newPiece,1,1]]);
 await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.getByText('Imagem integrada concluída.',{exact:true}).waitFor();
 await page.getByText('Imagem gerada e adicionada a este post · versão 3.',{exact:true}).waitFor();await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 const generated=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generated.length,1);assert.deepEqual(generated[0].body,{projectId,pieceId:newPiece,version:3,attemptId:id(80),actionBinding:'image-binding-one',explicitApproval:true,artworkInput:{literalText:{headline:'Título novo refinado',price:'',date:''},source:null,images:[]},apiKey});
 const fetched=calls.find(call=>call.path==='/api/images');assert.equal(fetched.query.pieceId,newPiece);assert.equal(fetched.query.version,'3');assert.equal(calls.filter(call=>call.path==='/api/pieces').length,3,'confirmar a geração preserva a origem e prepara uma versão nova');assert.equal(versions[0].content.headline,'Original preservado');
 const persisted=await eventually(()=>stored(page),value=>value?.selection?.baseVersion===3&&value?.actionReceipts?.length===5);assert.equal(persisted.selection.pieceId,newPiece);assert.equal(persisted.adjustments[0].context.pieceId,originalPiece,'snapshot inicial permanece histórico e não determina o destino da imagem');assert.equal(persisted.adjustments[0].context.baseVersion,1);
 const beforeDecline=calls.length;await page.getByLabel('Sua mensagem',{exact:true}).fill('Proponha outra imagem para eu revisar.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByRole('button',{name:'Recusar geração',exact:true}).click();await page.getByText('Proposta recusada sem gerar outra imagem.',{exact:true}).waitFor();
 const declined=calls.slice(beforeDecline);assert.equal(declined.some(call=>call.path==='/api/agent/image'),false);assert.equal(declined.some(call=>call.path==='/api/images'),false);const receipt=declined.find(call=>call.path==='/api/studio/action');assert.equal(receipt.body.actionBinding,'decline-binding-decline');assert.deepEqual(receipt.body.result,{status:'declined'});
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
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();
 await page.getByRole('button',{name:/Post B fora do pedido.*Versão 2/}).click();
 await waiting;release();
 const proposal=page.locator('.studio-image-consent');await proposal.waitFor();
 assert.match(await proposal.innerText(),/Original preservado · versão 1/,'a proposta identifica a origem capturada, sem adotar a seleção feita durante a espera');
 const confirm=page.getByRole('button',{name:'Confirmar geração de imagem',exact:true});
 if(await confirm.isEnabled())await confirm.click();
 await page.waitForLoadState('networkidle');
 assert.equal(calls.filter(call=>call.path==='/api/agent/image').length,0,'a seleção B não pode receber a geração pedida em A');
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();
 await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();
 await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();
 await page.getByText('Imagem preservada na origem.',{exact:true}).waitFor();
 await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();await page.getByRole('img',{name:'Arte integral da versão selecionada',exact:true}).waitFor();
 const generated=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generated.length,1);assert.equal(generated[0].body.pieceId,originalPiece);assert.equal(generated[0].body.version,2);assert.equal(versions.find(version=>version.piece_id===originalPiece&&version.version===1).content.headline,'Original preservado');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('codificação pendente de uma prévia não publica a arte no post aberto depois',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,versions,calls,errors}=await app(t);
 versions.push({project_id:projectId,piece_id:newPiece,version:2,content:content('Post B preservado')});
 await openOriginal(page,origin,{key:false});
 await attachImage(page);
 await page.evaluate(()=>{
  const original=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.__releasePreviewEncoding=()=>original.call(this,blob=>{callback(blob);window.__previewEncodingDone=true;},...args);};
 });
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releasePreviewEncoding==='function');
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();
 await page.getByRole('button',{name:/Post B preservado.*Versão 2/}).click();
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Post B preservado');
 await page.evaluate(()=>window.__releasePreviewEncoding());
 await page.waitForFunction(()=>window.__previewEncodingDone===true);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByRole('heading',{name:'Revise seu post',exact:true}).count(),0,'a prévia da instância desmontada não muda a navegação nem se associa a B');
 assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Post B preservado');
 assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('trocar a imagem durante a codificação descarta a prévia anterior e conserva a nova arte',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {page,origin,calls,errors}=await app(t);await openOriginal(page,origin,{key:false});
 await attachImage(page);
 await page.evaluate(()=>{
  const original=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.__releasePreviewEncoding=()=>original.call(this,blob=>{callback(blob);window.__previewEncodingDone=true;},...args);};
 });
 await page.getByRole('button',{name:'Preparar PNG',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releasePreviewEncoding==='function');
 await attachImage(page,{mime:'image/png',name:'replacement.png',buffer:png});
 await page.evaluate(()=>window.__releasePreviewEncoding());
 await page.waitForFunction(()=>window.__previewEncodingDone===true);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByRole('heading',{name:'Revise seu post',exact:true}).count(),0,'a imagem substituída não se torna a prévia da arte atual');
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
 assert.equal(await page.getByRole('button',{name:'Preparar PNG',exact:true}).isEnabled(),true);
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
 await page.getByLabel('Título',{exact:true}).fill('Post criado durante a leitura anterior');
 await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await page.getByText('Nova versão salva.',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();
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
 await page.goto(origin);await page.getByRole('button',{name:/Projeto integrado/}).click();
 await page.getByLabel('Título',{exact:true}).fill('Curso de planilhas');await page.getByLabel('Preço',{exact:true}).fill('R$ 49');await page.getByLabel('Data',{exact:true}).fill('12/12');
 await page.getByRole('button',{name:'Conectar IA',exact:true}).click();await page.getByLabel('Chave OpenAI',{exact:true}).fill(apiKey);await page.getByRole('button',{name:'Continuar',exact:true}).click();
 const before=await eventually(()=>stored(page),state=>state?.drafts?.some(draft=>draft.content.headline==='Curso de planilhas'));assert.equal(before.selection.baseVersion,0);
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Gere o post completo com esses textos.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByRole('heading',{name:'Gerar a arte completa',exact:true}).waitFor();
 assert.equal(calls.some(call=>call.path==='/api/pieces'||call.path==='/api/agent/image'),false,'a proposta não salva nem gera antes da confirmação');
 await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.getByText('Primeira arte pronta.',{exact:true}).waitFor();await page.getByText('Imagem gerada e adicionada a este post · versão 1.',{exact:true}).waitFor();
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
 await page.getByRole('tab',{name:'Referências',exact:true}).click();await page.getByLabel('Adicionar PNG ou JPEG',{exact:true}).setInputFiles({name:'reference.png',mimeType:'image/png',buffer:png});await page.getByRole('img',{name:'reference.png',exact:true}).waitFor();await page.getByRole('tab',{name:'Estúdio',exact:true}).click();
 await page.getByLabel('Sua mensagem',{exact:true}).fill('Ajuste esta arte usando minha referência.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByRole('heading',{name:'Editar a arte em uma nova versão',exact:true}).waitFor();
 assert.equal(calls.some(call=>call.path==='/api/agent/image'),false);
 await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.getByText('Nova arte editada.',{exact:true}).waitFor();await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();
 const generation=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generation.length,1);assert.equal(generation[0].body.version,2);assert.deepEqual(generation[0].body.artworkInput,{literalText:{headline:'Original preservado',price:'R$ 20',date:'20/11'},source:{pieceId:originalPiece,version:1},images:[{id:originalPiece,role:'base',mime:'image/png',data:source.toString('base64')},{id:referenceId,role:'reference',mime:'image/png',data:png.toString('base64')}]});
 await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();await page.getByRole('button',{name:/Original preservado.*Versão 1/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===96);
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===96);
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();await page.getByRole('button',{name:/Original preservado.*Versão 2/}).click();await page.waitForFunction(()=>document.querySelector('img[alt="Arte integral da versão selecionada"]')?.naturalWidth===1);
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
 await page.reload();await page.getByRole('button',{name:/Projeto integrado/}).click();await page.getByRole('tab',{name:'Direção',exact:true}).click();
 await page.getByRole('button',{name:'Usar este critério',exact:true,pressed:true}).waitFor();
 await page.getByRole('button',{name:'Reabrir decisão',exact:true}).click();
 const reopened=await eventually(()=>stored(page),value=>value?.direction.decisions.length===2);assert.deepEqual(reopened.direction.decisions.map(decision=>decision.choice),['accept','reopen']);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

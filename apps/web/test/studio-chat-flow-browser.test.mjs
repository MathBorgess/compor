import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(3),originalPiece=id(4),newPiece=id(11);
const apiKey=`sk-synthetic-${'x'.repeat(30)}`;
const content=headline=>({headline,price:'R$ 20',date:'20/11',caption:'Legenda sintética',captionOrigin:'user'});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64');
async function eventually(fn,predicate,timeout=6000){const until=Date.now()+timeout;for(;;){const value=await fn();if(predicate(value))return value;if(Date.now()>until)throw Error('estado esperado não observado');await new Promise(resolve=>setTimeout(resolve,25));}}
async function stored(page){return page.evaluate(async scope=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('compor-studio-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').get(JSON.stringify([scope.userId,scope.projectId]));r.onsuccess=()=>resolve(r.result?.state??null);r.onerror=()=>reject(r.error);});}finally{db.close();}},{userId,projectId});}
async function app(t){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin,COMPOR_STUDIO_WEB_ENABLED:'true'}});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>until||child.exitCode!==null)throw Error('app indisponível');await new Promise(resolve=>setTimeout(resolve,100));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);
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
const action=(name,args,binding)=>({status:'action_required',action:{name,args},actionBinding:binding});
const consent=(suffix='one')=>({status:'consent_required',attemptId:id(80),prompt:`Proposta sintética ${suffix}`,actionBinding:`image-binding-${suffix}`,declineBinding:`decline-binding-${suffix}`});

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
 try{await page.getByRole('dialog',{name:'Confirmar alteração no projeto?'}).waitFor();}catch(error){throw Error(`${error.message}\nUI: ${await page.locator('body').innerText()}\nAções: ${JSON.stringify(calls.map(call=>({path:call.path,binding:call.body?.actionBinding,result:call.body?.result})))}`);}assert.equal(calls.filter(call=>call.path==='/api/pieces').length,0,'primeiro salvamento espera confirmação explícita');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await eventually(()=>page.getByLabel('Título',{exact:true}).inputValue(),value=>value==='Título novo refinado');await page.getByRole('dialog',{name:'Confirmar alteração no projeto?'}).waitFor();assert.equal(calls.filter(call=>call.path==='/api/pieces').length,1,'segunda versão também espera confirmação');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('heading',{name:'Uma imagem para este post'}).waitFor();
 const proposal=page.locator('.studio-image-consent');assert.match(await proposal.innerText(),/Título novo refinado · versão 2/);const saves=calls.filter(call=>call.path==='/api/pieces');assert.deepEqual(saves.map(call=>[call.body.pieceId,call.body.baseVersion,call.body.expectedVersion]),[[newPiece,0,0],[newPiece,1,1]]);
 await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).click();await page.getByText('Imagem integrada concluída.',{exact:true}).waitFor();
 const generated=calls.filter(call=>call.path==='/api/agent/image');assert.equal(generated.length,1);assert.deepEqual(generated[0].body,{projectId,pieceId:newPiece,version:2,attemptId:id(80),actionBinding:'image-binding-one',explicitApproval:true,apiKey});
 const fetched=calls.find(call=>call.path==='/api/images');assert.equal(fetched.query.pieceId,newPiece);assert.equal(fetched.query.version,'2');assert.equal(versions[0].content.headline,'Original preservado');
 const persisted=await eventually(()=>stored(page),value=>value?.selection?.baseVersion===2&&value?.actionReceipts?.length===5);assert.equal(persisted.selection.pieceId,newPiece);assert.equal(persisted.adjustments[0].context.pieceId,originalPiece,'snapshot inicial permanece histórico e não determina o destino da imagem');assert.equal(persisted.adjustments[0].context.baseVersion,1);
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

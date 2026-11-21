import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {browserModuleSource} from './browser-module-source.mjs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {createStudioStorage} from '../lib/studio-storage.ts';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('ausência de armazenamento é explícita e nenhum erro expõe o conteúdo',async()=>{
 const storage=createStudioStorage({indexedDB:null});
 await assert.rejects(storage.load({userId:'00000000-0000-4000-8000-000000000001',projectId:'00000000-0000-4000-8000-000000000002'}),error=>error.code==='studio_storage_unavailable');
 await assert.rejects(storage.load({userId:'outra',projectId:'conta'}),error=>error.code==='studio_storage_invalid');
});

test('IndexedDB real preserva estado e blobs por conta/projeto, recusa conflito e falha atomicamente', {skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{
  const name=request.url?.split('?')[0];
  if(['/studio-state.ts','/studio-storage.ts','/studio-image.ts','/studio-artwork-input.ts'].includes(name)){
   response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(`../lib${name}`,import.meta.url)));
  }else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Teste local de armazenamento</title>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const evidence=await page.evaluate(async()=>{
  const domain=await import('/studio-state.ts'),{createStudioStorage}=await import('/studio-storage.ts'),{prepareArtworkInput}=await import('/studio-artwork-input.ts');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const scope={userId:id(1),projectId:id(2)},other={userId:id(3),projectId:id(2)},anotherProject={userId:id(1),projectId:id(4)};
  const repo=createStudioStorage(),second=createStudioStorage();
  const result={};
  const expectError=async(promise,code)=>{try{await promise;throw Error('expected failure');}catch(error){if(error.code!==code)throw Error(`unexpected category ${error.code}`,{cause:error});return true;}};
  let state=domain.createStudioState(scope);await repo.save(state,{expectedRevision:null});
  const candidateA=domain.updateBrief(state,{offer:'Oferta A'}),candidateB=domain.updateBrief(state,{offer:'Oferta B'});
  const races=await Promise.allSettled([repo.save(candidateA,{expectedRevision:0}),second.save(candidateB,{expectedRevision:0})]);
  result.oneWriter=races.filter(item=>item.status==='fulfilled').length===1;
  result.conflict=races.some(item=>item.status==='rejected'&&item.reason.code==='studio_storage_conflict');
  result.otherAccount=await repo.load(other)===null;result.otherProject=await repo.load(anotherProject)===null;
  state=await repo.load(scope);repo.close();result.reopened=(await repo.load(scope)).brief.offer===state.brief.offer;
  const revisionBeforeReceipt=state.revision;
  state=domain.recordActionReceipt(domain.updateBrief(state,{direction:'Efeito e recibo salvos juntos'}),{requestId:id(9),fingerprint:'a'.repeat(64),result:{status:'completed',local:true}});
  await repo.save(state,{expectedRevision:revisionBeforeReceipt});repo.close();
  const restoredReceipt=await repo.load(scope);
  result.receipt=restoredReceipt.brief.direction==='Efeito e recibo salvos juntos'&&restoredReceipt.actionReceipts[0].requestId===id(9);
  const originalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='states')throw new DOMException('synthetic quota','QuotaExceededError');return originalPut.apply(this,args);};
  result.quota=await expectError(repo.save(domain.updateBrief(state,{offer:'Não foi salvo'}),{expectedRevision:state.revision}),'studio_storage_quota');
  IDBObjectStore.prototype.put=originalPut;
  result.atomic=(await repo.load(scope)).brief.offer===state.brief.offer;
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=3;canvas.getContext('2d').fillRect(0,0,2,3);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
  const source={pieceId:id(40),baseVersion:0,kind:'base'},target={pieceId:id(40),baseVersion:1,kind:'base'},otherTarget={pieceId:id(40),baseVersion:2,kind:'base'};
  await repo.putDraftAsset({...scope,...source,file:png});
  result.assetCopied=await repo.copyDraftAsset(scope,source,target)==='copied' && (await repo.getDraftAsset(scope,target)).file.size===png.size;
  await second.putDraftAsset({...scope,...otherTarget,file:jpeg});
  result.assetNotOverwritten=await repo.copyDraftAsset(scope,source,otherTarget)==='exists' && (await repo.getDraftAsset(scope,otherTarget)).file.type==='image/jpeg';
  result.savedBaseImmutable=await expectError(repo.putDraftAsset({...scope,...target,file:jpeg}),'studio_draft_asset_exists');
  result.savedBasePreserved=(await repo.getDraftAsset(scope,target)).file.size===png.size;
  await repo.putDraftAsset({...scope,...target,kind:'preview',file:jpeg});
  result.draftReceivesImage=(await repo.getDraftAsset(scope,{...target,kind:'preview'})).file.type==='image/jpeg';
  result.draftLeavesSavedBase=(await repo.getDraftAsset(scope,target)).file.size===png.size;
  result.missingAsset=await repo.copyDraftAsset(other,source,target)==='missing';
  const originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){if(this.name==='draftAssets')throw new DOMException('synthetic quota','QuotaExceededError');return originalAdd.apply(this,args);};
  result.assetQuota=await expectError(repo.copyDraftAsset(scope,source,{...target,baseVersion:3}),'studio_storage_quota');
  IDBObjectStore.prototype.add=originalAdd;
  result.assetAtomic=await repo.getDraftAsset(scope,{...target,baseVersion:3})===null && (await repo.getDraftAsset(scope,source)).file.size===png.size;
  const meta=await repo.putReference({...scope,id:id(10),file:new File([png],'local.png',{type:'image/png'})});
  const jpegMeta=await repo.putReference({...scope,id:id(11),file:new File([jpeg],'local.jpg',{type:'image/jpeg'}),source:{originUrl:'https://www.pinterest.com/pin/e1_example/',board:'behance/typography'}});
  result.source=jpegMeta.source?.originUrl==='https://www.pinterest.com/pin/e1_example/'&&(await repo.getReference(scope,id(11))).metadata.source?.board==='behance/typography';
  result.metadata=meta.width===2&&meta.height===3&&jpegMeta.mime==='image/jpeg';
  result.blob=(await repo.getReference(scope,id(10))).file.size===png.size;
  repo.close();const originalBytes=new Uint8Array(await png.arrayBuffer()),storedBytes=new Uint8Array(await (await repo.getReference(scope,id(10))).file.arrayBuffer());
  result.pngBytes=originalBytes.length===storedBytes.length&&originalBytes.every((byte,index)=>byte===storedBytes[index]);
  const prepared=await prepareArtworkInput({proposal:{prompt:'Ajustar a arte',operation:'edit',baseImageId:id(40),referenceIds:[id(10)]},draft:{pieceId:id(40),baseVersion:1,content:{headline:'Oficina',price:'',date:''}},referenceIds:[id(10)],loadBase:()=>repo.getDraftAsset(scope,target),loadReference:referenceId=>repo.getReference(scope,referenceId)});
  result.pngAttached=prepared.images.length===2&&prepared.images.every(image=>image.mime==='image/png'&&atob(image.data).length===originalBytes.length&&Array.from(atob(image.data),(character,index)=>character.charCodeAt(0)===originalBytes[index]).every(Boolean));
  result.noCrossBlob=await repo.getReference(other,id(10))===null&&await repo.getReference(anotherProject,id(10))===null;
  result.duplicate=await expectError(repo.putReference({...scope,id:id(10),file:new File([jpeg],'replacement.jpg',{type:'image/jpeg'})}),'studio_reference_exists');
  result.invalidType=await expectError(repo.putReference({...scope,id:id(12),file:new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'})}),'studio_reference_invalid');
  result.wrongSignature=await expectError(repo.putReference({...scope,id:id(12),file:new File([png],'bad.jpg',{type:'image/jpeg'})}),'studio_reference_invalid');
  result.oversized=await expectError(repo.putReference({...scope,id:id(12),file:new File([new Uint8Array(8*1024*1024+1)],'large.png',{type:'image/png'})}),'studio_reference_invalid');
  state=domain.addReference(state,meta);await repo.save(state,{expectedRevision:state.revision-1});
  result.inUse=await expectError(repo.removeReference(scope,id(10)),'studio_reference_in_use');
  state=domain.addCreativeCriterion(state,{id:id(20),viewpoint:'creator',dimension:'visual',statement:'Contraste suave',example:{description:'Fundo claro com azul',referenceId:id(10)},counterexample:{description:'Neon de alto contraste',referenceId:null},provenance:'creator_report',source:'',tension:''});await repo.save(state,{expectedRevision:state.revision-1});
  state=domain.removeReference(state,id(10));await repo.save(state,{expectedRevision:state.revision-1});
  result.criterionPreserved=await expectError(repo.removeReference(scope,id(10)),'studio_reference_in_use') && (await repo.getReference(scope,id(10))).file.size===png.size;
  await repo.removeReference(scope,id(11));result.removed=await repo.getReference(scope,id(11))===null;
  repo.close();second.close();
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite');tx.objectStore('states').put({scope:JSON.stringify([scope.userId,scope.projectId]),state:{...state,schemaVersion:99}});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  result.corrupt=await expectError(repo.load(scope),'studio_storage_corrupt');repo.close();
  return result;
 });
 for(const [name,passed]of Object.entries(evidence))assert.equal(passed,true,name);
});

test('budget de referências é aplicado antes de gravação e preserva o último estado legível', {skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{const name=request.url;if(['/studio-state.ts','/studio-storage.ts','/studio-image.ts'].includes(name)){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(`../lib${name}`,import.meta.url)));}else response.end('<!doctype html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createStudioStorage}=await import('/studio-storage.ts');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const scope={userId:id(1),projectId:id(2)},repo=createStudioStorage({name:'compor-studio-budget'});
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const bytes=new Uint8Array(8*1024*1024);bytes.set(new Uint8Array(await png.arrayBuffer()));
  const file=new File([bytes],'padded.png',{type:'image/png'});
  for(let i=10;i<18;i++)await repo.putReference({...scope,id:id(i),file});
  let code='';try{await repo.putReference({...scope,id:id(18),file});}catch(error){code=error.code;}
  const last=(await repo.getReference(scope,id(17)))?.metadata.size===file.size,missing=await repo.getReference(scope,id(18))===null;
  repo.close();return{code,last,missing};
 });
 assert.equal(result.code,'studio_storage_quota');assert.equal(result.last,true);assert.equal(result.missing,true);
});


test('migração arquiva schema 1 atomicamente, conserva blobs e recusa cliente IndexedDB antigo',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{
  const name=request.url?.split('?')[0];
  if(['/studio-state.ts','/studio-storage.ts','/studio-image.ts'].includes(name)){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(`../lib${name}`,import.meta.url)));}
  else response.end('<!doctype html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const domain=await import('/studio-state.ts'),{createStudioStorage}=await import('/studio-storage.ts');
  const scope={userId:crypto.randomUUID(),projectId:crypto.randomUUID()},key=JSON.stringify([scope.userId,scope.projectId]),name='compor-studio-migration';
  const current=domain.addMessage(domain.createStudioState(scope),{id:crypto.randomUUID(),role:'user',text:'Conversa anterior preservada',createdAt:new Date().toISOString()});
  const {workflow,...legacy}=current;legacy.schemaVersion=1;
  const old=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,2);q.onupgradeneeded=()=>{q.result.createObjectStore('states',{keyPath:'scope'});q.result.createObjectStore('references',{keyPath:'key'});q.result.createObjectStore('draftAssets',{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  const file=new Blob(['original bytes'],{type:'image/png'});
  await new Promise((resolve,reject)=>{const tx=old.transaction(['states','draftAssets'],'readwrite');tx.objectStore('states').put({scope:key,state:legacy});tx.objectStore('draftAssets').put({key:'untouched',scope:key,file});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  let oldClosed=false;old.onversionchange=()=>{old.close();oldClosed=true;};
  const repo=createStudioStorage({name}),loaded=await repo.load(scope),candidate=domain.updateBrief(loaded,{offer:'Nova oferta'});
  const read=store=>new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>{const db=q.result,r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);};q.onerror=()=>reject(q.error);});
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='states')throw new DOMException('quota simulada','QuotaExceededError');return put.apply(this,args);};
  let quota='';try{await repo.save(candidate,{expectedRevision:loaded.revision});}catch(error){quota=error.code;}finally{IDBObjectStore.prototype.put=put;}
  const rollback=(await read('legacyStates')).length===0&&(await read('states'))[0].state.schemaVersion===1;
  await repo.save(candidate,{expectedRevision:loaded.revision});
  const backup=(await read('legacyStates'))[0].state,stored=(await read('states'))[0].state,asset=(await read('draftAssets'))[0];
  let refused='';await new Promise(resolve=>{const q=indexedDB.open(name,2);q.onerror=()=>{refused=q.error.name;resolve();};q.onsuccess=()=>{q.result.close();resolve();};});
  repo.close();return{oldClosed,quota,rollback,backup,legacy,stored,blob:await asset.file.text(),refused};
 });
 assert.equal(result.oldClosed,true);assert.equal(result.quota,'studio_storage_quota');assert.equal(result.rollback,true);
 assert.deepEqual(result.backup,result.legacy);assert.equal(result.stored.schemaVersion,4);assert.equal(result.stored.brief.offer,'Nova oferta');
 assert.equal(result.stored.messages[0].text,'Conversa anterior preservada');assert.equal(result.blob,'original bytes');assert.equal(result.refused,'VersionError');
});

test('schema 2 é arquivado com CAS e quota atômicos sem substituir o arquivo de schema 1',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(req,res)=>{const name=req.url?.split('?')[0];res.setHeader('content-type',name==='/studio-storage.ts'?'text/javascript':'text/html');res.end(name==='/studio-storage.ts'?await browserModuleSource(new URL('../lib/studio-storage.ts',import.meta.url)):'<!doctype html><title>Migração 2</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const evidence=await page.evaluate(async()=>{
  const {createStudioStorage}=await import('/studio-storage.ts');
  const userId=crypto.randomUUID(),projectId=crypto.randomUUID(),scope=JSON.stringify([userId,projectId]),name='compor-studio-schema-two';
  const state={schemaVersion:2,userId,projectId,revision:7,workflow:{phase:'context',view:'compose',aiPreference:'none',contextStep:2},brief:{offer:'Tema geral',audience:'Estudantes ',action:'Venda antiga',direction:''},persona:{audience:'Estudantes ',situation:'',need:'',culturalReferences:'',claims:[]},selection:null,drafts:[],messages:[],marks:[],references:[],adjustments:[],events:[]};
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,3);q.onupgradeneeded=()=>{q.result.createObjectStore('states',{keyPath:'scope'});q.result.createObjectStore('legacyStates',{keyPath:'scope'});q.result.createObjectStore('references',{keyPath:'key'}).createIndex('scope','scope');q.result.createObjectStore('draftAssets',{keyPath:'key'}).createIndex('scope','scope');};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  const oldest={scope,state:{schemaVersion:1,original:true}};
  await new Promise((resolve,reject)=>{const tx=db.transaction(['states','legacyStates'],'readwrite');tx.objectStore('states').put({scope,state});tx.objectStore('legacyStates').put(oldest);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
  const read=store=>new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>{const db=q.result,r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);};q.onerror=()=>reject(q.error);});
  const repo=createStudioStorage({name}),loaded=await repo.load({userId,projectId}),next={...loaded,revision:8};
  let conflict='';try{await repo.save(next,{expectedRevision:6});}catch(error){conflict=error.code;}
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){if(this.name==='states')throw new DOMException('quota','QuotaExceededError');return put.apply(this,arguments);};
  let quota='';try{await repo.save(next,{expectedRevision:7});}catch(error){quota=error.code;}finally{IDBObjectStore.prototype.put=put;}
  const rollback=(await read('stateArchives')).length===0&&(await read('states'))[0].state.schemaVersion===2;
  await repo.save(next,{expectedRevision:7});const archives=await read('stateArchives'),legacy=await read('legacyStates');repo.close();return {conflict,quota,rollback,archives,legacy,oldest,state,loaded};
 });
 assert.equal(evidence.conflict,'studio_storage_conflict');assert.equal(evidence.quota,'studio_storage_quota');assert.equal(evidence.rollback,true);
 assert.deepEqual(evidence.archives[0].state,evidence.state);assert.deepEqual(evidence.legacy,[evidence.oldest]);assert.equal(evidence.loaded.brief.audience,'Estudantes ');assert.equal(evidence.loaded.brief.action,'Venda antiga');assert.deepEqual(evidence.loaded.posts,{});
});

test('schema 3 arquiva estado sem atribuir upload ao legado e fecha leitura antiga',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(req,res)=>{const name=req.url?.split('?')[0];if(['/studio-state.ts','/studio-storage.ts'].includes(name)){res.setHeader('content-type','text/javascript');res.end(await browserModuleSource(new URL(`../lib${name}`,import.meta.url)));}else res.end('<!doctype html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createStudioState}=await import('/studio-state.ts'),{createStudioStorage}=await import('/studio-storage.ts');
  const scope={userId:crypto.randomUUID(),projectId:crypto.randomUUID()},name='compor-studio-schema-three',key=JSON.stringify([scope.userId,scope.projectId]);
  const base=createStudioState(scope),legacy={...base,schemaVersion:3};
  const old=await new Promise((resolve,reject)=>{const req=indexedDB.open(name,4);req.onupgradeneeded=()=>{req.result.createObjectStore('states',{keyPath:'scope'});req.result.createObjectStore('legacyStates',{keyPath:'scope'});req.result.createObjectStore('stateArchives',{keyPath:'key'});req.result.createObjectStore('references',{keyPath:'key'}).createIndex('scope','scope');req.result.createObjectStore('draftAssets',{keyPath:'key'}).createIndex('scope','scope');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise((resolve,reject)=>{const tx=old.transaction('states','readwrite');tx.objectStore('states').put({scope:key,state:legacy});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});let closed=false;old.onversionchange=()=>{old.close();closed=true;};
  const repo=createStudioStorage({name}),current=await repo.load(scope);await repo.save({...current,revision:1},{expectedRevision:0});repo.close();
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const archive=await new Promise((resolve,reject)=>{const req=db.transaction('stateArchives').objectStore('stateArchives').get(JSON.stringify([key,3]));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
  let refused=false;await new Promise(resolve=>{const req=indexedDB.open(name,4);req.onerror=()=>{refused=req.error.name==='VersionError';resolve();};req.onsuccess=()=>{req.result.close();resolve();};});
  return {closed,refused,version:current.schemaVersion,archive:JSON.stringify(archive.state)===JSON.stringify(legacy)};
 });
 assert.deepEqual(result,{closed:true,refused:true,version:4,archive:true});
});

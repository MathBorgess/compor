import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {browserModuleSource} from './browser-module-source.mjs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function browser(t){
 const server=createServer(async(request,response)=>{const path=request.url;if(['/studio-state.ts','/studio-storage.ts','/studio-image.ts'].includes(path)){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(`../lib${path}`,import.meta.url)));}else response.end('<!doctype html><title>Local draft asset test</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const instance=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>instance.close());const page=await instance.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);return page;
}

test('upgrade v1 para v2 preserva rascunhos e referências; bases e prévias ficam segregadas e retomáveis',{skip:!existsSync(browserPath)},async t=>{
 const page=await browser(t);
 const result=await page.evaluate(async()=>{
  const {createStudioState,createPost,updateBrief}=await import('/studio-state.ts'),{createStudioStorage}=await import('/studio-storage.ts');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const scope={userId:id(1),projectId:id(2)},address={pieceId:id(3),baseVersion:0,kind:'base'};
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=160;
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
  const state=updateBrief(createPost(createStudioState(scope),{pieceId:id(3)}),{offer:'Rascunho antes do upgrade'});
  const name='compor-studio-upgrade';
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{request.result.createObjectStore('states',{keyPath:'scope'});request.result.createObjectStore('references',{keyPath:'key'}).createIndex('scope','scope');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const scopeKey=JSON.stringify([scope.userId,scope.projectId]);
  await new Promise((resolve,reject)=>{const tx=db.transaction(['states','references'],'readwrite');tx.objectStore('states').put({scope:scopeKey,state});tx.objectStore('references').add({scope:scopeKey,key:JSON.stringify([scopeKey,id(4)]),metadata:{id:id(4),name:'original.png',mime:'image/png',size:png.size,width:128,height:160},file:png});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  const repo=createStudioStorage({name}),evidence={};
  evidence.oldState=(await repo.load(scope)).brief.offer===state.brief.offer;
  evidence.oldReference=(await repo.getReference(scope,id(4))).file.size===png.size;
  const metadata=await repo.putDraftAsset({...scope,...address,file:new File([jpeg],'discard-this-name.jpg',{type:'image/jpeg'})});
  evidence.metadata=metadata.kind==='base'&&metadata.width===128&&metadata.height===160;
  await repo.putDraftAsset({...scope,...address,kind:'preview',file:png});
  evidence.noCrossAccount=await repo.getDraftAsset({userId:id(8),projectId:id(2)},address)===null;
  evidence.noCrossProject=await repo.getDraftAsset({userId:id(1),projectId:id(8)},address)===null;
  evidence.noCrossPiece=await repo.getDraftAsset(scope,{...address,pieceId:id(8)})===null;
  evidence.noCrossVersion=await repo.getDraftAsset(scope,{...address,baseVersion:1})===null;
  const base=await repo.getDraftAsset(scope,address),preview=await repo.getDraftAsset(scope,{...address,kind:'preview'});
  evidence.discardsName=!('name'in base.file);evidence.separateKinds=base.file.type==='image/jpeg'&&preview.file.type==='image/png';
  const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='draftAssets')throw new DOMException('quota','QuotaExceededError');return original.apply(this,args);};
  try{await repo.putDraftAsset({...scope,...address,file:png});evidence.atomic=false;}catch(error){evidence.atomic=error.code==='studio_storage_quota';}finally{IDBObjectStore.prototype.put=original;}
  evidence.oldBlobSurvives=(await repo.getDraftAsset(scope,address)).file.type==='image/jpeg';
  await repo.removeDraftAsset(scope,{...address,kind:'preview'});evidence.removed=await repo.getDraftAsset(scope,{...address,kind:'preview'})===null;
  repo.close();return evidence;
 });
 for(const [name,value]of Object.entries(result))assert.equal(value,true,name);
 await page.reload();
 const restored=await page.evaluate(async()=>{const {createStudioStorage}=await import('/studio-storage.ts');const repo=createStudioStorage({name:'compor-studio-upgrade'}),value=await repo.getDraftAsset({userId:'00000000-0000-4000-8000-000000000001',projectId:'00000000-0000-4000-8000-000000000002'},{pieceId:'00000000-0000-4000-8000-000000000003',baseVersion:0,kind:'base'});repo.close();return{mime:value?.file.type,width:value?.metadata.width};});
 assert.deepEqual(restored,{mime:'image/jpeg',width:128});
});

test('arquivos são validados antes do decoder e quota global combina referências e assets de projetos diferentes',{skip:!existsSync(browserPath),timeout:30000},async t=>{
 const page=await browser(t);
 const result=await page.evaluate(async()=>{
  const {createStudioStorage}=await import('/studio-storage.ts');const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  let decoded=0;
  const checked=createStudioStorage({name:'compor-studio-header',decodeImage:async()=>{decoded++;throw Error('must not decode');}});
  const forged=new Uint8Array(24),view=new DataView(forged.buffer);forged.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);forged.set([73,72,68,82],12);view.setUint32(16,20000);view.setUint32(20,20000);
  let invalid='';try{await checked.putDraftAsset({userId:id(1),projectId:id(2),pieceId:id(3),baseVersion:0,kind:'base',file:new Blob([forged],{type:'image/png'})});}catch(error){invalid=error.code;}checked.close();
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const padded=new Uint8Array(8*1024*1024);padded.set(new Uint8Array(await png.arrayBuffer()));const file=new File([padded],'reference.png',{type:'image/png'});
  const repo=createStudioStorage({name:'compor-studio-global'}),scope={userId:id(1),projectId:id(2)};
  await repo.putReference({...scope,id:id(10),file});
  for(let n=0;n<31;n++)await repo.putDraftAsset({userId:id(1),projectId:id(100+n),pieceId:id(3),baseVersion:0,kind:'base',file});
  let quota='';try{await repo.putDraftAsset({...scope,pieceId:id(3),baseVersion:0,kind:'preview',file});}catch(error){quota=error.code;}
  const missing=await repo.getDraftAsset(scope,{pieceId:id(3),baseVersion:0,kind:'preview'})===null;
  const previous=(await repo.getReference(scope,id(10))).file.size===file.size;
  await repo.putDraftAsset({userId:id(1),projectId:id(100),pieceId:id(3),baseVersion:0,kind:'base',file:png});
  await repo.putDraftAsset({...scope,pieceId:id(3),baseVersion:0,kind:'preview',file:png});
  const replaced=(await repo.getDraftAsset({userId:id(1),projectId:id(100)},{pieceId:id(3),baseVersion:0,kind:'base'})).file.size===png.size;
  repo.close();return{decoded,invalid,quota,missing,previous,replaced};
 });
 assert.equal(result.decoded,0);assert.equal(result.invalid,'studio_draft_asset_invalid');assert.equal(result.quota,'studio_storage_quota');assert.equal(result.missing,true);assert.equal(result.previous,true);assert.equal(result.replaced,true);
});

test('limite global de quantidade recusa o 501º blob sem descartar arquivos anteriores',{skip:!existsSync(browserPath)},async t=>{
 const page=await browser(t);
 const result=await page.evaluate(async()=>{
  const {createStudioStorage}=await import('/studio-storage.ts'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const file=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const scope={userId:id(1),projectId:id(2)},address={pieceId:id(3),baseVersion:0,kind:'base'},name='compor-studio-count';
  const repo=createStudioStorage({name});await repo.putDraftAsset({...scope,...address,file});repo.close();
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('draftAssets','readwrite'),store=tx.objectStore('draftAssets');for(let n=0;n<499;n++){const projectId=id(n+100),scopeKey=JSON.stringify([scope.userId,projectId]);store.add({scope:scopeKey,key:JSON.stringify([scopeKey,address.pieceId,0,'base']),metadata:{...address,mime:file.type,size:file.size,width:1,height:1},file});}tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  let errorCode;try{await repo.putDraftAsset({...scope,...address,kind:'preview',file});}catch(error){errorCode=error.code;}
  const previous=await repo.getDraftAsset(scope,address),missing=await repo.getDraftAsset(scope,{...address,kind:'preview'});
  await repo.removeDraftAsset({userId:scope.userId,projectId:id(100)},address);
  await repo.putDraftAsset({...scope,...address,kind:'preview',file});const resumed=await repo.getDraftAsset(scope,{...address,kind:'preview'});repo.close();
  return{errorCode,previous:previous.file.size===file.size,missing:missing===null,resumed:resumed.file.size===file.size};
 });
 assert.deepEqual(result,{errorCode:'studio_storage_quota',previous:true,missing:true,resumed:true});
});

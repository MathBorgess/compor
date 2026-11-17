import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';

const chrome=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('seleção local e snapshots imutáveis preservam bytes, escopo e quota',{skip:!existsSync(chrome)},async t=>{
 const modules={'/visual.js':new URL('../lib/selected-visual-input.ts',import.meta.url),'/journal.js':new URL('../lib/parallel-exploration-journal.ts',import.meta.url),'/state.js':new URL('../lib/studio-state.ts',import.meta.url),'/storage.js':new URL('../lib/studio-storage.ts',import.meta.url),'/planner.js':new URL('../../../packages/agents-api/src/exploration-plan-contract.mjs',import.meta.url)};
 const server=createServer(async(req,res)=>{if(modules[req.url]){res.setHeader('Content-Type','text/javascript');res.end(await browserModuleSource(modules[req.url]));}else res.end('<!doctype html><title>Snapshot</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:chrome,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {prepareSelectedVisualInput,prepareSelectedVisualCandidates,selectedVisualInputImages,selectedLocalUploads,visualInputImages}=await import('/visual.js');
  const {createParallelJournalStore}=await import('/journal.js');
  const {createStudioState,parseStudioState}=await import('/state.js');
  const {createStudioStorage}=await import('/storage.js');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,1,1);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'local.png',{type:'image/png'});
  const storage=createStudioStorage({name:'compor-studio-visual-test'}),scope={userId:id(1),projectId:id(2)};
  const local=await storage.putReference({...scope,id:id(3),file,source:{kind:'local-upload'}});
  const legacy=await storage.putReference({...scope,id:id(4),file});
  const generated=await storage.putReference({...scope,id:id(5),file,source:{kind:'generated',projectId:id(2),imageId:id(6)}});
  const external=await storage.putReference({...scope,id:id(21),file,source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/advertising'}});
  let consentDenied=false;try{await prepareSelectedVisualCandidates({references:[external],projectId:scope.projectId,externalConsent:false,loadReference:async()=>{throw Error('must not read');}});}catch{consentDenied=true;}
  let candidateLoads=[];const candidates=await prepareSelectedVisualCandidates({references:[local,legacy,external,generated],projectId:scope.projectId,externalConsent:true,loadReference:async key=>{candidateLoads.push(key);return storage.getReference(scope,key);}});
  const candidateScope={...scope,conversationId:id(7),requestId:id(31)};
  const candidateJournal=createParallelJournalStore({name:'compor-parallel-exploration-candidate-test'});await candidateJournal.saveRequestVisualSnapshot(candidateScope,candidates);candidateJournal.close();
  const candidateRecovery=createParallelJournalStore({name:'compor-parallel-exploration-candidate-test'}),frozenCandidates=await candidateRecovery.loadRequestVisualSnapshot(candidateScope);
  const picked=await selectedVisualInputImages(frozenCandidates,[local.id,generated.id]);
  const triage=candidateLoads.join(',')===[local.id,external.id,generated.id].join(',')&&picked.map(item=>item.id).join(',')===[local.id,generated.id].join(',')&&frozenCandidates.manifest.entries.map(item=>item.inputOrigin).join(',')==='local-upload,external,generated';
  let missingUpload=false,unknownId=false,wrongOrder=false;
  try{await selectedVisualInputImages(frozenCandidates,[generated.id]);}catch{missingUpload=true;}
  try{await selectedVisualInputImages(frozenCandidates,[local.id,id(99)]);}catch{unknownId=true;}
  try{await selectedVisualInputImages(frozenCandidates,[generated.id,local.id]);}catch{wrongOrder=true;}
  let wrongProject=false;try{await prepareSelectedVisualCandidates({references:[generated],projectId:id(99),externalConsent:true,loadReference:async()=>null});}catch{wrongProject=true;}
  const {validateExplorationPlan}=await import('/planner.js');
  const visualContext={idea:'Ideia',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const visualPlan=validateExplorationPlan({version:2,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`})),referenceIds:[local.id,generated.id]},visualContext,frozenCandidates.manifest);
  const visualBatch={...scope,batchId:id(40)},visualPrep={version:1,...visualBatch,conversationId:id(7),planRequestId:id(41),credentialSource:'byok',context:visualContext,plan:null,stage:'planning',revision:0,imageIds:[id(42),id(43),id(44)],intentId:id(45),expectedEpoch:0,planSubmitted:false,revocationRequested:false,visualInput:frozenCandidates.manifest};
  await candidateRecovery.createBeforePlanningWithVisual(visualPrep,frozenCandidates);
  let vp=await candidateRecovery.updatePreparation(scope.userId,0,{kind:'intent_confirmed',epoch:1});
  vp=await candidateRecovery.updatePreparation(scope.userId,vp.revision,{kind:'plan_submitted'});
  let badVisualPlan=false;try{await candidateRecovery.updatePreparation(scope.userId,vp.revision,{kind:'planned',plan:{...visualPlan,referenceIds:[generated.id]}});}catch{badVisualPlan=true;}
  vp=await candidateRecovery.updatePreparation(scope.userId,vp.revision,{kind:'planned',plan:visualPlan});
  await candidateRecovery.prepareExecution(visualBatch,vp.revision);
  const vj=await candidateRecovery.load(visualBatch),visualPlanRetained=JSON.stringify(vj.visualInput)===JSON.stringify(frozenCandidates.manifest)&&JSON.stringify(vj.plan.referenceIds)===JSON.stringify([local.id,generated.id]);candidateRecovery.close();
  const refs=[legacy,local,generated];let loaded=[];
  const snapshot=await prepareSelectedVisualInput({references:refs,loadReference:async key=>{loaded.push(key);return storage.getReference(scope,key);}});
  const images=await visualInputImages(snapshot),hash=snapshot.manifest.entries[0].transport.sha256;
  const onlyLocal=loaded.length===1&&loaded[0]===local.id&&snapshot.manifest.entries.length===1&&images[0].id===local.id&&images[0].data===btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))&&snapshot.manifest.entries[0].transformation==='none';
  const noInfer=selectedLocalUploads([legacy,generated]).length===0;
  const large=document.createElement('canvas');large.width=180;large.height=180;const gc=large.getContext('2d'),pixels=gc.createImageData(180,180);let seed=1;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed>>>24;pixels.data[i+1]=seed>>>16;pixels.data[i+2]=seed>>>8;pixels.data[i+3]=(Math.floor(i/4)%180<40&&Math.floor(i/4/180)<40)?0:255;}gc.putImageData(pixels,0,0);
  const largeBlob=await new Promise(resolve=>large.toBlob(resolve,'image/png'));const largeFile=new File([largeBlob],'large.png',{type:'image/png'});
  const largeRef=await storage.putReference({...scope,id:id(20),file:largeFile,source:{kind:'local-upload'}});
  const reduced=await prepareSelectedVisualInput({references:[largeRef],maxBytes:8192,loadReference:key=>storage.getReference(scope,key)});
  const bitmap=await createImageBitmap(reduced.blobs[0]),check=document.createElement('canvas');check.width=bitmap.width;check.height=bitmap.height;check.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const optimized=reduced.blobs[0].size<=8192&&reduced.blobs[0].type==='image/png'&&reduced.manifest.entries[0].transformation==='optimized-v1'&&check.getContext('2d').getImageData(0,0,1,1).data[3]<255;
  let badBudget=false;try{await prepareSelectedVisualInput({references:[],maxBytes:3*1024*1024,loadReference:async()=>null});}catch{badBudget=true;}
  let duplicate=false;try{selectedLocalUploads([local,local]);}catch{duplicate=true;}
  const empty=await prepareSelectedVisualInput({references:[legacy],loadReference:async()=>{throw Error('unexpected');}});
  let mismatch=false;try{await prepareSelectedVisualInput({references:[local],loadReference:async()=>({metadata:legacy,file})});}catch{mismatch=true;}
  const state=createStudioState(scope),migrated=parseStudioState({...state,schemaVersion:3,references:[legacy],projectReferenceIds:[legacy.id]});
  const legacyUnknown=migrated.schemaVersion===4&&!migrated.references[0].source;
  const journalName='compor-parallel-exploration-visual-test';
  const oldJournal=await new Promise((resolve,reject)=>{const req=indexedDB.open(journalName,3);req.onupgradeneeded=()=>{req.result.createObjectStore('journals');req.result.createObjectStore('preparations');req.result.createObjectStore('preparationHistory');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  let oldJournalClosed=false;oldJournal.onversionchange=()=>{oldJournal.close();oldJournalClosed=true;};
  const journal=createParallelJournalStore({name:journalName}),rScope={...scope,conversationId:id(7),requestId:id(8)};
  await journal.saveRequestVisualSnapshot(rScope,snapshot);journal.close();
  let oldJournalRefused=false;await new Promise(resolve=>{const req=indexedDB.open(journalName,3);req.onerror=()=>{oldJournalRefused=req.error.name==='VersionError';resolve();};req.onsuccess=()=>{req.result.close();resolve();};});
  const resumed=createParallelJournalStore({name:'compor-parallel-exploration-visual-test'}),restored=await resumed.loadRequestVisualSnapshot(rScope);
  const same=(await visualInputImages(restored))[0].data===images[0].data&&restored.manifest.entries[0].transport.sha256===hash;
  const wrong=await resumed.loadRequestVisualSnapshot({...rScope,userId:id(10)})===null;
  let duplicateWrite=false;try{await resumed.saveRequestVisualSnapshot(rScope,snapshot);}catch{duplicateWrite=true;}
  const second=createParallelJournalStore({name:'compor-parallel-exploration-visual-test'}),raceScope={...rScope,requestId:id(30)};
  const raced=await Promise.allSettled([resumed.saveRequestVisualSnapshot(raceScope,snapshot),second.saveRequestVisualSnapshot(raceScope,snapshot)]);
  const oneWriter=raced.filter(item=>item.status==='fulfilled').length===1&&raced.filter(item=>item.status==='rejected').length===1;second.close();
  const context={idea:'Ideia',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const prep={version:1,...scope,batchId:id(11),conversationId:id(7),planRequestId:id(12),credentialSource:'byok',context,plan:null,stage:'planning',revision:0,imageIds:[id(13),id(14),id(15)],intentId:id(16),expectedEpoch:0,planSubmitted:false,revocationRequested:false,visualInput:snapshot.manifest};
  let oldPath=false;try{await resumed.createBeforePlanning(prep);}catch(error){oldPath=error.code==='parallel_storage_invalid';}
  const originalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='visualSnapshots')throw new DOMException('quota','QuotaExceededError');return originalAdd.apply(this,args);};
  let quota=false;try{await resumed.createBeforePlanningWithVisual(prep,snapshot);}catch(error){quota=error.code==='parallel_storage_quota';}IDBObjectStore.prototype.add=originalAdd;
  const atomic=(await resumed.loadPreparation(scope.userId))===null;
  await resumed.createBeforePlanningWithVisual(prep,snapshot);
  const batch=await resumed.loadVisualSnapshot({...scope,batchId:id(11)},id(7));
  let cross=false;try{await resumed.loadVisualSnapshot({...scope,batchId:id(11)},id(9));}catch(error){cross=error.code==='parallel_storage_corrupt';}
  let corrupt=false;try{await visualInputImages({manifest:batch.manifest,blobs:[new Blob(['invalid'],{type:'image/png'})]});}catch{corrupt=true;}
  resumed.close();
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-parallel-exploration-visual-test');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('visualSnapshots','readwrite'),store=tx.objectStore('visualSnapshots'),key=JSON.stringify([scope.userId,scope.projectId,id(11)]),request=store.get(key);request.onsuccess=()=>store.put({...request.result,blobs:[]},key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
  const reread=createParallelJournalStore({name:'compor-parallel-exploration-visual-test'});let evicted=false;try{await reread.loadVisualSnapshot({...scope,batchId:id(11)},id(7));}catch(error){evicted=error.code==='parallel_storage_corrupt';}
  const retained=Boolean(await reread.loadPreparation(scope.userId));reread.close();storage.close();
  return {onlyLocal,noInfer,optimized,badBudget,triage,consentDenied,missingUpload,unknownId,wrongOrder,wrongProject,badVisualPlan,visualPlanRetained,duplicate,empty:empty.manifest.entries.length===0,mismatch,legacyUnknown,same,wrong,oldJournalClosed,oldJournalRefused,duplicateWrite,oneWriter,oldPath,quota,atomic,batch:batch.manifest.entries[0].transport.sha256===hash,cross,corrupt,evicted,retained};
 });
 assert.deepEqual(result,Object.fromEntries(Object.keys(result).map(key=>[key,true])));
});

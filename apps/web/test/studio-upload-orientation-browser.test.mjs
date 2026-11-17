import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 64×32 PNG, EXIF orientation 6. Chromium presents the image as 32×64.
const orientedPng='iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAGmVYSWZNTQAqAAAACAABARIAAwAAAAEABgAAAAAAANZnS2kAAABQSURBVHic1c5BEQAgDMCwUhdYQxh6EbEH1yjI2udSJnESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ES5+/A1AMUVQFJL1s65AAAAABJRU5ErkJggg==';

test('PNG com orientação EXIF válida preserva bytes e aceita somente dimensão renderizada coerente',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{const files={'/storage.js':'../lib/studio-storage.ts','/artwork.js':'../lib/studio-artwork-input.ts'};if(files[request.url]){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(files[request.url],import.meta.url)));}else response.end('<!doctype html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const value=await page.evaluate(async data=>{
  const {createStudioStorage}=await import('/storage.js'),{prepareArtworkTransport}=await import('/artwork.js'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),scope={userId:id(1),projectId:id(2)},repo=createStudioStorage();
  const bytes=Uint8Array.from(atob(data),character=>character.charCodeAt(0)),file=new File([bytes],'orientado.png',{type:'image/png'}),bitmap=await createImageBitmap(file),actual=[bitmap.width,bitmap.height];bitmap.close();
  const metadata=await repo.putReference({...scope,id:id(3),file});const stored=await repo.getReference(scope,id(3));
  const version={pieceId:id(4),baseVersion:0,kind:'base'};await repo.putDraftAsset({...scope,...version,file});const base=await repo.getDraftAsset(scope,version);
  const equal=async blob=>{const value=new Uint8Array(await blob.arrayBuffer());return value.length===bytes.length&&value.every((byte,index)=>byte===bytes[index]);};
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;const regular=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const swapped=createStudioStorage({name:'compor-studio-fake-swap',decodeImage:async()=>({width:32,height:64,close(){}})});let rejected=false;
  try{await swapped.putReference({...scope,id:id(5),file:new File([regular],'normal.png',{type:'image/png'})});}catch(error){rejected=error.code==='studio_reference_invalid';}
  const nonRotating=bytes.slice();nonRotating[60]=1;let wrongOrientation=false;
  try{await swapped.putReference({...scope,id:id(6),file:new File([nonRotating],'wrong-orientation.png',{type:'image/png'})});}catch(error){wrongOrientation=error.code==='studio_reference_invalid';}
  const oversized=bytes.slice();new DataView(oversized.buffer).setUint32(16,16385);let oversizedRejected=false;
  try{await swapped.putReference({...scope,id:id(7),file:new File([oversized],'oversized.png',{type:'image/png'})});}catch(error){oversizedRejected=error.code==='studio_reference_invalid';}
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg')),rawJpeg=new Uint8Array(await jpeg.arrayBuffer()),app1=new Uint8Array([255,225,0,34,69,120,105,102,0,0,...bytes.slice(41,67)]),jpegFile=new File([rawJpeg.slice(0,2),app1,rawJpeg.slice(2)],'orientado.jpg',{type:'image/jpeg'});
  const jpegBitmap=await createImageBitmap(jpegFile),jpegActual=[jpegBitmap.width,jpegBitmap.height];jpegBitmap.close();const jpegMeta=await repo.putReference({...scope,id:id(8),file:jpegFile}),jpegStored=await repo.getReference(scope,id(8));
  const jpegOriginal=new Uint8Array(await jpegFile.arrayBuffer()),jpegRestored=new Uint8Array(await jpegStored.file.arrayBuffer());const jpegBytes=jpegOriginal.length===jpegRestored.length&&jpegOriginal.every((byte,index)=>byte===jpegRestored[index]);
  const large=new File([bytes,new Uint8Array(2*1024*1024)],'orientado-grande.png',{type:'image/png'});await repo.putReference({...scope,id:id(9),file:large});
  const prepared=await prepareArtworkTransport({proposal:{prompt:'Nova arte',operation:'create',baseImageId:null,referenceIds:[id(9)]},draft:{pieceId:id(4),baseVersion:0,content:{headline:'',price:'',date:''}},referenceIds:[id(9)],loadReference:referenceId=>repo.getReference(scope,referenceId)},{allowConversion:true});
  const copy=prepared.conversions[0],preservedLarge=(await repo.getReference(scope,id(9))).file.size===large.size;
  swapped.close();repo.close();return {actual,metadata:[metadata.width,metadata.height],referenceBytes:await equal(stored.file),baseBytes:await equal(base.file),rejected,wrongOrientation,oversizedRejected,jpegActual,jpegMetadata:[jpegMeta.width,jpegMeta.height],jpegBytes,originalDimensions:[copy.original.width,copy.original.height],copyDimensions:[copy.copy.width,copy.copy.height],preservedLarge};
 },orientedPng);
 assert.deepEqual(value,{actual:[32,64],metadata:[32,64],referenceBytes:true,baseBytes:true,rejected:true,wrongOrientation:true,oversizedRejected:true,jpegActual:[32,64],jpegMetadata:[32,64],jpegBytes:true,originalDimensions:[32,64],copyDimensions:[32,64],preservedLarge:true});
});

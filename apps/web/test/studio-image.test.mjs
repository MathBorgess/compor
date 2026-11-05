import test from 'node:test';
import assert from 'node:assert/strict';
import {studioImageDimensions} from '../lib/studio-image.mjs';
function png(width,height){const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);return new Blob([bytes],{type:'image/png'});}
test('dimensões são verificadas antes de decodificar pixels',async()=>{
 assert.deepEqual(await studioImageDimensions(png(1080,1350)),{width:1080,height:1350});
 await assert.rejects(()=>studioImageDimensions(png(100000,100000)),/limite/);
 await assert.rejects(()=>studioImageDimensions(png(4000,4000),{maxPixels:1_000_000}),/limite/);
 await assert.rejects(()=>studioImageDimensions(new Blob(['não é PNG'.repeat(4)],{type:'image/png'})),/PNG inválido/);
});
test('JPEG identifica SOF sem confiar no MIME ou entrar em laço com segmento inválido',async()=>{
 const bytes=new Uint8Array(30);bytes.set([255,216,255,224,0,4,0,0,255,192,0,17,8,5,70,4,56,3]);
 assert.deepEqual(await studioImageDimensions(new Blob([bytes],{type:'image/jpeg'})),{width:1080,height:1350});
 bytes[10]=0;bytes[11]=0;await assert.rejects(()=>studioImageDimensions(new Blob([bytes],{type:'image/jpeg'})));
});

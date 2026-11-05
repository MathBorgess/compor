import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchPrivateImage} from '../lib/private-image-fetch.ts';

const source=Buffer.alloc(5*1024*1024+99,7),digest=createHash('sha256').update(source).digest('hex');
const query=new URLSearchParams({projectId:'project',pieceId:'piece',version:'1',assetId:'asset'});
function service({changePart=-1,truncatePart=-1,denyPart=-1}={}) {
 const calls=[];
 return {calls,fetch:async input=>{
  const url=new URL(input,'https://compor.test'),part=url.searchParams.get('part');calls.push(part);
  if(part===null)return new Response('{}',{status:413,headers:{'x-compor-chunked':'1'}});
  const index=Number(part);if(index===denyPart)return new Response(null,{status:404});
  const bytes=source.subarray(index*2*1024*1024,Math.min((index+1)*2*1024*1024,source.length));
  return new Response(index===truncatePart?bytes.subarray(0,-1):bytes,{status:200,headers:{'content-type':'application/octet-stream','x-compor-part':part,'x-compor-parts':'3','x-compor-size':String(source.length),'x-compor-sha256':index===changePart?'0'.repeat(64):digest}});
 }};
}
test('recompõe imagem privada de forma limitada e verifica hash final',async()=>{
 const fake=service();const blob=await fetchPrivateImage(query,{fetch:fake.fetch});assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),source);assert.deepEqual(fake.calls,[null,'0','1','2']);
});
test('recusa partes truncadas, conteúdo divergente e troca de autorização',async()=>{
 for(const options of [{changePart:1},{truncatePart:1},{denyPart:1}]){const fake=service(options);await assert.rejects(fetchPrivateImage(query,{fetch:fake.fetch}));assert.deepEqual(fake.calls,[null,'0','1']);}
 const fake=service();const fetch=async input=>{const response=await fake.fetch(input);const part=new URL(input,'https://compor.test').searchParams.get('part');if(part!=='2')return response;const bytes=Buffer.from(await response.arrayBuffer());bytes[0]^=1;return new Response(bytes,{status:200,headers:response.headers});};await assert.rejects(fetchPrivateImage(query,{fetch}));
});

import {sha256Hex} from './browser-bytes.ts';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_HTTP_BYTES = 4 * 1024 * 1024;
const PART_BYTES = 2 * 1024 * 1024;

export class PrivateImageNotFound extends Error {}

async function readBounded(stream:ReadableStream<Uint8Array>|null, limit:number) {
  if (!stream) throw Error('missing image');
  const reader=stream.getReader(),chunks=[];let length=0;
  try {
    for (;;) {
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;if(length>limit)throw Error('image too large');chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

// Each request is authorized separately; no URL, path or credential from a provider reaches the browser.
export async function fetchPrivateImage(query:URLSearchParams|string,{fetch:fetchApi=globalThis.fetch,signal}:{fetch?:typeof fetch;signal?:AbortSignal}={}) {
  const get=async (params:URLSearchParams|string)=>fetchApi(`/api/images?${params}`,{cache:'no-store',signal});
  const initial=await get(query);
  if(initial.ok && /^image\/png(?:\s*;|$)/i.test(initial.headers.get('content-type')??'')) {
    const bytes=await readBounded(initial.body,MAX_HTTP_BYTES);if(!bytes.length)throw Error('empty image');
    return new Blob([bytes],{type:'image/png'});
  }
  if(initial.status===404)throw new PrivateImageNotFound('image unavailable');
  if(initial.status!==413 || initial.headers.get('x-compor-chunked')!=='1')throw Error('image unavailable');
  let expectedSize:number|null=null,expectedHash:string|null=null,expectedParts:number|null=null;const chunks=[];
  for(let index=0;index<4;index++) {
    const params=new URLSearchParams(query);params.set('part',String(index));
    const response=await get(params);
    if(!response.ok || response.headers.get('content-type')!=='application/octet-stream' || response.headers.get('x-compor-part')!==String(index))throw Error('invalid image part');
    const sizeText=response.headers.get('x-compor-size'),partsText=response.headers.get('x-compor-parts'),hash=response.headers.get('x-compor-sha256');
    if(!/^[1-9][0-9]*$/.test(sizeText??'') || !/^[1-4]$/.test(partsText??'') || !/^[0-9a-f]{64}$/.test(hash??''))throw Error('invalid image metadata');
    const size=Number(sizeText),parts=Number(partsText);
    if(size<=MAX_HTTP_BYTES || size>MAX_BYTES || parts!==Math.ceil(size/PART_BYTES))throw Error('invalid image size');
    if(index===0){expectedSize=size;expectedHash=hash;expectedParts=parts;}
    if(size!==expectedSize || hash!==expectedHash || parts!==expectedParts || index>=parts)throw Error('image changed');
    const bytes=await readBounded(response.body,PART_BYTES);
    if(bytes.length!==Math.min(PART_BYTES,size-index*PART_BYTES))throw Error('truncated image');
    chunks.push(bytes);if(chunks.length===parts)break;
  }
  if(chunks.length!==expectedParts||expectedSize===null)throw Error('incomplete image');
  const image=new Uint8Array(expectedSize);let offset=0;
  for(const bytes of chunks){image.set(bytes,offset);offset+=bytes.length;}
  if(await sha256Hex(image)!==expectedHash)throw Error('image changed');
  return new Blob([image],{type:'image/png'});
}

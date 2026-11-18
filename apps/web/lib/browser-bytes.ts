export async function sha256Hex(input:BufferSource|string):Promise<string> {
  const bytes=typeof input==='string'?new TextEncoder().encode(input):input;
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function imageBase64(file:Blob):Promise<string> {
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=32768){
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  }
  return btoa(binary);
}

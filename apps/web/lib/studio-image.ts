/** Check dimensions before allowing the browser decoder to allocate image pixels. */
export async function studioImageDimensions(
  blob: unknown,
  { maxPixels = 40_000_000, maxDimension = 16384 } = {},
) {
  if (
    !(blob instanceof Blob) ||
    blob.size < 24 ||
    blob.size > 8 * 1024 * 1024 ||
    !["image/png", "image/jpeg"].includes(blob.type)
  )
    throw Error("Imagem inválida.");
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()),
    view = new DataView(bytes.buffer);
  let width, height;
  if (blob.type === "image/png") {
    if (
      ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
      view.getUint32(8) !== 13 ||
      String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
    )
      throw Error("PNG inválido.");
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    if (bytes[0] !== 255 || bytes[1] !== 216) throw Error("JPEG inválido.");
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) throw Error("JPEG inválido.");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 8 || bytes[offset + 2] !== 8)
          throw Error("JPEG não suportado.");
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maxDimension ||
    height > maxDimension ||
    width * height > maxPixels
  )
    throw Error("Dimensões de imagem fora do limite.");
  return { width, height };
}

/** Only an EXIF orientation that rotates the axes may explain swapped decoder dimensions. */
function exifSwapsAxes(bytes:Uint8Array):boolean {
  try {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length<8)return false;
    const little=bytes[0]===0x49&&bytes[1]===0x49;
    if(!little&&!(bytes[0]===0x4d&&bytes[1]===0x4d)||view.getUint16(2,little)!==42)return false;
    const start=view.getUint32(4,little);if(start<8||start>bytes.length-2)return false;
    const count=view.getUint16(start,little),end=start+2+count*12;if(count>4096||end>bytes.length-4)return false;
    let orientation:number|null=null;
    for(let offset=start+2;offset<end;offset+=12){
      if(view.getUint16(offset,little)!==0x0112)continue;
      if(orientation!==null||view.getUint16(offset+2,little)!==3||view.getUint32(offset+4,little)!==1)return false;
      orientation=view.getUint16(offset+8,little);
    }
    return orientation!==null&&orientation>=5&&orientation<=8;
  }catch{return false;}
}

async function imageHasRotatedExif(blob:Blob):Promise<boolean>{
  if(blob.type==='image/png'){
    // Walk chunk headers without reading image data into memory; cap metadata and count.
    let offset=8;
    for(let count=0;count<4096&&offset<=blob.size-12;count++){
      const head=new Uint8Array(await blob.slice(offset,offset+8).arrayBuffer());if(head.length!==8)return false;
      const length=new DataView(head.buffer).getUint32(0),type=String.fromCharCode(...head.subarray(4));
      if(length>blob.size-offset-12)return false;
      if(type==='eXIf')return length<=256*1024&&exifSwapsAxes(new Uint8Array(await blob.slice(offset+8,offset+8+length).arrayBuffer()));
      if(type==='IEND')return false;
      offset+=length+12;
    }
    return false;
  }
  if(blob.type==='image/jpeg'){
    const bytes=new Uint8Array(await blob.slice(0,256*1024).arrayBuffer()),view=new DataView(bytes.buffer);let offset=2;
    while(offset+4<bytes.length){
      if(bytes[offset++]!==255)return false;while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===0xd9||marker===0xda)return false;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
      if(offset+2>bytes.length)return false;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)return false;
      if(marker===0xe1&&length>=8&&[69,120,105,102,0,0].every((value,index)=>bytes[offset+2+index]===value))return exifSwapsAxes(bytes.subarray(offset+8,offset+length));
      offset+=length;
    }
  }
  return false;
}

/** Raw header limits are checked first; rendered dimensions must agree, including valid EXIF rotation. */
export async function studioImageDimensionsMatch(blob:Blob,raw:{width:number;height:number},decoded:{width:number;height:number}):Promise<boolean>{
  if(decoded.width===raw.width&&decoded.height===raw.height)return true;
  return decoded.width===raw.height&&decoded.height===raw.width&&await imageHasRotatedExif(blob);
}

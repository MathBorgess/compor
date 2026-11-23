type ZipEntry = Readonly<{name: string; file: Blob}>;

const ZIP32_LIMIT = 0xffff_ffff;
const UINT16_LIMIT = 0xffff;
const UTF8_NAMES = 0x0800;
const DOS_DATE = 0x21; // 1980-01-01, the first date supported by ZIP.

const crcTable = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) ? (value >>> 1) ^ 0xedb8_8320 : value >>> 1;
  }
  return value;
});

function crc32(buffer: ArrayBuffer) {
  let crc = ZIP32_LIMIT;
  for (const byte of new Uint8Array(buffer)) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ ZIP32_LIMIT) >>> 0;
}

/** Store already compressed PNGs without recompressing or changing their bytes. */
export async function createStudioZip(entries: readonly ZipEntry[], isCurrent: () => boolean): Promise<Blob | null> {
  if (!entries.length || entries.length >= UINT16_LIMIT) throw Error('Quantidade de arquivos inválida para ZIP.');

  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const directoryParts: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;

  for (const {name, file} of entries) {
    if (!isCurrent()) return null;
    const filename = encoder.encode(name);
    if (!filename.length || filename.length > UINT16_LIMIT || file.size >= ZIP32_LIMIT || offset + 30 + filename.length + file.size >= ZIP32_LIMIT) {
      throw Error('Um arquivo ultrapassa o limite do ZIP.');
    }
    const crc = crc32(await file.arrayBuffer());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x0403_4b50, true);
    local.setUint16(4, 20, true); // ZIP 2.0, stored (method 0).
    local.setUint16(6, UTF8_NAMES, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.size, true);
    local.setUint32(22, file.size, true);
    local.setUint16(26, filename.length, true);
    localParts.push(local.buffer, filename, file);

    const directory = new DataView(new ArrayBuffer(46));
    directory.setUint32(0, 0x0201_4b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, UTF8_NAMES, true);
    directory.setUint16(14, DOS_DATE, true);
    directory.setUint32(16, crc, true);
    directory.setUint32(20, file.size, true);
    directory.setUint32(24, file.size, true);
    directory.setUint16(28, filename.length, true);
    directory.setUint32(42, offset, true);
    directoryParts.push(directory.buffer, filename);

    offset += local.byteLength + filename.length + file.size;
    directorySize += directory.byteLength + filename.length;
  }

  if (!isCurrent()) return null;
  const end = new DataView(new ArrayBuffer(22));
  if (offset + directorySize + end.byteLength >= ZIP32_LIMIT) throw Error('O conjunto ultrapassa o limite do ZIP.');
  end.setUint32(0, 0x0605_4b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...localParts, ...directoryParts, end.buffer], {type: 'application/zip'});
}

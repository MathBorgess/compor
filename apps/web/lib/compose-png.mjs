const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ALLOWED_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'sRGB', 'pHYs', 'cHRM', 'sBIT']);
let composing = false;

function validateChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 8, count = 0, hasData = false;
  while (position + 12 <= bytes.length && ++count <= 4096) {
    const length = view.getUint32(position);
    if (length > bytes.length - position - 12) throw new Error('PNG inválido.');
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    if (!ALLOWED_CHUNKS.has(type) || (type === 'IHDR' && (position !== 8 || length !== 13))) throw new Error('PNG com metadados não suportados.');
    const exact = { gAMA: 4, sRGB: 1, pHYs: 9, cHRM: 32 };
    if ((type in exact && length !== exact[type]) || (type === 'PLTE' && (length < 3 || length > 768 || length % 3 !== 0)) ||
        (type === 'tRNS' && length > 256) || (type === 'sBIT' && (length < 1 || length > 4))) throw new Error('PNG inválido.');
    if (type === 'IDAT') hasData = true;
    position += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || !hasData || position !== bytes.length) throw new Error('PNG inválido.');
      return;
    }
  }
  throw new Error('PNG inválido.');
}

/** Legacy callers receive the validated artwork without text composition. */
export async function composePng({ base }) {
  if (composing) throw new Error('Aguarde a composição anterior terminar.');
  composing = true;
  try { return await composePngOnce({ base }); }
  finally { composing = false; }
}

async function composePngOnce({ base }) {
  if (!(base instanceof Blob) || base.size < 24 || base.size > MAX_INPUT_BYTES) throw new Error('Imagem inválida ou muito grande.');
  const bytes = new Uint8Array(await base.slice(0, 24).arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte) || bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('A base deve ser PNG.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = header.getUint32(16), height = header.getUint32(20);
  if (width < 64 || height < 64 || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error('Dimensões da imagem fora do limite.');
  validateChunks(new Uint8Array(await base.arrayBuffer()));
  let image;
  try { image = await createImageBitmap(base); } catch { throw new Error('PNG inválido.'); }
  try {
    if (image.width !== width || image.height !== height) throw new Error('Dimensões da imagem inconsistentes.');
    return base;
  } finally { image.close(); }
}

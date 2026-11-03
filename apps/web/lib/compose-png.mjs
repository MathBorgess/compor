const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function validateText(value, maxLength) {
  if (typeof value !== 'string' || [...value].length > maxLength || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error('Texto inválido.');
  return value;
}

/** Browser-only composition. Input data and editable fields are never mutated or stored. */
export async function composePng({ base, headline, price, date }) {
  const labels = [validateText(headline, 180), validateText(price, 50), validateText(date, 50)];
  if (!(base instanceof Blob) || base.size < 24 || base.size > MAX_INPUT_BYTES) throw new Error('Imagem inválida ou muito grande.');
  const bytes = new Uint8Array(await base.slice(0, 24).arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte) || bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('A base deve ser PNG.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = header.getUint32(16), height = header.getUint32(20);
  if (width < 64 || height < 64 || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error('Dimensões da imagem fora do limite.');
  let image;
  try { image = await createImageBitmap(base); } catch { throw new Error('PNG inválido.'); }
  try {
    if (image.width !== width || image.height !== height) throw new Error('Dimensões da imagem inconsistentes.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Composição indisponível.');
    context.drawImage(image, 0, 0);
    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(0, height * 0.59, width, height * 0.41);
    context.fillStyle = '#ffffff';
    context.textBaseline = 'middle';
    const x = width * 0.06, maxWidth = width * 0.88;
    for (const [i, label] of labels.entries()) {
      let size = height * (i === 0 ? 0.065 : 0.055);
      const minimum = height * 0.028;
      context.font = `600 ${size}px sans-serif`;
      while (context.measureText(label).width > maxWidth && size > minimum) {
        size = Math.max(minimum, size - 1);
        context.font = `600 ${size}px sans-serif`;
      }
      if (context.measureText(label).width > maxWidth) throw new Error('Texto muito longo para a peça.');
      context.fillText(label, x, height * [0.69, 0.82, 0.93][i]);
    }
    const output = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar PNG.')), 'image/png'));
    if (output.size > MAX_OUTPUT_BYTES) throw new Error('PNG resultante muito grande.');
    return output;
  } finally { image.close(); }
}

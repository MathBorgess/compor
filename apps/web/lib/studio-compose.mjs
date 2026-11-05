import { studioImageDimensions } from './studio-image.mjs';

export async function composeStudioPng({ base } = {}) {
  if (!(base instanceof Blob) || !['image/png', 'image/jpeg'].includes(base.type) || !base.size || base.size > 8 * 1024 * 1024) {
    throw new Error('Gere uma arte ou selecione uma imagem antes de preparar o PNG.');
  }
  const dimensions = await studioImageDimensions(base, { maxDimension: 4096, maxPixels: 16_777_216 });
  if (base.type === 'image/png') return base;
  const bitmap = await createImageBitmap(base);
  try {
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) throw new Error('Dimensões de imagem inválidas.');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Conversão de imagem indisponível.');
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar o PNG.')), 'image/png'));
    if (png.size > 8 * 1024 * 1024) throw new Error('O PNG excede 8 MB.');
    return png;
  } finally { bitmap.close(); }
}

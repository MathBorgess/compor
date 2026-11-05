export const ARTWORK_TRANSPORT_BYTES = 2 * 1024 * 1024;

export function artworkImageBudgets(sizes: readonly number[]): number[] {
  let remaining = ARTWORK_TRANSPORT_BYTES, count = sizes.length;
  const budgets = [...sizes];
  for (const {size, index} of sizes.map((size, index) => ({size, index})).sort((a, b) => a.size - b.size)) {
    const budget = Math.min(size, Math.floor(remaining / count));
    budgets[index] = budget;
    remaining -= budget;
    count--;
  }
  return budgets;
}

export async function copyArtworkForTransport(file: Blob, maxBytes: number) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('2d');
    if (!context) throw Error('Não foi possível preparar a cópia desta imagem.');
    let width = bitmap.width, height = bitmap.height;
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      let lastSize = 0;
      for (const quality of [0.92, 0.78, 0.62, 0.45]) {
        const copy = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
          if (blob?.type === 'image/jpeg') resolve(blob);
          else reject(Error('Não foi possível preparar a cópia JPEG.'));
        }, 'image/jpeg', quality));
        if (copy.size <= maxBytes) return {file: copy, width, height};
        lastSize = copy.size;
      }
      const scale = Math.max(0.5, Math.min(0.85, Math.sqrt(maxBytes / lastSize) * 0.9));
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    }
    throw Error('A cópia ainda excede o limite. Use menos referências nesta geração.');
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

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

const WIDTH = 1080,
  HEIGHT = 1350;
const text = (value, max) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw Error("Texto inválido.");
  return value;
};
export async function composeStudioPng({
  base = null,
  content,
  cropY = 0.5,
} = {}) {
  const headline = text(content?.headline ?? "", 500),
    price = text(content?.price ?? "", 100),
    date = text(content?.date ?? "", 100);
  if (!Number.isFinite(cropY) || cropY < 0 || cropY > 1)
    throw Error("Enquadramento inválido.");
  let bitmap;
  if (base !== null) {
    if (
      !(base instanceof Blob) ||
      !["image/png", "image/jpeg"].includes(base.type) ||
      base.size > 8 * 1024 * 1024 ||
      !base.size
    )
      throw Error("Use PNG ou JPEG de até 8 MB.");
    try {
      bitmap = await createImageBitmap(base);
    } catch {
      throw Error("Não foi possível abrir a imagem.");
    }
    if (
      bitmap.width < 64 ||
      bitmap.height < 64 ||
      bitmap.width > 4096 ||
      bitmap.height > 4096
    ) {
      bitmap.close();
      throw Error("Dimensões de imagem fora do limite.");
    }
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Composição indisponível.");
    ctx.fillStyle = "#f4f0e5";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (bitmap) {
      const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height),
        sw = WIDTH / scale,
        sh = HEIGHT / scale;
      ctx.drawImage(
        bitmap,
        (bitmap.width - sw) / 2,
        (bitmap.height - sh) * cropY,
        sw,
        sh,
        0,
        0,
        WIDTH,
        HEIGHT,
      );
      const gradient = ctx.createLinearGradient(0, HEIGHT * 0.3, 0, HEIGHT);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = bitmap ? "#ffffff" : "#123eab";
    ctx.textBaseline = "top";
    ctx.font = "700 76px sans-serif";
    const lines = [];
    let line = "";
    for (const word of headline.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(word).width > 936)
        throw Error("Há uma palavra longa demais para a arte.");
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 936) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > 6) throw Error("Reduza o título para caber na arte.");
    const startY = Math.max(100, 1040 - lines.length * 90);
    lines.forEach((part, i) => ctx.fillText(part, 72, startY + i * 90));
    ctx.font = "600 42px sans-serif";
    for (const [label, y] of [
      [price, 1152],
      [date, 1220],
    ]) {
      if (ctx.measureText(label).width > 936)
        throw Error("Reduza preço ou data para caber na arte.");
      ctx.fillText(label, 72, y);
    }
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(Error("Falha ao exportar.")),
        "image/png",
      ),
    );
    if (blob.size > 8 * 1024 * 1024)
      throw Error("A arte exportada excede 8 MB.");
    return blob;
  } finally {
    bitmap?.close();
  }
}

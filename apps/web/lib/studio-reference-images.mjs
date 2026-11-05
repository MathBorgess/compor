import { studioImageDimensions } from "./studio-image.mjs";
/** Small visual context for the current operation; originals remain in IndexedDB. */
export async function referenceImagesForRequest(references, load) {
  if (
    !Array.isArray(references) ||
    references.length > 20 ||
    typeof load !== "function"
  )
    throw Error("Referências inválidas.");
  const result = [];
  let total = 0;
  for (const reference of references) {
    const stored = await load(reference.id);
    const file = stored?.file;
    if (
      !(file instanceof Blob) ||
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      throw Error("Não foi possível abrir uma referência local.");
    await studioImageDimensions(file);
    const image = await createImageBitmap(file);
    try {
      if (image.width * image.height > 40_000_000)
        throw Error("Referência fora dos limites.");
      let size = 512,
        blob;
      do {
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw Error("Imagem indisponível.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.7),
        );
        size = Math.floor(size / 2);
      } while (blob && blob.size > 35 * 1024 && size >= 64);
      if (!blob || blob.size > 35 * 1024)
        throw Error("Não foi possível preparar uma referência.");
      total += blob.size;
      if (total > 1024 * 1024)
        throw Error("As referências excederam o limite desta mensagem.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("Referência indisponível."));
        reader.readAsDataURL(blob);
      });
      const encoded = String(data).split(",")[1];
      if (
        result.reduce((n, item) => n + item.data.length, 0) + encoded.length >
        1_000_000
      )
        throw Error("As referências excederam o limite desta mensagem.");
      result.push({ id: reference.id, mime: "image/jpeg", data: encoded });
    } finally {
      image.close();
    }
  }
  return result;
}

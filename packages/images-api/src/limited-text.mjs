export async function limitedText(stream, limit) {
  if (!stream) throw new Error('missing body');
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('body too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

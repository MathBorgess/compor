const MAX_REQUEST = 16 * 1024;
const MAX_RESPONSE = 12 * 1024 * 1024;
const endpoint = 'https://api.openai.com/v1/images/generations';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function json(data, status) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function limitedText(stream, limit) {
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

/** Unwired HTTP adapter. Identity and operation-level authorization belong to the caller. */
export function createImageHandler({ authenticate, fetch: fetchApi = globalThis.fetch } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('authenticate is required');
  return async request => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      if (!(await authenticate(request))?.userId) return json({ error: 'unauthorized' }, 401);
    } catch { return json({ error: 'unauthorized' }, 401); }
    let body;
    try { body = JSON.parse(await limitedText(request.body, MAX_REQUEST)); }
    catch { return json({ error: 'invalid_request' }, 400); }
    if (!body || typeof body.apiKey !== 'string' || !/^sk-[^\s]{20,300}$/.test(body.apiKey) ||
        body.authorizeGeneration !== true || typeof body.prompt !== 'string' || !body.prompt.trim() ||
        body.prompt.length > 4000 || body.prompt.includes(body.apiKey)) return json({ error: 'invalid_request' }, 400);
    try {
      const response = await fetchApi(endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${body.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2.5-flare', prompt: `Crie a imagem base sem texto, letras ou números. ${body.prompt}`, size: '1024x1024', quality: 'auto', output_format: 'png', n: 1 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status === 401 || response.status === 403) return json({ error: 'openai_credentials_rejected' }, response.status);
      if (!response.ok) return json({ error: 'generation_result_unknown', retryAutomatically: false }, 502);
      const result = JSON.parse(await limitedText(response.body, MAX_RESPONSE));
      const image = result?.data?.[0]?.b64_json;
      if (typeof image !== 'string' || image.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(image)) throw new Error('invalid image');
      const pad = image.indexOf('=');
      if ((pad !== -1 && (pad < image.length - 2 || !/^={1,2}$/.test(image.slice(pad)))) ||
          !Buffer.from(image, 'base64').subarray(0, 8).equals(pngSignature)) throw new Error('invalid image');
      const fields = ['input_tokens', 'output_tokens', 'total_tokens'];
      const safe = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
      const counts = Object.fromEntries(fields.map(field => [field, safe(result?.usage?.[field])]));
      const inputDetails = Object.fromEntries(['text_tokens','image_tokens'].map(field=>[field,safe(result?.usage?.input_tokens_details?.[field])]));
      const outputDetails = {image_tokens:safe(result?.usage?.output_tokens_details?.image_tokens)};
      const hasInput=Object.values(inputDetails).some(value=>value!==null), hasOutput=outputDetails.image_tokens!==null;
      const usage = fields.some(field => counts[field] !== null) || hasInput || hasOutput ? {...counts,...(hasInput?{input_tokens_details:inputDetails}:{}),...(hasOutput?{output_tokens_details:outputDetails}:{})} : null;
      return json({ imageBase64: image, mediaType: 'image/png', usage }, 200);
    } catch {
      return json({ error: 'generation_result_unknown', retryAutomatically: false }, 502);
    }
  };
}

import { reviewImageCandidate } from './image-candidate-review.mjs';
import { limitedText } from './limited-text.mjs';
import { pngSignature, validGeneratedPng } from './generated-png.mjs';
export { createOpenAiImageCandidateReviewer } from './openai-image-review.mjs';

const MAX_REQUEST = 3 * 1024 * 1024;
const MAX_RESPONSE = 12 * 1024 * 1024;
const endpoint = 'https://api.openai.com/v1/images';
const MAX_INPUT_IMAGES_BYTES = 2 * 1024 * 1024;
export const SUPPORTED_IMAGE_SIZES = Object.freeze(['1024x1280', '864x1536']);

function json(data, status) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

// A finished HTTP error is not a lost response. 400 closes as refusal.
// 429 is retryable and still not generated. 5xx is retryable and unconfirmed.
// Timeouts throw and stay unknown in the catch below.
export function classifiedProviderFailure(status) {
  if (status === 401 || status === 403 || status === 408) return null;
  if (status === 429) return { status: 429, body: { error: 'generation_not_produced', closureReason: 'provider_rejected_429', providerOutcome: 'retryable', retryAutomatically: false } };
  if (status >= 500) return { status: 503, body: { error: 'generation_not_produced', closureReason: 'result_unknown', providerOutcome: 'retryable', retryAutomatically: false } };
  if (status >= 400) return { status: 400, body: { error: 'generation_not_produced', closureReason: 'provider_rejected_400', providerOutcome: 'failure', retryAutomatically: false } };
  return null;
}

function imageInputs(value = []) {
  if (!Array.isArray(value) || value.length > 21) throw Error('invalid images');
  let total = 0;
  return value.map(image => {
    if (!image || Object.keys(image).sort().join(',') !== 'data,mime' || !['image/png', 'image/jpeg'].includes(image.mime) || typeof image.data !== 'string' || image.data.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw Error('invalid image');
    const bytes = Buffer.from(image.data, 'base64');
    total += bytes.length;
    if (bytes.toString('base64') !== image.data || total > MAX_INPUT_IMAGES_BYTES ||
        (image.mime === 'image/png' ? !bytes.subarray(0, 8).equals(pngSignature) : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) throw Error('invalid image');
    return {bytes, mime: image.mime};
  });
}

/** Internal HTTP adapter. Identity and operation-level authorization belong to the caller. */
export function createImageHandler({ authenticate, fetch: fetchApi = globalThis.fetch, reviewCandidate, profile = 'artwork' } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('authenticate is required');
  if (reviewCandidate !== undefined && typeof reviewCandidate !== 'function') throw new TypeError('invalid image candidate reviewer');
  if (!['artwork', 'reference'].includes(profile)) throw new TypeError('invalid image profile');
  return async (request, { authorizeReview, requiredText } = {}) => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      if (!(await authenticate(request))?.userId) return json({ error: 'unauthorized' }, 401);
    } catch { return json({ error: 'unauthorized' }, 401); }
    let body;
    try { body = JSON.parse(await limitedText(request.body, MAX_REQUEST)); }
    catch { return json({ error: 'invalid_request' }, 400); }
    if (!body || typeof body.apiKey !== 'string' || !/^sk-[^\s]{20,300}$/.test(body.apiKey) ||
        body.authorizeGeneration !== true || typeof body.prompt !== 'string' || !body.prompt.trim() ||
        body.prompt.length > 8000 || body.prompt.includes(body.apiKey)) return json({ error: 'invalid_request' }, 400);
    if (reviewCandidate && requiredText !== undefined && (!Array.isArray(requiredText) || requiredText.length > 23
      || !Array.from(requiredText).every(text => typeof text === 'string' && text.length <= 500
        && text.trim() && text.isWellFormed() && !text.includes(body.apiKey)))) return json({ error: 'invalid_request' }, 400);
    const size = body.size === undefined ? '1024x1280' : body.size;
    if (typeof size !== 'string' || !SUPPORTED_IMAGE_SIZES.includes(size)) return json({ error: 'invalid_request' }, 400);
    let images;
    try { images = imageInputs(body.images); } catch { return json({ error: 'invalid_request' }, 400); }
    try {
      const options = profile === 'reference'
        ? {model: 'gpt-image-2.6-flare', prompt: body.prompt, size: size === '864x1536' ? '720x1280' : '768x960', quality: 'low', complexity: 'low', output_format: 'png', n: 1}
        : {model: 'gpt-image-2.6-flare', prompt: body.prompt, size, quality: 'auto', output_format: 'png', n: 1};
      let payload, headers = {Authorization: `Bearer ${body.apiKey}`};
      if (images.length) {
        payload = new FormData();
        for (const [name, value] of Object.entries(options)) payload.set(name, String(value));
        images.forEach(({bytes, mime}, index) => payload.append('image[]', new Blob([bytes], {type: mime}), `reference-${index + 1}.${mime === 'image/png' ? 'png' : 'jpg'}`));
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(options);
      }
      const response = await fetchApi(`${endpoint}/${images.length ? 'edits' : 'generations'}`, {
        method: 'POST', headers, body: payload,
        redirect: 'error', signal: AbortSignal.timeout(120_000),
      });
      if (response.status === 401 || response.status === 403) return json({ error: 'openai_credentials_rejected' }, response.status);
      const refused = classifiedProviderFailure(response.status);
      if (refused) return json(refused.body, refused.status);
      if (!response.ok) return json({ error: 'generation_result_unknown', retryAutomatically: false }, 502);
      const result = JSON.parse(await limitedText(response.body, MAX_RESPONSE));
      const image = result?.data?.[0]?.b64_json;
      if (typeof image !== 'string' || image.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(image)) throw new Error('invalid image');
      const bytes = Buffer.from(image, 'base64');
      if (bytes.toString('base64') !== image || !await validGeneratedPng(bytes)) throw new Error('invalid image');
      const fields = ['input_tokens', 'output_tokens', 'total_tokens'];
      const safe = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
      const counts = Object.fromEntries(fields.map(field => [field, safe(result?.usage?.[field])]));
      const inputDetails = Object.fromEntries(['text_tokens','image_tokens'].map(field=>[field,safe(result?.usage?.input_tokens_details?.[field])]));
      const outputDetails = {image_tokens:safe(result?.usage?.output_tokens_details?.image_tokens)};
      const hasInput=Object.values(inputDetails).some(value=>value!==null), hasOutput=outputDetails.image_tokens!==null;
      const usage = fields.some(field => counts[field] !== null) || hasInput || hasOutput ? {...counts,...(hasInput?{input_tokens_details:inputDetails}:{}),...(hasOutput?{output_tokens_details:outputDetails}:{})} : null;
      const candidate = { imageBase64: image, mediaType: 'image/png' };
      if (reviewCandidate) {
        const reviewInput = { ...candidate, prompt: body.prompt, ...(requiredText?.length ? { requiredText } : {}) };
        const decision = await reviewImageCandidate(reviewCandidate, reviewInput, request.signal, authorizeReview);
        if (decision === 'reject') return json({ error: 'image_quality_rejected', retryAutomatically: false, usage }, 422);
        if (decision !== 'approve') return json({ error: 'image_quality_inconclusive', retryAutomatically: false, usage }, 503);
      }
      return json({ ...candidate, usage }, 200);
    } catch {
      return json({ error: 'generation_result_unknown', retryAutomatically: false }, 502);
    }
  };
}

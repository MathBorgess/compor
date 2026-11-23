import {z} from 'zod';
import {sha256Hex} from './browser-bytes.ts';

const MAX_REQUEST_BYTES = 32 * 1024;
const diagram = z.union([
  z.string(),
  z.strictObject({
    type: z.string(),
    labels: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
    sample: z.string().optional(),
  }),
]);
const slide = z.strictObject({
  id: z.string(),
  layout: z.string(),
  polarity: z.string().optional(),
  headline: z.string(),
  body: z.string().optional(),
  kicker: z.string().optional(),
  listItems: z.array(z.string()).optional(),
  source: z.string().optional(),
  alt: z.string(),
  accentPhrase: z.string().optional(),
  diagram: diagram.optional(),
  figure: z.string().optional(),
  bridge: z.string().optional(),
});
const requestSchema = z.strictObject({
  projectId: z.uuid(),
  plan: z.strictObject({
    mode: z.string(),
    slides: z.array(slide),
    tokens: z.strictObject({
      light: z.string().optional(),
      dark: z.string().optional(),
      accent: z.string().optional(),
    }).optional(),
    caption: z.string().optional(),
  }),
});

type ReadResult =
  | {ok: true; projectId: string; plan: unknown; planSha256: string}
  | {ok: false; status: 400; error: 'invalid_request'}
  | {ok: false; status: 413; error: 'request_too_large'}
  | {ok: false; status: 415; error: 'unsupported_media_type'};

const invalidRequest = {ok: false, status: 400, error: 'invalid_request'} as const;
const requestTooLarge = {ok: false, status: 413, error: 'request_too_large'} as const;

export async function readCarouselRenderRequest(request: Request): Promise<ReadResult> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') return {ok: false, status: 415, error: 'unsupported_media_type'};
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) return requestTooLarge;
  if (!request.body) return invalidRequest;

  let raw: unknown;
  try {
    const bytes = new Uint8Array(MAX_REQUEST_BYTES);
    const reader = request.body.getReader();
    let length = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        if (length + value.byteLength > bytes.byteLength) {
          void reader.cancel().catch(() => {});
          return requestTooLarge;
        }
        bytes.set(value, length);
        length += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    raw = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, length)));
  } catch {
    return invalidRequest;
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return invalidRequest;
  const {projectId, plan} = parsed.data;

  // Hash the UTF-8 JSON of the plan alone, sorting object keys by UTF-16 code
  // units at every level. Array order and the original string values are kept.
  const canonicalPlan = JSON.stringify(plan, (_key: string, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(fields).sort().map(key => [key, fields[key]]));
  });
  return {ok: true, projectId: projectId.toLowerCase(), plan, planSha256: await sha256Hex(canonicalPlan)};
}

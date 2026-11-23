import {z} from 'zod';
import {allowsCarouselSemanticDiagram} from '@compor/agents-api/studio-chat-tools';
import {sha256Hex} from './browser-bytes.ts';
import {carouselPlanJson} from './carousel-plan-json.ts';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_MULTIPART_BYTES = 4 * 1024 * 1024;
const ART_PART = /^art:([A-Za-z0-9_-]{1,64})$/;
const RASTER_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
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
  artSha256: z.string().length(64).regex(/^[a-f0-9]{64}$/).optional(),
}).refine(slide => allowsCarouselSemanticDiagram(slide.diagram, slide.layout, slide.artSha256 !== undefined));
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

type ReadFailure =
  | {ok: false; status: 400; error: 'invalid_request'}
  | {ok: false; status: 413; error: 'request_too_large'}
  | {ok: false; status: 415; error: 'unsupported_media_type'};

type ReadResult = ReadFailure | {
  ok: true;
  projectId: string;
  plan: z.infer<typeof requestSchema>['plan'];
  planSha256: string;
  artFiles?: ReadonlyMap<string, File>;
};

const invalidRequest = {ok: false, status: 400, error: 'invalid_request'} as const;
const requestTooLarge = {ok: false, status: 413, error: 'request_too_large'} as const;

async function readBoundedBody(body: ReadableStream<Uint8Array>, limit: number) {
  const bytes = new Uint8Array(limit);
  const reader = body.getReader();
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) return bytes.subarray(0, length);
      if (length + value.byteLength > limit) {
        void reader.cancel().catch(() => {});
        return undefined;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

async function readMultipart(bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<ReadFailure | {
  ok: true; json: string; artFiles: Map<string, File>;
}> {
  const form = await new Response(bytes, {headers: {'content-type': contentType}}).formData();
  const artFiles = new Map<string, File>();
  let json: string | undefined;

  for (const [name, value] of form) {
    if (name === 'request') {
      if (json !== undefined || typeof value !== 'string') return invalidRequest;
      json = value;
      continue;
    }
    const slideId = ART_PART.exec(name)?.[1];
    if (!slideId || typeof value === 'string' || !RASTER_MIME.has(value.type) || !value.size ||
        artFiles.has(slideId) || artFiles.size >= 10) return invalidRequest;
    artFiles.set(slideId, value);
  }

  if (json === undefined) return invalidRequest;
  if (Buffer.byteLength(json, 'utf8') > MAX_REQUEST_BYTES) return requestTooLarge;
  return {ok: true, json, artFiles};
}

export async function readCarouselRenderRequest(request: Request): Promise<ReadResult> {
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  const multipart = mediaType === 'multipart/form-data';
  if (!multipart && mediaType !== 'application/json') return {ok: false, status: 415, error: 'unsupported_media_type'};
  const limit = multipart ? MAX_MULTIPART_BYTES : MAX_REQUEST_BYTES;
  if (Number(request.headers.get('content-length')) > limit) return requestTooLarge;
  if (!request.body) return invalidRequest;

  let raw: unknown;
  let artFiles: Map<string, File> | undefined;
  try {
    const bytes = await readBoundedBody(request.body, limit);
    if (!bytes) return requestTooLarge;
    if (multipart) {
      const parts = await readMultipart(bytes, contentType);
      if (!parts.ok) return parts;
      raw = JSON.parse(parts.json);
      artFiles = parts.artFiles;
    } else {
      raw = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    }
  } catch {
    return invalidRequest;
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return invalidRequest;
  const {projectId, plan} = parsed.data;
  if (artFiles && new Set(plan.slides.map(slide => slide.id)).size !== plan.slides.length) return invalidRequest;
  const artSlides = plan.slides.filter(slide => slide.artSha256 !== undefined);
  if (artSlides.length !== (artFiles?.size ?? 0) || artSlides.some(slide => !artFiles?.has(slide.id))) return invalidRequest;

  return {
    ok: true, projectId: projectId.toLowerCase(), plan,
    planSha256: await sha256Hex(carouselPlanJson(plan)),
    ...(artFiles?.size ? {artFiles} : {}),
  };
}

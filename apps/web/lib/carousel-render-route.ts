import { createHash } from 'node:crypto';

import { renderDeckInMemory, validateDeck } from '@compor/carousel-renderer';
import type { Actor } from './agent-auth.ts';
import { readCarouselRenderRequest } from './carousel-render-request.ts';
import { CarouselRuntimeError, withCarouselRuntime } from './carousel-runtime.ts';
import { createStudioZip } from './studio-zip.ts';

const MAX_ZIP_BYTES = 4 * 1024 * 1024;
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: privateHeaders });
type Result = Awaited<ReturnType<typeof renderDeckInMemory>>;
type Dependencies = {
  appOrigin: string;
  resolveActor: () => Promise<Actor | null>;
  ownsProject: (actor: Actor, projectId: string) => Promise<boolean>;
  render?: (plan: unknown, signal: AbortSignal) => Promise<Result>;
};

type ReadInput = Extract<Awaited<ReturnType<typeof readCarouselRenderRequest>>, { ok: true }>;

async function verifiedRasterPlan({ plan, artFiles }: ReadInput, signal: AbortSignal) {
  if (!artFiles) return plan;
  const slides = [];
  for (const slide of plan.slides) {
    signal.throwIfAborted();
    const file = artFiles.get(slide.id);
    if (!file) {
      slides.push(slide);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== slide.artSha256) return null;
    // The renderer verifies the advertised format and decodes/re-encodes the
    // raster with Sharp before giving Chromium a normalized PNG.
    slides.push({ ...slide, art: `data:${file.type};base64,${bytes.toString('base64')}` });
  }
  return { ...plan, slides };
}

function renderCarousel(plan: unknown, requestSignal: AbortSignal) {
  return withCarouselRuntime(({ signal, ...runtime }) =>
    renderDeckInMemory(plan, { ...runtime, signal: AbortSignal.any([signal, requestSignal]) }));
}

function jsonFile(value: unknown) {
  return new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
}

async function exportCarousel({ profile, slides, checks, artifacts, caption, altTexts }: Result, planSha256: string, request: Request) {
  const failed = [
    ...checks.filter(check => check.status === 'fail'),
    ...slides.flatMap(slide => slide.checks.filter(check => check.status === 'fail').map(check => ({ ...check, index: slide.index }))),
  ];
  const firstPass = slides.map(({ id, index, firstChecks, checks: finalChecks }) => ({ id, index, checks: firstChecks ?? finalChecks }));
  const manifest = {
    profile, planSha256, assessment: 'physical_only',
    first_pass: { slides: firstPass, checks },
    final: { slides: slides.map(({ data: _data, firstChecks: _firstChecks, ...slide }) => slide), checks },
    first_pass_yield: slides.length > 0 && checks.every(check => check.status === 'pass') &&
      firstPass.every(slide => slide.checks.every(check => check.status === 'pass')) ? 1 : 0,
    repair_count: slides.reduce((count, slide) => count + (slide.repairs?.length ?? 0), 0),
    artifacts: artifacts.map(({ data: _data, ...artifact }) => artifact),
  };
  if (failed.length) return reply({ error: 'quality_held', checks: failed, manifest }, 422);

  const panels = slides.flatMap(({ file, data }) => file && data ? [{ name: file, file: new Blob([new Uint8Array(data)], { type: 'image/jpeg' }) }] : []);
  if (panels.length < 3 || panels.length !== slides.length || altTexts?.length !== panels.length) {
    return reply({ error: 'incomplete_composition' }, 503);
  }
  const entries = [
    ...panels,
    { name: 'legenda.txt', file: new Blob([caption ?? ''], { type: 'text/plain;charset=utf-8' }) },
    { name: 'alt-text.json', file: jsonFile(altTexts) },
    { name: 'qa-manifest.json', file: jsonFile(manifest) },
    ...artifacts.map(({ file, data }) => ({ name: file, file: new Blob([new Uint8Array(data)]) })),
  ];
  if (entries.reduce((bytes, entry) => bytes + entry.file.size, 0) >= MAX_ZIP_BYTES) return reply({ error: 'archive_too_large' }, 422);
  if (request.headers.get('accept') === 'multipart/form-data') {
    const form = new FormData();
    for (const { name, file } of entries) form.append(name, file, name);
    const response = new Response(form, { headers: privateHeaders });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_ZIP_BYTES) return reply({ error: 'archive_too_large' }, 422);
    request.signal.throwIfAborted();
    response.headers.set('Content-Length', String(bytes.byteLength));
    return new Response(bytes, { headers: response.headers });
  }
  const archive = await createStudioZip(entries, () => !request.signal.aborted);
  if (!archive) return reply({ error: 'request_aborted' }, 499);
  if (archive.size > MAX_ZIP_BYTES) return reply({ error: 'archive_too_large' }, 422);
  return new Response(archive, { headers: {
    ...privateHeaders,
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="carrossel.zip"',
    'Content-Length': String(archive.size),
  } });
}

export function createCarouselRenderRoute({ appOrigin, resolveActor, ownsProject, render = renderCarousel }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
    try {
      const actor = await resolveActor();
      if (!actor?.userId || !actor.token) return reply({ error: 'unauthorized' }, 401);
      const input = await readCarouselRenderRequest(request);
      if (!input.ok) return reply({ error: input.error }, input.status);
      if (!await ownsProject(actor, input.projectId)) return reply({ error: 'not_found' }, 404);

      const plan = await verifiedRasterPlan(input, request.signal);
      if (!plan) return reply({ error: 'invalid_request' }, 400);
      const checks = validateDeck(plan);
      if (checks.length) return reply({ error: 'invalid_plan', checks }, 422);
      request.signal.throwIfAborted();
      const result = await render(plan, request.signal);
      return await exportCarousel(result, input.planSha256, request);
    } catch (error) {
      if (request.signal.aborted) return reply({ error: 'request_aborted' }, 499);
      if (error instanceof CarouselRuntimeError) {
        return reply({ error: error.code }, error.code === 'carousel_renderer_busy' ? 429 : 503);
      }
      return reply({ error: 'unavailable' }, 503);
    }
  };
}

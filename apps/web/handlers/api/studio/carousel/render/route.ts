import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../../../lib/agent-auth.ts';
import { resolveAppOrigin } from '../../../../../lib/auth-config.ts';
import { createCarouselRenderRoute } from '../../../../../lib/carousel-render-route.ts';
import { allowsCarouselRuntimeDiagnostic, observeCarouselRuntime } from '../../../../../lib/carousel-runtime.ts';
import { authClient, authConfig } from '../../../../../lib/supabase.ts';

export const maxDuration = 90;

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (process.env.COMPOR_CAROUSEL_RENDER_ENABLED !== 'true') return Response.json({ error: 'not_found' }, { status: 404, headers });
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers });
  return createCarouselRenderRoute({
    appOrigin: config.app,
    resolveActor: async () => resolveSupabaseActor(await authClient(config)),
    ownsProject: (actor, projectId) => ownsSupabaseProject({ config, actor, projectId }),
  })(request);
}

const projectId = '11111111-1111-4111-8111-111111111111';
const otherProject = '99999999-9999-4999-8999-999999999999';
const actor = { userId: '63de811f-c75c-4571-968c-38a8b3f0accd', token: 'synthetic-diagnostic-identity' };
const plan = {
  mode: 'native_serial',
  caption: 'Fotos de café à luz da janela. #Fotografia',
  slides: [
    { id: 'capa', layout: 'hero_bleed', headline: 'Fotografe o café pela manhã', alt: 'Capa sobre fotografia de café.' },
    { id: 'metodo', layout: 'native_serial', headline: 'A janela suaviza as sombras', body: 'Aproxime a xícara da janela e deixe a luz entrar pela lateral.', alt: 'Sugestão de iluminação lateral.' },
    { id: 'final', layout: 'cta_closing', headline: 'Salve para a próxima fotografia', alt: 'Convite para salvar esta sequência.' },
  ],
};
const requiredFiles = new Set([
  'slide-01.jpg', 'slide-02.jpg', 'slide-03.jpg', 'legenda.txt', 'alt-text.json',
  'qa-manifest.json', 'contact-sheet.png', 'cover-grid.png',
]);
const rendererErrors = new Set([
  'carousel_renderer_unavailable', 'carousel_renderer_timeout', 'carousel_renderer_busy', 'unavailable',
]);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const response = (data: unknown, status: number) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
} });

function describeArchive(archive: Buffer) {
  if (archive.length <= 22 || archive.length >= 4 * 1024 * 1024) throw Error('invalid_archive');
  const members = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x0403_4b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameEnd = offset + 30 + archive.readUInt16LE(offset + 26);
    const start = nameEnd + archive.readUInt16LE(offset + 28);
    const end = start + size;
    if (end > archive.length || !size || archive.readUInt16LE(offset + 8) !== 0 ||
      archive.readUInt32LE(offset + 22) !== size) throw Error('invalid_archive');
    const name = archive.toString('utf8', offset + 30, nameEnd);
    const bytes = archive.subarray(start, end);
    if (!requiredFiles.has(name) || members.has(name) || crc32(bytes) !== archive.readUInt32LE(offset + 14)) {
      throw Error('invalid_archive');
    }
    members.set(name, bytes);
    offset = end;
  }
  const endDirectory = archive.length - 22;
  if (members.size !== requiredFiles.size || offset >= endDirectory || archive.readUInt32LE(offset) !== 0x0201_4b50 ||
    archive.readUInt32LE(endDirectory) !== 0x0605_4b50 || archive.readUInt16LE(endDirectory + 10) !== members.size ||
    archive.readUInt32LE(endDirectory + 16) !== offset || archive.readUInt32LE(endDirectory + 12) !== endDirectory - offset) {
    throw Error('invalid_archive');
  }
  if (members.get('legenda.txt')?.toString('utf8') !== plan.caption) throw Error('invalid_caption');
  const manifest = JSON.parse(members.get('qa-manifest.json')!.toString('utf8')) as {
    profile?: unknown; planSha256?: unknown; final?: { slides?: unknown }; artifacts?: unknown;
  };
  if (manifest.profile !== 'compor-carousel-jpeg-4x5.v1' || typeof manifest.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.planSha256) || !Array.isArray(manifest.final?.slides) ||
    !Array.isArray(manifest.artifacts) || manifest.final.slides.length !== 3 || manifest.artifacts.length !== 2) {
    throw Error('invalid_manifest');
  }
  const contents = Array.from(members, ([file, bytes]) => ({ file, bytes: bytes.length, sha256: digest(bytes) }));
  const byName = new Map(contents.map(file => [file.file, file]));
  for (const entry of [...manifest.final.slides, ...manifest.artifacts]) {
    const actual = byName.get(entry?.file);
    if (!actual || actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) throw Error('invalid_manifest');
    byName.delete(entry.file);
  }
  return {
    profile: manifest.profile, planSha256: manifest.planSha256,
    archive: { bytes: archive.length, sha256: digest(archive) }, contents,
  };
}

export async function GET(request: Request) {
  if (request.method !== 'GET' || !allowsCarouselRuntimeDiagnostic()) return response({ error: 'not_found' }, 404);
  const appOrigin = resolveAppOrigin();
  const url = new URL(request.url);
  if (!appOrigin || url.origin !== appOrigin || url.pathname !== '/api/studio/carousel/render' ||
    url.search !== '?canary=chromium-x64') return response({ error: 'not_found' }, 404);
  const started = performance.now();

  const invoke = (origin: string, token: string | null, project: string, precheck = true) => {
    const handler = createCarouselRenderRoute({
      appOrigin,
      resolveActor: async () => token === actor.token ? actor : null,
      ownsProject: async (verifiedActor, candidate) => verifiedActor === actor && candidate === projectId,
      ...(precheck && { render: async () => { throw Error('unexpected_render_during_precheck'); } }),
    });
    return handler(new Request(url, {
      method: 'POST', body: JSON.stringify({ projectId: project, plan }), signal: request.signal,
      headers: { Origin: origin, 'Content-Type': 'application/json' },
    }));
  };
  const [origin, auth, scope] = await Promise.all([
    invoke('https://invalid.example', actor.token, projectId),
    invoke(appOrigin, null, projectId),
    invoke(appOrigin, actor.token, otherProject),
  ]);
  const prechecks = { origin: origin.status, auth: auth.status, scope: scope.status };
  const runtime = () => ({ platform: process.platform, arch: process.arch, node: process.version, elapsedMs: Math.round(performance.now() - started) });
  if (origin.status !== 403 || auth.status !== 401 || scope.status !== 404) {
    return response({ status: 'precheck_failed', prechecks, runtime: runtime() }, 500);
  }
  const { value: rendered, failure: runtimeFailure } = await observeCarouselRuntime(() => invoke(appOrigin, actor.token, projectId, false));
  if (rendered.status !== 200 || rendered.headers.get('content-type') !== 'application/zip') {
    const result = await rendered.json().catch(() => null) as { error?: unknown } | null;
    const renderError = typeof result?.error === 'string' && rendererErrors.has(result.error) ? result.error : undefined;
    return response({ status: 'render_failed', renderStatus: rendered.status, renderError, runtimeFailure, prechecks, runtime: runtime() }, 503);
  }
  try {
    const zip = await rendered.arrayBuffer();
    return response({ status: 'pass', prechecks, runtime: runtime(), ...describeArchive(Buffer.from(zip)) }, 200);
  } catch {
    return response({ status: 'invalid_archive', prechecks, runtime: runtime() }, 503);
  }
}

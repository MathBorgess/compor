import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as httpsServer } from 'node:https';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { stopApp, waitForApp } from './wait-for-app.mjs';

const user = '63de811f-c75c-4571-968c-38a8b3f0accd';
const projectId = '11111111-1111-4111-8111-111111111111';
const otherProject = '99999999-9999-4999-8999-999999999999';
const token = 'mock-user-token';
const plan = {
  mode: 'native_serial',
  caption: 'Fotos de café à luz da janela. #Fotografia',
  slides: [
    { id: 'capa', layout: 'hero_bleed', headline: 'Fotografe o café pela manhã', alt: 'Capa sobre fotografia de café.' },
    { id: 'metodo', layout: 'native_serial', headline: 'A janela suaviza as sombras', body: 'Aproxime a xícara da janela e deixe a luz entrar pela lateral.', alt: 'Sugestão de iluminação lateral.' },
    { id: 'final', layout: 'cta_closing', headline: 'Salve para a próxima fotografia', alt: 'Convite para salvar esta sequência.' },
  ],
};

function storedMembers(archive) {
  const members = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(archive.readUInt16LE(offset + 8), 0);
    const nameLength = archive.readUInt16LE(offset + 26);
    const name = archive.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + archive.readUInt16LE(offset + 28);
    const end = start + archive.readUInt32LE(offset + 18);
    const file = archive.subarray(start, end);
    assert.equal(crc32(file), archive.readUInt32LE(offset + 14));
    assert.equal(members.has(name), false);
    members.set(name, file);
    offset = end;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  return members;
}

test('rota autenticada compõe o ZIP JPEG em Chromium e preserva os bytes do manifesto', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-carousel-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = join(directory, 'key.pem');
  const cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert,
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const requests = [];
  const service = httpsServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    const url = new URL(request.url, 'https://127.0.0.1');
    requests.push(request.method + ' ' + url.pathname);
    response.setHeader('content-type', 'application/json');
    if (request.headers.authorization !== 'Bearer ' + token) {
      response.statusCode = 401;
      return response.end('{}');
    }
    if (url.pathname === '/auth/v1/user') return response.end(JSON.stringify({ id: user, aud: 'authenticated' }));
    if (url.pathname === '/rest/v1/projects') {
      const accepted = url.searchParams.get('id') === 'eq.' + projectId && url.searchParams.get('owner_id') === 'eq.' + user;
      return response.end(JSON.stringify(accepted ? [{ id: projectId, owner_id: user }] : []));
    }
    response.statusCode = 404;
    return response.end('{}');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.close(resolve)));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_URL: 'https://127.0.0.1:' + service.address().port,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', APP_ORIGIN: origin, NODE_EXTRA_CA_CERTS: cert, COMPOR_CAROUSEL_RENDER_ENABLED: 'true' },
  });
  let logs = '';
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', value => { logs = (logs + value).slice(-6000); });
  t.after(() => stopApp(child));
  await waitForApp({ url: origin, child, signal: AbortSignal.timeout(30_000), diagnostics: () => logs });

  const session = { access_token: token, refresh_token: 'mock-refresh', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: user } };
  const cookie = 'sb-127-auth-token=base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const post = async (payload, headers) => {
    try {
      return await fetch(origin + '/api/studio/carousel/render', {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin,
          ...(payload instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw Error('Falha HTTP na rota de composição.\n' + logs, { cause: error });
    }
  };
  assert.equal((await post({ projectId, plan }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ projectId, plan }, { Cookie: '' })).status, 401);
  assert.deepEqual(requests, []);
  assert.equal((await post({ projectId: otherProject, plan })).status, 404);
  const raster = { ...plan, slides: [{ ...plan.slides[0], art: 'data:image/png;base64,AA==' }, ...plan.slides.slice(1)] };
  assert.equal((await post({ projectId, plan: raster })).status, 400);
  const invalid = { ...plan, slides: [{ ...plan.slides[0], layout: 'html' }, ...plan.slides.slice(1)] };
  const invalidResponse = await post({ projectId, plan: invalid });
  assert.equal(invalidResponse.status, 422);
  assert.equal((await invalidResponse.json()).checks[0].id, 'LAYOUT');
  const longHeadline = 'Uma manchete de capa com doze palavras precisa perder ao menos uma palavra';
  const verbosePlan = { ...plan, slides: [{ ...plan.slides[0], headline: longHeadline }, ...plan.slides.slice(1)] };
  const verboseResponse = await post({ projectId, plan: verbosePlan });
  assert.equal(verboseResponse.status, 422);
  const rejected = await verboseResponse.json();
  assert.equal(rejected.error, 'invalid_plan');
  assert.ok(rejected.checks.some(check => check.id === 'HEADLINE_BUDGET' && check.index === 1));
  const basicClosing = { ...plan, slides: [...plan.slides.slice(0, -1), { ...plan.slides.at(-1), diagram: 'steps' }] };
  const basicClosingResponse = await post({ projectId, plan: basicClosing }, { Accept: 'multipart/form-data' });
  assert.equal(basicClosingResponse.status, 422);
  assert.match(basicClosingResponse.headers.get('content-type'), /^application\/json\b/);
  assert.equal(basicClosingResponse.headers.get('content-disposition'), null);
  const basicClosingRejection = await basicClosingResponse.json();
  assert.deepEqual(Object.keys(basicClosingRejection).sort(), ['checks', 'error']);
  assert.equal(basicClosingRejection.error, 'invalid_plan');
  assert.ok(basicClosingRejection.checks.some(check => check.id === 'CTA_DIAGRAM' && check.index === plan.slides.length));
  const held = await post({ projectId, plan: { ...plan, mode: 'editorial_art' } });
  assert.equal(held.status, 422);
  const refusal = await held.json();
  assert.equal(refusal.error, 'quality_held');
  assert.equal(refusal.manifest.first_pass_yield, 0);
  assert.equal(refusal.manifest.final.slides.length, 3);
  assert.equal(requests.every(request => request.startsWith('GET ')), true);

  const result = await post({ projectId, plan });
  assert.equal(result.status, 200, () => logs);
  assert.equal(result.headers.get('content-type'), 'application/zip');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  const archive = Buffer.from(await result.arrayBuffer());
  assert.equal(result.headers.get('content-length'), String(archive.length));
  const members = storedMembers(archive);
  const extract = name => {
    assert.ok(members.has(name), name);
    return members.get(name);
  };
  const manifest = JSON.parse(extract('qa-manifest.json'));
  assert.equal(manifest.assessment, 'physical_only');
  assert.match(manifest.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.first_pass.slides.length, 3);
  assert.deepEqual(JSON.parse(extract('alt-text.json')), plan.slides.map(({ alt }, offset) => ({ index: offset + 1, alt })));
  assert.equal(extract('legenda.txt').toString('utf8'), plan.caption);
  for (const slide of manifest.final.slides) {
    const bytes = extract(slide.file);
    assert.equal(bytes.length, slide.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), slide.sha256);
    assert.ok(slide.checks.every(check => check.status === 'pass'));
    const image = await sharp(bytes).metadata();
    assert.deepEqual([image.width, image.height, image.format, image.space, image.chromaSubsampling, image.hasProfile, image.isProgressive],
      [1080, 1350, 'jpeg', 'srgb', '4:4:4', true, false]);
  }
  const cover = await sharp(extract('cover-grid.png')).metadata();
  assert.deepEqual([cover.width, cover.height], [270, 360]);

  const editor = await post({ projectId, plan }, { Accept: 'multipart/form-data' });
  assert.equal(editor.status, 200);
  assert.match(editor.headers.get('content-type'), /^multipart\/form-data; boundary=/);
  const parts=await editor.formData();
  const editorManifest=JSON.parse(await parts.get('qa-manifest.json').text());
  assert.equal(editorManifest.planSha256,manifest.planSha256);
  assert.deepEqual(editorManifest.final.slides.map(panel=>panel.id),manifest.final.slides.map(panel=>panel.id));
  for (const panel of editorManifest.final.slides) {
    const image=parts.get(panel.file);
    assert.equal(image.type,'image/jpeg');
    assert.equal(image.size,panel.bytes);
    assert.equal(createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex'),panel.sha256);
  }

  const semanticPlan = {
    mode: 'editorial_art',
    caption: 'Duas decisões antes de imprimir um zine. #Zine',
    slides: [
      { id: 'capa', layout: 'hero_bleed', headline: 'Revise o zine no papel', alt: 'Capa sobre a prova de um zine.' },
      { id: 'categorias', layout: 'split_horizontal', headline: 'Separe texto de imagem', alt: 'Duas categorias independentes, texto e imagem.',
        diagram: { type: 'category_split', labels: ['Texto', 'Imagem'], items: ['Título', 'Desenho'] } },
      { id: 'orientacao', layout: 'comparison_dual', headline: 'Confira a orientação da página', alt: 'A palavra Página aparece em pé e de cabeça para baixo.',
        diagram: { type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Página' } },
      { id: 'espacamento', layout: 'svg_diagram', headline: 'Aproxime título e subtítulo',
        body: 'Deixe mais espaço entre blocos para distinguir assuntos.',
        alt: 'Os elementos próximos formam grupos visuais distintos.', diagram: { type: 'spacing' } },
      { id: 'final', layout: 'cta_closing', headline: 'Destaque o título da página', body: 'Salve para a próxima impressão.',
        alt: 'A comparação destaca o título e termina com o convite para salvar.',
        diagram: { type: 'hierarchy', labels: ['Peso igual', 'Título em destaque'], items: ['Título', 'Página', 'Selo'] } },
    ],
  };
  const semanticResponse = await post({ projectId, plan: semanticPlan });
  assert.equal(semanticResponse.status, 200, semanticResponse.ok ? undefined : await semanticResponse.text());
  assert.equal(semanticResponse.headers.get('content-type'), 'application/zip');
  const semanticFiles = storedMembers(Buffer.from(await semanticResponse.arrayBuffer()));
  const semanticManifest = JSON.parse(semanticFiles.get('qa-manifest.json'));
  assert.deepEqual(semanticManifest.final.slides.map(slide => slide.id), semanticPlan.slides.map(slide => slide.id));
  assert.deepEqual(JSON.parse(semanticFiles.get('alt-text.json')),
    semanticPlan.slides.map(({ alt }, offset) => ({ index: offset + 1, alt })));
  for (const slide of semanticManifest.final.slides.slice(1)) {
    assert.ok(slide.checks.every(check => check.status === 'pass'));
    assert.equal(createHash('sha256').update(semanticFiles.get(slide.file)).digest('hex'), slide.sha256);
  }
  const spacing = semanticManifest.final.slides.find(slide => slide.id === 'espacamento');
  const spacingImage = await sharp(semanticFiles.get(spacing.file)).metadata();
  assert.deepEqual([spacingImage.width, spacingImage.height, spacingImage.format, spacingImage.space], [1080, 1350, 'jpeg', 'srgb']);

  const source = await sharp({create:{width:320,height:240,channels:3,background:'#87815b'}}).jpeg().toBuffer();
  const artSha256 = createHash('sha256').update(source).digest('hex');
  const rasterPlan = {
    ...plan,
    slides: [
      {...plan.slides[0], layout:'framed_plate', artSha256},
      plan.slides[1],
      {...plan.slides[1], id:'releitura', headline:'Observe a cor do café', body:'Compare a foto com a cena.'},
      plan.slides[2],
    ],
  };
  const multipart = (project, bytes, mime = 'image/jpeg') => {
    const form = new FormData();
    form.append('request', JSON.stringify({projectId:project, plan:rasterPlan}));
    form.append('art:capa', new Blob([bytes], {type:mime}), 'foto');
    return form;
  };
  assert.equal((await post(multipart(projectId, source), { Cookie: '' })).status, 401);
  assert.equal((await post(multipart(otherProject, Buffer.from('dados de arte inválidos')))).status, 404);
  const wrongHash = await post(multipart(projectId, Buffer.from('hash divergente')));
  assert.equal(wrongHash.status, 400);
  assert.deepEqual(await wrongHash.json(), {error:'invalid_request'});
  const wrongFormat = await post(multipart(projectId, source, 'image/png'));
  assert.equal(wrongFormat.status, 422);
  assert.ok((await wrongFormat.json()).checks.some(check => check.id === 'ASSET_DECODE'));

  const withArt = await post(multipart(projectId, source));
  assert.equal(withArt.status, 200, () => logs);
  const withArtMembers = storedMembers(Buffer.from(await withArt.arrayBuffer()));
  const artManifest = JSON.parse(withArtMembers.get('qa-manifest.json'));
  const canonical = JSON.stringify(rasterPlan, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  assert.equal(artManifest.planSha256, createHash('sha256').update(canonical).digest('hex'));
  const normalized = await sharp(source).autoOrient().png().toBuffer();
  assert.deepEqual(artManifest.final.slides[0].artSource, {
    sha256:artSha256, format:'jpeg', width:320, height:240, bytes:source.length,
    embeddedSha256:createHash('sha256').update(normalized).digest('hex'),
  });
  const rasterSlide = artManifest.final.slides[0];
  const { clip, text } = rasterSlide.artPlacement;
  assert.equal(clip.left, 104);
  assert.equal(clip.right, 976);
  assert.ok(text.some(line => line.region === 'headline' && line.top >= clip.bottom));
  const contrast = rasterSlide.checks.find(check => check.id === 'TEXT_CONTRAST');
  assert.equal(contrast.observed.samplingStep, 1);
  assert.equal(contrast.observed.requiredCoverage, 0.9);
  assert.equal(artManifest.final.slides[1].artPlacement, undefined);
  assert.ok(withArtMembers.has('art-sheet.jpg'));
  assert.equal(requests.every(request => request.startsWith('GET ')), true);
});

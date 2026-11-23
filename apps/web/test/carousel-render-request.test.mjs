import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {readCarouselRenderRequest} from '../lib/carousel-render-request.ts';

const projectId = 'a50ec8ee-d6f0-4443-9c37-07e560c02b56';
const slide = {
  id: 'slide-1',
  layout: 'svg_diagram',
  headline: 'Ciência da atenção',
  alt: 'Um diagrama de atenção.',
  diagram: {type: 'flow', labels: ['Foco', 'Pausa']},
};
const plan = {mode: 'editorial_art', slides: [slide], tokens: {light: '#ffffff', accent: '#ad2500'}};
const input = {projectId, plan};
const invalid = {ok: false, status: 400, error: 'invalid_request'};
const tooLarge = {ok: false, status: 413, error: 'request_too_large'};

function request(body, headers = {'content-type': 'application/json'}) {
  return new Request('http://compor.test/api/carousel', {method: 'POST', body, headers, duplex: 'half'});
}

test('hashes canonical UTF-8 plan values and preserves order in arrays', async () => {
  const body = JSON.stringify(input);
  const parsed = await readCarouselRenderRequest(request(body, {'content-type': 'Application/JSON; charset=UTF-8'}));
  const reorderedProperties = JSON.stringify({
    plan: {tokens: {accent: '#ad2500', light: '#ffffff'}, slides: [slide], mode: 'editorial_art'},
    projectId: projectId.toUpperCase(),
  }, null, 2);
  const canonical = '{"mode":"editorial_art","slides":[{"alt":"Um diagrama de atenção.","diagram":{"labels":["Foco","Pausa"],"type":"flow"},"headline":"Ciência da atenção","id":"slide-1","layout":"svg_diagram"}],"tokens":{"accent":"#ad2500","light":"#ffffff"}}';
  const expected = {ok: true, projectId, plan, planSha256: createHash('sha256').update(canonical, 'utf8').digest('hex')};

  assert.deepEqual(parsed, expected);
  assert.deepEqual(await readCarouselRenderRequest(request(reorderedProperties)), expected);
  const changed = {...plan, slides: [{...slide, diagram: {...slide.diagram, labels: ['Pausa', 'Foco']}}]};
  const changedResult = await readCarouselRenderRequest(request(JSON.stringify({projectId, plan: changed})));
  assert.equal(changedResult.ok, true);
  assert.notEqual(changedResult.planSha256, expected.planSha256);
});

test('enforces the JSON content type, UTF-8 and request shape', async () => {
  const body = JSON.stringify(input);
  assert.deepEqual(await readCarouselRenderRequest(request(body, {'content-type': 'text/plain'})),
    {ok: false, status: 415, error: 'unsupported_media_type'});
  for (const bad of [
    null,
    '{',
    new Uint8Array([0x22, 0xc0, 0xaf, 0x22]),
    JSON.stringify({...input, projectId: 'not-a-uuid'}),
    JSON.stringify({...input, renderKey: 'client-provided'}),
    JSON.stringify({...input, plan: {...plan, html: '<img>'}}),
    JSON.stringify({...input, plan: {...plan, tokens: {...plan.tokens, fontUrl: 'https://example.test/'}}}),
    JSON.stringify({...input, plan: {...plan, slides: [{...slide, art: 'data:image/png;base64,aQ=='}]}}),
    JSON.stringify({...input, plan: {...plan, slides: [{...slide, diagram: {...slide.diagram, image: 'file.png'}}]}}),
    JSON.stringify({...input, plan: {...plan, slides: [{...slide, diagram: {...slide.diagram, labels: [{text: 'Foco'}]}}]}}),
  ]) assert.deepEqual(await readCarouselRenderRequest(request(bad)), invalid);
});


test('preserva os slots semânticos canônicos e rejeita versões fora da receita', async () => {
  const category = {type: 'category_split', labels: ['Pedidos', 'Dúvidas'], items: ['Trocar a câmara', 'Medida do pneu']};
  const orientation = {type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Leia em voz alta'};
  const read = async (diagram, fields = {}) => readCarouselRenderRequest(request(JSON.stringify({
    ...input, plan: {...plan, slides: [{...slide, diagram, ...fields}]},
  })));

  const parsed = await read(category);
  const reordered = await read({items: category.items, type: category.type, labels: category.labels});
  const changed = await read({...category, items: [...category.items].reverse()});
  assert.ok(parsed.ok && reordered.ok && changed.ok);
  assert.deepEqual(parsed.plan.slides[0].diagram, category);
  assert.equal(parsed.planSha256, reordered.planSha256);
  assert.notEqual(parsed.planSha256, changed.planSha256);

  const rotated = await read(orientation);
  assert.ok(rotated.ok);
  assert.deepEqual(rotated.plan.slides[0].diagram, orientation);
  for (const bad of [
    'orientation',
    {...orientation, labels: [...orientation.labels].reverse()},
    {...orientation, sample: 'Um texto é muito longo'},
    {...category, labels: ['Dúvidas', 'DÚVIDAS']},
    {...category, items: ['Trocar', 'Trocar']},
    {...category, items: ['Trocar', 'Medir', 'Montar']},
    {...category, sample: 'Trocar'},
  ]) assert.deepEqual(await read(bad), invalid);
  const closing = await read(category, {layout: 'cta_closing', body: 'Salve para a próxima oficina.'});
  assert.ok(closing.ok);
  assert.deepEqual(closing.plan.slides[0].diagram, category);
  assert.deepEqual(await read(category, {layout: 'bento_grid'}), invalid);
  const rasterPlan = {...plan, slides: [{...artSlide, diagram: category}]};
  assert.deepEqual(await readCarouselRenderRequest(multipart([
    ['request', JSON.stringify({projectId, plan: rasterPlan})], ['art:arte', new Blob([raster], {type: 'image/png'})],
  ])), invalid);
});

test('enforces the inclusive 32 KiB body limit even without a length header', async () => {
  const body = JSON.stringify(input);
  const byteLimit = 32 * 1024;
  const padded = body + ' '.repeat(byteLimit - Buffer.byteLength(body));
  assert.equal((await readCarouselRenderRequest(request(padded))).ok, true);
  assert.deepEqual(await readCarouselRenderRequest(request(body, {
    'content-type': 'application/json',
    'content-length': String(byteLimit + 1),
  })), tooLarge);

  const chunks = [new Uint8Array(24 * 1024), new Uint8Array(12 * 1024)];
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
    },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await readCarouselRenderRequest(request(stream)), tooLarge);
  assert.equal(cancelled, true);
});

const raster = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const artSha256 = createHash('sha256').update(raster).digest('hex');
const artSlide = {id: 'arte', layout: 'framed_plate', headline: 'A arte no plano', alt: 'Uma prancha.', artSha256};
const artPlan = {...plan, slides: [artSlide, slide]};

function multipart(entries) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return request(form, {});
}

test('multipart mantém o digest da arte no plano canônico e separa o arquivo por lâmina', async () => {
  const artifact = new Blob([raster], {type: 'image/png'});
  const args = JSON.stringify({projectId: projectId.toUpperCase(), plan: artPlan});
  const parsed = await readCarouselRenderRequest(multipart([['art:arte', artifact], ['request', args]]));
  assert.ok(parsed.ok);
  assert.equal(parsed.projectId, projectId);
  assert.deepEqual(parsed.plan, artPlan);
  assert.deepEqual([...parsed.artFiles.keys()], ['arte']);
  assert.equal(parsed.artFiles.get('arte').type, 'image/png');
  assert.deepEqual(new Uint8Array(await parsed.artFiles.get('arte').arrayBuffer()), raster);
  const canonical = JSON.stringify(artPlan, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  assert.equal(parsed.planSha256, createHash('sha256').update(canonical).digest('hex'));
  assert.deepEqual(await readCarouselRenderRequest(request(args)), invalid);

  for (const type of ['image/jpeg', 'image/webp']) {
    const declared = await readCarouselRenderRequest(multipart([
      ['request', args], ['art:arte', new Blob([raster], {type})],
    ]));
    assert.equal(declared.artFiles.get('arte').type, type);
  }
});

test('multipart recusa partes ou identificadores ambíguos, tipos inválidos e arte sem hash', async () => {
  const payload = JSON.stringify({projectId, plan: artPlan});
  const image = new Blob([raster], {type: 'image/png'});
  const requestPart = ['request', payload];
  const artPart = ['art:arte', image];
  for (const entries of [
    [requestPart],
    [artPart],
    [requestPart, requestPart, artPart],
    [requestPart, artPart, artPart],
    [requestPart, ['art:outro', image]],
    [requestPart, artPart, ['art:slide-1', image]],
    [requestPart, ['art:arte', 'https://example.test/image.png']],
    [requestPart, ['art:arte', new Blob([raster], {type: 'image/svg+xml'})]],
    [requestPart, ['art:arte', new Blob([], {type: 'image/png'})]],
    [['request', new Blob([payload], {type: 'application/json'})], artPart],
    [requestPart, artPart, ['url', 'https://example.test/image.png']],
    [['request', JSON.stringify({projectId, plan})], artPart],
    [['request', JSON.stringify({projectId, plan: {...artPlan, slides: [artSlide, artSlide]}})], artPart],
    [['request', JSON.stringify({projectId, plan: {...artPlan, slides: [{...artSlide, artSha256: artSha256.toUpperCase()}]}})], artPart],
  ]) assert.deepEqual(await readCarouselRenderRequest(multipart(entries)), invalid);
});

test('limita a parte JSON a 32 KiB e o multipart completo a 4 MiB', async () => {
  const payload = JSON.stringify({projectId, plan: artPlan});
  const limit = 32 * 1024;
  const padded = payload + ' '.repeat(limit - Buffer.byteLength(payload));
  const image = new Blob([raster], {type: 'image/png'});
  const valid = await readCarouselRenderRequest(multipart([['request', padded], ['art:arte', image]]));
  assert.equal(valid.ok, true);
  assert.deepEqual(await readCarouselRenderRequest(multipart([['request', padded + ' '], ['art:arte', image]])), tooLarge);

  const full = new Uint8Array(4 * 1024 * 1024);
  const oversized = multipart([['request', payload], ['art:arte', new Blob([full], {type: 'image/png'})]]);
  const streamed = request(await oversized.arrayBuffer(), {'content-type': oversized.headers.get('content-type')});
  assert.equal(streamed.headers.has('content-length'), false);
  assert.deepEqual(await readCarouselRenderRequest(streamed), tooLarge);
});

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

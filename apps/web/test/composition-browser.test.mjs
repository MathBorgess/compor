import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { browserModuleSource } from './browser-module-source.mjs';
import { chromium } from 'playwright-core';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('preserva os bytes da arte integral, sem renderizar campos sobre o PNG', { skip: !existsSync(browserPath) }, async t => {
  const source = await browserModuleSource(new URL('../lib/compose-png.ts', import.meta.url));
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await page.evaluate(async source => {
    const { composePng } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3977aa'; ctx.fillRect(0, 0, 256, 256);
    const base = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const fields = { headline: 'Oficina', price: 'R$ 20', date: '10/12' };
    const render = async values => {
      const png = await composePng({ base, ...values });
      const bitmap = await createImageBitmap(png);
      const out = document.createElement('canvas'); out.width = bitmap.width; out.height = bitmap.height;
      out.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      return { type: png.type, width: out.width, height: out.height, pixels: [...out.getContext('2d').getImageData(0, 0, out.width, out.height).data], bytes: [...new Uint8Array(await png.arrayBuffer())] };
    };
    const original = await render(fields);
    const headline = await render({ ...fields, headline: 'Encontro' });
    const price = await render({ ...fields, price: 'R$ 30' });
    const date = await render({ ...fields, date: '11/12' });
    const different = variant => original.pixels.some((value, i) => value !== variant.pixels[i]);
    return { type: original.type, width: original.width, height: original.height, fields, bytesPreserved: original.bytes.join(',') === [...new Uint8Array(await base.arrayBuffer())].join(','), headlineChanged: different(headline), priceChanged: different(price), dateChanged: different(date) };
  }, source);
  assert.deepEqual(result, { type: 'image/png', width: 256, height: 256, fields: { headline: 'Oficina', price: 'R$ 20', date: '10/12' }, bytesPreserved: true, headlineChanged: false, priceChanged: false, dateChanged: false });
});

test('recusa entrada inválida ou excessiva antes da decodificação, sem chamadas externas', { skip: !existsSync(browserPath) }, async t => {
  const source = await browserModuleSource(new URL('../lib/compose-png.ts', import.meta.url));
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await page.evaluate(async source => {
    const { composePng } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const fields = { headline: 'Oficina', price: 'R$ 20', date: '10/12' };
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const valid = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await valid.arrayBuffer());
    new DataView(bytes.buffer).setUint32(16, 50000);
    const unsafeSize = new Blob([bytes], { type: 'image/png' });
    const oversized = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' });
    const original = new Uint8Array(await valid.arrayBuffer());
    const compressedTextChunk = new Uint8Array([0,0,0,1, 122,84,88,116, 0, 0,0,0,0]);
    const compressedMetadata = new Blob([original.slice(0, 33), compressedTextChunk, original.slice(33)], { type: 'image/png' });
    const originalDecoder = window.createImageBitmap;
    let decodes = 0, network = 0;
    window.createImageBitmap = (...args) => { decodes++; return originalDecoder(...args); };
    window.fetch = () => { network++; throw new Error('unexpected network'); };
    const rejects = async args => { try { await composePng(args); return false; } catch { return true; } };
    const malformed = await rejects({ base: new Blob(['não png']), ...fields });
    const huge = await rejects({ base: oversized, ...fields });
    const dimensions = await rejects({ base: unsafeSize, ...fields });
    const control = await rejects({ base: valid, ...fields, headline: 'texto\nextra' });
    const ancillary = await rejects({ base: compressedMetadata, ...fields });
    const beforeValidDecode = decodes;
    const cannotFit = await rejects({ base: valid, ...fields, headline: 'W'.repeat(180) });
    return { malformed, huge, dimensions, control, ancillary, beforeValidDecode, cannotFit, network };
  }, source);
  assert.deepEqual(result, { malformed: true, huge: true, dimensions: true, control: false, ancillary: true, beforeValidDecode: 1, cannotFit: false, network: 0 });
});

test('não executa duas decodificações ao mesmo tempo na mesma aba', { skip: !existsSync(browserPath) }, async t => {
  const source = await browserModuleSource(new URL('../lib/compose-png.ts', import.meta.url));
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await page.evaluate(async source => {
    const { composePng } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const base = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const fields = { base, headline: 'Oficina', price: '', date: '' };
    const original = window.createImageBitmap;
    let unblock; let started;
    const wait = new Promise(resolve => { unblock = resolve; });
    const decoding = new Promise(resolve => { started = resolve; });
    let decodes = 0;
    window.createImageBitmap = async (...args) => { decodes++; started(); await wait; return original(...args); };
    const first = composePng(fields);
    await decoding;
    const second = composePng(fields).then(() => false, () => true);
    const refused = await Promise.race([second, new Promise(resolve => setTimeout(() => resolve(false), 200))]);
    unblock(); await Promise.allSettled([first, second]);
    return { refused, decodes };
  }, source);
  assert.deepEqual(result, { refused: true, decodes: 1 });
});

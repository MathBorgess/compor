import assert from 'node:assert/strict';
import test from 'node:test';
import { withCarouselRuntime } from '../lib/carousel-runtime.ts';

const hasBrowser = Boolean(process.env.BROWSER_EXECUTABLE_PATH) || process.env.VERCEL === '1';

test('runtime usa fontes e Chromium 2× e libera o navegador depois de cada render', {
  skip: hasBrowser ? false : 'Defina BROWSER_EXECUTABLE_PATH para rodar o canário Chromium.',
}, async () => {
  let firstBrowser;
  const first = withCarouselRuntime(async ({ browser, fonts, sharp, signal }) => {
    firstBrowser = browser;
    assert.ok(fonts[400].length > 0 && fonts[700].length > 0);
    assert.equal(signal.aborted, false);
    const context = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.setContent('<p>À luz, o café muda.</p>');
    const capture = await sharp(await page.screenshot()).metadata();
    assert.deepEqual([capture.width, capture.height], [2160, 2700]);
    await context.close();
  });
  await Promise.all([
    first,
    assert.rejects(withCarouselRuntime(async () => null), { code: 'carousel_renderer_busy' }),
  ]);
  assert.equal(firstBrowser.isConnected(), false);

  let failedBrowser;
  const failure = new Error('render_failed');
  await assert.rejects(withCarouselRuntime(async ({ browser }) => {
    failedBrowser = browser;
    throw failure;
  }), failure);
  assert.equal(failedBrowser.isConnected(), false);
  assert.equal(await withCarouselRuntime(async ({ browser }) => browser.isConnected()), true);
});

import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Browser } from 'playwright-core-carousel';
import type sharp from 'sharp';

const BROWSER_LAUNCH_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 75_000;

type RuntimeErrorCode = 'carousel_renderer_busy' | 'carousel_renderer_timeout' | 'carousel_renderer_unavailable';

export class CarouselRuntimeError extends Error {
  constructor(readonly code: RuntimeErrorCode, cause?: unknown) {
    super(code, { cause });
  }
}

export type CarouselRuntime = {
  browser: Browser;
  sharp: typeof sharp;
  fonts: { 400: Buffer; 700: Buffer };
  signal: AbortSignal;
};

let rendering = false;

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core-carousel');
  const options = { headless: true, timeout: BROWSER_LAUNCH_TIMEOUT_MS };
  const localBrowser = process.env.BROWSER_EXECUTABLE_PATH;
  const usePackagedChromium = process.env.VERCEL === '1'
    || (process.platform === 'linux' && process.env.NODE_ENV === 'production' && !localBrowser);

  if (usePackagedChromium) {
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      throw new CarouselRuntimeError('carousel_renderer_unavailable');
    }
    const { default: serverlessChromium } = await import('@sparticuz/chromium');
    const executablePath = await serverlessChromium.executablePath();
    return chromium.launch({
      ...options, executablePath, args: serverlessChromium.args,
      env: {
        PATH: process.env.PATH, HOME: tmpdir(), TMPDIR: tmpdir(),
        FONTCONFIG_PATH: process.env.FONTCONFIG_PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      },
    });
  }

  return chromium.launch({ ...options, executablePath: localBrowser });
}

async function loadFonts(): Promise<CarouselRuntime['fonts']> {
  const directory = join(process.cwd(), 'public', 'studio');
  const [regular, bold] = await Promise.all([
    readFile(join(directory, 'dm-sans-regular.ttf')),
    readFile(join(directory, 'dm-sans-bold.ttf')),
  ]);
  return { 400: regular, 700: bold };
}

export async function withCarouselRuntime<T>(operation: (runtime: CarouselRuntime) => Promise<T>): Promise<T> {
  if (rendering) throw new CarouselRuntimeError('carousel_renderer_busy');
  rendering = true;

  const deadline = new AbortController();
  let browser: Browser | undefined;
  let browserClosing: Promise<void> | undefined;
  const closeBrowser = () => {
    browserClosing ??= browser?.close().catch(() => {});
    return browserClosing;
  };
  const timer = setTimeout(() => {
    deadline.abort(new CarouselRuntimeError('carousel_renderer_timeout'));
    void closeBrowser();
  }, RENDER_TIMEOUT_MS);
  timer.unref();

  try {
    let fonts: CarouselRuntime['fonts'];
    let runtimeSharp: CarouselRuntime['sharp'];
    try {
      [fonts, { default: runtimeSharp }] = await Promise.all([loadFonts(), import('sharp')]);
      deadline.signal.throwIfAborted();
      browser = await launchBrowser();
    } catch (cause) {
      deadline.signal.throwIfAborted();
      throw new CarouselRuntimeError('carousel_renderer_unavailable', cause);
    }
    deadline.signal.throwIfAborted();
    const result = await operation({ browser, fonts, sharp: runtimeSharp, signal: deadline.signal });
    deadline.signal.throwIfAborted();
    return result;
  } catch (error) {
    deadline.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer);
    await closeBrowser();
    rendering = false;
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Browser } from 'playwright-core';
import type sharp from 'sharp';

const BROWSER_LAUNCH_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 75_000;
const diagnosticsEnd = Date.parse('2026-11-23T06:25:00Z');

type DiagnosticStage = 'fonts' | 'sharp' | 'chromium_module' | 'br_extraction' | 'browser_launch';
type StageFailure = { stage: DiagnosticStage; code: string; asset?: string };
const diagnosticStorage = new AsyncLocalStorage<{ failure?: StageFailure }>();
const diagnosticCodes = new Set([
  'ENOENT', 'EACCES', 'EPERM', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_DLOPEN_FAILED',
  'EAGAIN', 'EEXIST', 'ENOTDIR', 'ENOEXEC', 'ETXTBSY', 'ENOSPC', 'EROFS', 'EINVAL', 'ERR_ZLIB_INITIALIZATION_FAILED',
  'Z_DATA_ERROR', 'Z_BUF_ERROR', 'ERR_PADDING_2',
]);
const diagnosticAssets = [
  'dm-sans-regular.ttf', 'dm-sans-bold.ttf', 'chromium.br', 'al2023.tar.br', 'fonts.tar.br',
  'swiftshader.tar.br', 'libGLESv2.so', 'libEGL.so', 'sharp-linux-x64', 'sharp-libvips-linux-x64',
  'libvips-cpp.so', '@sparticuz/chromium', 'playwright-core',
  'libnss3.so', 'libnspr4.so', 'libatk-1.0.so.0', 'libatk-bridge-2.0.so.0', 'libgobject-2.0.so.0',
  'libglib-2.0.so.0', 'libX11.so.6', 'libXcomposite.so.1', 'libXdamage.so.1', 'libXfixes.so.3',
  'libxkbcommon.so.0', 'libgbm.so.1', 'libasound.so.2', 'libcairo.so.2',
];

export function allowsCarouselRuntimeDiagnostic() {
  return Date.now() < diagnosticsEnd && process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_PROJECT_ID === 'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'diagnostico/carrossel-function-e867f00';
}

export async function observeCarouselRuntime<T>(operation: () => Promise<T>) {
  if (!allowsCarouselRuntimeDiagnostic()) return { value: await operation(), failure: undefined };
  const observation: { failure?: StageFailure } = {};
  const value = await diagnosticStorage.run(observation, operation);
  return { value, failure: observation.failure };
}

function knownStageFailure(stage: DiagnosticStage, cause: unknown): StageFailure {
  const message = cause instanceof Error ? cause.message : '';
  const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
  const path = cause instanceof Error && 'path' in cause && typeof cause.path === 'string' ? cause.path : '';
  const asset = diagnosticAssets.find(name => path.includes(name) || message.includes(name));
  // Report only allowlisted literals. Browser output and filesystem paths stay private.
  if (diagnosticCodes.has(code)) return { stage, code, asset };
  if (message.includes('Cannot find module') || message.includes('Cannot find package') || message.includes('Cannot resolve')) {
    return { stage, code: 'MODULE_NOT_FOUND', asset };
  }
  if (message.includes('error while loading shared libraries')) return { stage, code: 'MISSING_SHARED_LIBRARY', asset };
  if (message.includes('cannot open shared object file')) return { stage, code: 'MISSING_SHARED_LIBRARY', asset };
  if (message.includes('Could not load the "sharp" module')) return { stage, code: 'SHARP_PLATFORM_MODULE_UNAVAILABLE', asset };
  if (message.includes('The input directory "') && message.includes('does not exist')) return { stage, code: 'MISSING_BROTLI_DIRECTORY' };
  if (message.includes("Executable doesn't exist")) return { stage, code: 'MISSING_EXECUTABLE' };
  if (message.includes('spawn') && message.includes('ENOENT')) return { stage, code: 'ENOENT', asset };
  if (message.includes('Host system is missing dependencies')) return { stage, code: 'MISSING_SHARED_LIBRARY', asset };
  if (message.includes('Timeout') && message.includes('exceeded')) return { stage, code: 'BROWSER_TIMEOUT' };
  if (message.includes('process did exit') || message.includes('Target page, context or browser has been closed')) {
    return { stage, code: 'BROWSER_PROCESS_EXIT', asset };
  }
  if (code === 'carousel_renderer_unavailable') return { stage, code: 'UNSUPPORTED_PLATFORM' };
  return { stage, code: 'UNKNOWN', asset };
}

async function runtimeStage<T>(stage: DiagnosticStage, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (cause) {
    const observation = diagnosticStorage.getStore();
    if (observation && !observation.failure) observation.failure = knownStageFailure(stage, cause);
    throw cause;
  }
}

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
  // Playwright resolves sibling modules and assets against its npm package.
  // Load the traced package with Node's resolver so its layout stays intact.
  const { chromium } = await runtimeStage('chromium_module', async () =>
    createRequire(join(process.cwd(), 'package.json'))('playwright-core') as typeof import('playwright-core'));
  const options = { headless: true, timeout: BROWSER_LAUNCH_TIMEOUT_MS };
  const localBrowser = process.env.BROWSER_EXECUTABLE_PATH;
  const usePackagedChromium = process.env.VERCEL === '1'
    || (process.platform === 'linux' && process.env.NODE_ENV === 'production' && !localBrowser);

  if (usePackagedChromium) {
    const { default: serverlessChromium } = await runtimeStage('chromium_module', () => {
      if (process.platform !== 'linux' || process.arch !== 'x64') {
        throw new CarouselRuntimeError('carousel_renderer_unavailable');
      }
      return import('@sparticuz/chromium');
    });
    const executablePath = await runtimeStage('br_extraction', () => serverlessChromium.executablePath());
    return runtimeStage('browser_launch', () => chromium.launch({
      ...options, executablePath, args: serverlessChromium.args,
      env: {
        PATH: process.env.PATH, HOME: tmpdir(), TMPDIR: tmpdir(),
        FONTCONFIG_PATH: process.env.FONTCONFIG_PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      },
    }));
  }

  return runtimeStage('browser_launch', () => chromium.launch({ ...options, executablePath: localBrowser }));
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
      [fonts, { default: runtimeSharp }] = await Promise.all([
        runtimeStage('fonts', loadFonts),
        runtimeStage('sharp', () => import('sharp')),
      ]);
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

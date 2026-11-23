import type { Buffer } from 'node:buffer';
import type { Browser } from 'playwright-core-carousel';
import type sharp from 'sharp';

export type CarouselFinding = {
  id: string;
  status: 'pass' | 'fail';
  index?: number | null;
  detail?: string;
  observed?: unknown;
};

type Asset = { file: string; bytes: number; sha256: string };
type RenderedSlide = {
  id: string;
  index: number;
  checks: CarouselFinding[];
  firstChecks?: CarouselFinding[];
  repairs?: string[];
  artAreaFraction?: number;
};
type SlideAsset = RenderedSlide & (Asset | { file?: undefined; bytes?: undefined; sha256?: undefined });
type MemorySlide = RenderedSlide & (
  Asset & { data: Buffer } | { file?: undefined; bytes?: undefined; sha256?: undefined; data?: undefined }
);
type RenderOptions = {
  browser: Browser;
  sharp: typeof sharp;
  fonts: Record<400 | 700, Buffer>;
  repair?: boolean;
  signal?: AbortSignal;
};
type PaletteInput = { light?: string; dark?: string; accent?: string };
type Palette = {
  light: string;
  dark: string;
  accent: string;
  valid: boolean;
  onAccent: string;
  accentOnLight: string | null;
  accentOnDark: string | null;
};

export const layouts: readonly string[];
export const modes: readonly string[];
export const diagrams: readonly string[];
export function validateDeck(plan: unknown): CarouselFinding[];
export function contrast(foreground: string, background: string): number;
export function accentAgainst(seed: string, background: string, minimum: number): string | null;
export function paletteFor(tokens?: PaletteInput): Palette;
export function renderDeckInMemory(plan: unknown, options: RenderOptions): Promise<{
  profile: string;
  slides: MemorySlide[];
  checks: CarouselFinding[];
  artifacts: (Asset & { data: Buffer })[];
  caption?: string;
  altTexts?: { index: number; alt: string }[];
}>;
export function renderDeck(plan: unknown, options: RenderOptions & { outputDir: string }): Promise<{
  profile: string;
  slides: SlideAsset[];
  checks: CarouselFinding[];
  artifacts: Asset[];
}>;

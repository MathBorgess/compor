export const defaultTokens = Object.freeze({
  light: '#f7f2e7',
  dark: '#201d1b',
  accent: '#a0542e',
});

const HEX = /^#[a-f\d]{6}$/i;

export function isColor(value) {
  return typeof value === 'string' && HEX.test(value);
}

function rgb(hex) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encoded(channel) {
  const value = Math.min(1, Math.max(0, channel));
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function luminance(channels) {
  const [r, g, b] = channels.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function contrast(a, b) {
  return ratio(luminance(rgb(a)), luminance(rgb(b)));
}

function toOklch(hex) {
  const [r, g, b] = rgb(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const k = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, Math.hypot(a, k), Math.atan2(k, a)];
}

function candidateFor(lightness, chroma, hue) {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function inGamut([r, g, b]) {
  return [r, g, b].every(value => value >= -1e-7 && value <= 1 + 1e-7);
}

function gamutMapped(lightness, chroma, hue) {
  for (let step = 20; step >= 0; step -= 1) {
    const candidate = candidateFor(lightness, chroma * step / 20, hue);
    if (inGamut(candidate)) {
      const bytes = candidate.map(value => Math.round(encoded(value) * 255));
      return '#' + bytes.map(value => value.toString(16).padStart(2, '0')).join('');
    }
  }
  return lightness < 0.5 ? '#000000' : '#ffffff';
}

export function accentAgainst(seed, background, minimum) {
  const [originalLight, chroma, hue] = toOklch(seed);
  for (let step = 0; step <= 100; step += 1) {
    const distance = step / 100;
    for (const light of new Set([Math.max(0, originalLight - distance), Math.min(1, originalLight + distance)])) {
      const candidate = gamutMapped(light, chroma, hue);
      if (contrast(candidate, background) >= minimum) return candidate;
    }
  }
  return null;
}

export function paletteFor(tokens = {}) {
  const { light, dark, accent } = { ...defaultTokens, ...tokens };
  const accentOnLight = accentAgainst(accent, light, 4.8);
  const accentOnDark = accentAgainst(accent, dark, 5.2);
  const foreground = contrast(light, dark) >= 4.5;
  const onAccent = contrast('#ffffff', accent) >= contrast('#000000', accent) ? '#ffffff' : '#000000';
  return { light, dark, accent, accentOnLight, accentOnDark, onAccent, valid: Boolean(accentOnLight && accentOnDark && foreground) };
}

export function cssRgbLuminance(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? luminance(channels) : NaN;
}

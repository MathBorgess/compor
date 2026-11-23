import { isColor, paletteFor } from './color.mjs';
import { usesDarkSurface } from './visuals.mjs';

export const layouts = Object.freeze([
  'hero_bleed', 'split_horizontal', 'split_vertical', 'framed_plate',
  'stat_monument', 'svg_diagram', 'comparison_dual', 'bento_grid',
  'artifact_proof', 'typo_breather', 'native_serial', 'cta_closing',
]);

export const modes = Object.freeze(['editorial_art', 'native_serial']);
export const diagrams = Object.freeze(['flow', 'balance', 'steps', 'focus']);

const MODE_POLARITY = ['base', 'inverted'];
const IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const words = new Intl.Segmenter('pt-BR', { granularity: 'word' });
const graphemes = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

function wordCount(value) {
  return Array.from(words.segment(value)).filter(item => item.isWordLike).length;
}

function validText(value, limit, required = false) {
  return typeof value === 'string' && value.length <= limit && (!required || Boolean(value.trim()));
}

function issue(id, index, detail) {
  return { id, index, detail, status: 'fail' };
}

function copyIssues(slide, index) {
  const findings = [];
  const { headline, body, kicker, listItems, source, alt, accentPhrase } = slide;
  if (!validText(headline, 160, true)) findings.push(issue('HEADLINE', index, 'Manchete ausente ou inválida.'));
  else if (index === 1 ? wordCount(headline) > 11 || Array.from(graphemes.segment(headline)).length > 65 : wordCount(headline) > 12) {
    findings.push(issue('HEADLINE_BUDGET', index, 'Manchete excede o orçamento.'));
  }
  if (body !== undefined && (!validText(body, 480) || wordCount(body) > 50)) findings.push(issue('BODY_BUDGET', index, 'Corpo excede o orçamento.'));
  if (kicker !== undefined && (!validText(kicker, 80) || wordCount(kicker) > 8)) findings.push(issue('KICKER_BUDGET', index, 'Kicker excede o orçamento.'));
  if (source !== undefined && !validText(source, 110)) findings.push(issue('SOURCE', index, 'Crédito de fonte inválido.'));
  if (!validText(alt, 350, true)) findings.push(issue('ALT', index, 'Alt text obrigatório.'));
  if (listItems !== undefined && (
    !Array.isArray(listItems) ||
    listItems.length > (slide.layout === 'bento_grid' ? 4 : 7) ||
    listItems.some(item => !validText(item, 90, true))
  )) findings.push(issue('LIST_BUDGET', index, 'Lista excede os limites do layout.'));
  if (accentPhrase !== undefined && (
    !validText(accentPhrase, 70, true) || wordCount(accentPhrase) > 3 || !headline?.includes?.(accentPhrase)
  )) findings.push(issue('ACCENT_PHRASE', index, 'Destaque ausente no título ou longo demais.'));
  if (index === 2 && typeof headline === 'string' &&
    /^(?:por isso|veja abaixo|isso (?:muda|significa|faz|vale)|essa é|como vimos|então,?)\b/i.test(headline.trim())) {
    findings.push(issue('S2_DEPENDENT_OPEN', index, 'Abertura depende de outra lâmina.'));
  }
  return findings;
}

export function isDiagram(spec) {
  if (diagrams.includes(spec)) return true;
  return Boolean(spec && typeof spec === 'object' && diagrams.includes(spec.type) &&
    Array.isArray(spec.labels) && spec.labels.length >= 1 && spec.labels.length <= 3 &&
    spec.labels.every(label => validText(label, 30, true) && wordCount(label) <= 3));
}

function slideIssues(slide, index) {
  if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return [issue('SLIDE', index, 'Lâmina inválida.')];
  const findings = copyIssues(slide, index);
  if (typeof slide.id !== 'string' || !ID.test(slide.id)) findings.push(issue('SLIDE_ID', index, 'ID inválido.'));
  if (!layouts.includes(slide.layout)) findings.push(issue('LAYOUT', index, 'Arquétipo não permitido.'));
  if (slide.polarity !== undefined && !MODE_POLARITY.includes(slide.polarity)) findings.push(issue('POLARITY', index, 'Polaridade inválida.'));
  if (slide.art !== undefined && (typeof slide.art !== 'string' || slide.art.length > 11_200_000 || !IMAGE.test(slide.art))) {
    findings.push(issue('ART_SOURCE', index, 'Arte deve ser uma imagem raster incorporada.'));
  }
  if (slide.diagram !== undefined && !isDiagram(slide.diagram)) findings.push(issue('DIAGRAM', index, 'Diagrama não permitido.'));
  if (slide.figure !== undefined && !validText(slide.figure, 18, true)) findings.push(issue('FIGURE', index, 'Número ou marcador excede o slot.'));
  if (slide.layout === 'stat_monument' && (!validText(slide.figure, 18, true) || !validText(slide.source, 110, true))) {
    findings.push(issue('STAT_SOURCE', index, 'Estatística exige valor e crédito.'));
  }
  if (slide.layout === 'svg_diagram' && !isDiagram(slide.diagram)) findings.push(issue('DIAGRAM_REQUIRED', index, 'Escolha um diagrama.'));
  if (slide.bridge !== undefined && !['hairline_thread', 'color_band_echo'].includes(slide.bridge)) {
    findings.push(issue('SEAM_BRIDGE', index, 'Ponte visual fora dos acabamentos permitidos.'));
  }
  return findings;
}

export function validateDeck(deck) {
  if (!deck || typeof deck !== 'object' || !modes.includes(deck.mode) ||
    !Array.isArray(deck.slides) || deck.slides.length < 3 || deck.slides.length > 10) {
    return [issue('DECK', null, 'Formato ou quantidade de lâminas incompatível com o Compor.')];
  }
  const findings = deck.slides.flatMap((slide, position) => slideIssues(slide, position + 1));
  if (new Set(deck.slides.map(slide => slide?.id)).size !== deck.slides.length) {
    findings.push(issue('DUPLICATE_ID', null, 'IDs de lâminas devem ser únicos.'));
  }
  if (deck.caption !== undefined && (!validText(deck.caption, 2200) || [...deck.caption.matchAll(/#[\p{L}\p{N}_]+/gu)].length > 5)) {
    findings.push(issue('CAPTION_BUDGET', null, 'Legenda excede o tamanho ou o limite de hashtags.'));
  }
  if (deck.tokens !== undefined && (!deck.tokens || Object.entries(deck.tokens).some(([key, value]) =>
    !['light', 'dark', 'accent'].includes(key) || !isColor(value)))) {
    findings.push(issue('PALETTE', null, 'A paleta exige cores sRGB hexadecimais.'));
  } else if (!paletteFor(deck.tokens).valid) {
    findings.push(issue('PALETTE_CONTRAST', null, 'As superfícies e acentos não atingem o contraste exigido.'));
  }
  return findings;
}

export function cadence(deck) {
  const kinds = deck.slides.map(slide => slide.art ? 'art' : slide.diagram ? 'diagram' : 'text');
  const layoutCounts = new Map();
  let adjacentRepeats = 0;
  let maxTextStreak = 0;
  let textStreak = 0;

  deck.slides.forEach((slide, index) => {
    const last = deck.slides[index - 1];
    layoutCounts.set(slide.layout, (layoutCounts.get(slide.layout) ?? 0) + 1);
    if (last && last.layout === slide.layout && usesDarkSurface(last) === usesDarkSurface(slide) && kinds[index - 1] === kinds[index]) adjacentRepeats += 1;
    textStreak = kinds[index] === 'text' ? textStreak + 1 : 0;
    maxTextStreak = Math.max(maxTextStreak, textStreak);
  });

  const n = deck.slides.length;
  const visualCoverage = kinds.filter(kind => kind !== 'text').length / n;
  const inversions = deck.slides.filter(usesDarkSurface).length;
  const entropy = -Array.from(layoutCounts.values()).reduce((sum, count) => sum + (count / n) * Math.log(count / n), 0) / Math.log(n);
  const editorial = deck.mode === 'editorial_art';
  const pass = inversions <= 3 && (editorial ? visualCoverage >= 0.5 && adjacentRepeats === 0 && maxTextStreak <= 1 : visualCoverage <= 0.3);
  return {
    id: 'COLLECTION_CADENCE',
    status: pass ? 'pass' : 'fail',
    observed: { visualCoverage, inversions, adjacentRepeats, maxTextStreak, entropy },
  };
}

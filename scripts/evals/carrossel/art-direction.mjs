import { paletteFor } from '../../../packages/carousel-renderer/src/color.mjs';
import { cadence } from '../../../packages/carousel-renderer/src/plan.mjs';

const mediumEngines = ['cut_paper', 'graphite', 'gouache', 'studio_photograph', 'ink_print'];
const lightAndOptics = ['diffuse_overhead', 'soft_side', 'hard_side', 'studio_bounce'];
const shotScales = ['wide', 'medium', 'isometric', 'macro', 'overhead'];
const silhouetteGeometries = ['circular', 'angular', 'linear', 'layered', 'organic'];
const panelByLayout = {
  hero_bleed: 'portrait', split_horizontal: 'landscape', split_vertical: 'portrait',
  framed_plate: 'landscape', comparison_dual: 'landscape',
};
const functions = ['model_compression', 'anchor_metaphor'];
const cleanArtNegative = 'Zero text, letters, numbers, watermarks, logos, labels, UI, screenshots or marks that resemble writing.';
const slug = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const cleanFocal = value => typeof value === 'string' && value.length <= 100 && value === value.trim()
  && /^[\p{L}\p{M}][\p{L}\p{M} '’,-]*$/u.test(value) && slug(value).length >= 3;
const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

export function artDirectionInstructions(maxImages) {
  return [
    `Inclua artDirection com {master:{mediumEngine,lightAndOptics},plates:[{slideId,focalMetaphor,shotScale,silhouetteGeometry,panelAspect,cognitiveFunction}]}. Escolha de duas a ${maxImages} pranchas em ordem de lâmina. Use hero_bleed na capa, sempre com a primeira prancha.`,
    `Escolha mediumEngine de ${mediumEngines.join(', ')} e lightAndOptics de ${lightAndOptics.join(', ')}. O motor fixa essa direção, a paleta do deck e a proibição de texto em todos os rasters.`,
    `Cada focalMetaphor nomeia em até 100 caracteres uma cena ou objeto físico concreto, só com palavras e separadores comuns. Use shotScale de ${shotScales.join(', ')}, silhouetteGeometry de ${silhouetteGeometries.join(', ')} e cognitiveFunction de ${functions.join(', ')}. Não trate ilustração como prova real.`,
    'Enquadre para panelAspect portrait em hero_bleed e split_vertical ou landscape em split_horizontal, framed_plate e comparison_dual. Use outros arquétipos para diagramas ou texto. Uma lâmina com prancha não traz diagrama. Cada prancha muda ao menos três dos quatro eixos focalMetaphor, shotScale, silhouetteGeometry e panelAspect em relação à prancha anterior.',
  ].join(' ');
}

function inspectPlate(raw, slide) {
  if (!exactKeys(raw, ['slideId', 'focalMetaphor', 'shotScale', 'silhouetteGeometry', 'panelAspect', 'cognitiveFunction'])
    || !slide || slide.diagram !== undefined || panelByLayout[slide.layout] !== raw.panelAspect
    || !['portrait', 'landscape'].includes(raw.panelAspect) || !cleanFocal(raw.focalMetaphor)
    || !shotScales.includes(raw.shotScale) || !silhouetteGeometries.includes(raw.silhouetteGeometry)
    || !functions.includes(raw.cognitiveFunction)) return null;
  return { ...raw };
}

export function inspectArtDirection(value, deck, maxImages) {
  if (!exactKeys(value, ['master', 'plates']) || !exactKeys(value.master, ['mediumEngine', 'lightAndOptics'])
    || !mediumEngines.includes(value.master.mediumEngine) || !lightAndOptics.includes(value.master.lightAndOptics)
    || !Array.isArray(value.plates) || value.plates.length < 2 || value.plates.length > maxImages) {
    return { issue: 'ART_DIRECTION_CONTRACT' };
  }
  const slideOrder = new Map(deck.slides.map((slide, index) => [slide.id, { slide, index }]));
  const seen = new Set();
  const plates = [];
  for (const raw of value.plates) {
    const match = slideOrder.get(raw?.slideId);
    const shape = inspectPlate(raw, match?.slide);
    if (!shape || seen.has(raw.slideId)) return { issue: 'ART_PLATE_SLOT' };
    seen.add(raw.slideId);
    plates.push({ ...shape, slideIndex: match.index + 1 });
  }
  plates.sort((left, right) => left.slideIndex - right.slideIndex);
  if (plates[0].slideIndex !== 1 || deck.slides[0].layout !== 'hero_bleed') return { issue: 'ART_STYLE_ANCHOR' };
  for (const [index, plate] of plates.entries()) {
    const previous = plates[index - 1];
    if (!previous) continue;
    const changes = [slug(plate.focalMetaphor) !== slug(previous.focalMetaphor),
      ...['shotScale', 'silhouetteGeometry', 'panelAspect'].map(axis => plate[axis] !== previous[axis])];
    if (changes.filter(Boolean).length < 3) return { issue: 'ART_ORTHOGONALITY' };
  }
  const projected = {
    ...deck,
    slides: deck.slides.map(slide => seen.has(slide.id) ? { ...slide, art: true } : slide),
  };
  if (cadence(projected).status !== 'pass') return { issue: 'ART_PLANNED_CADENCE' };
  const { light, dark, accent } = paletteFor(deck.tokens);
  return { direction: {
    master: { ...value.master, paletteBinding: { light, dark, accent }, cleanArtNegative },
    plates,
  } };
}

export function artPlatePrompt({ master }, plate) {
  const anchor = plate.slideIndex === 1;
  const style = anchor ? 'Establish the editorial treatment of this collection.'
    : 'Use the only attached image strictly as a style reference for medium, palette, light, and texture. Create a new subject, silhouette and composition for this plate. Do not reproduce the reference subject or copy its geometry.';
  const framing = anchor ? 'Keep the main subject in the upper half and leave the lower half quiet for later typesetting.'
    : 'Frame the focal subject with breathing room inside the requested panel crop.';
  return [
    'Create one original fictional editorial illustration for an educational carousel. Generate only clean picture pixels. This is illustrative material.',
    style,
    'Master art direction: ' + JSON.stringify(master),
    'New concept and crop: ' + JSON.stringify({
      focalMetaphor: plate.focalMetaphor, shotScale: plate.shotScale,
      silhouetteGeometry: plate.silhouetteGeometry, panelAspect: plate.panelAspect, purpose: plate.cognitiveFunction,
    }),
    framing, master.cleanArtNegative,
  ].join(' ');
}

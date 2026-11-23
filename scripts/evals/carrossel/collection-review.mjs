import { demonstrationDiagrams } from '../../../packages/carousel-renderer/src/plan.mjs';
import { hasText, judgeBriefing, judgeDeckHash, readJudgeDocument } from './judge-evidence.mjs';
import { bounded, collectionWeights, formatVersion, isDigest, requireCondition, sha256 } from './protocol.mjs';

const coverageFloor = 0.12;
const gainFloor = 0.70;
const dimensions = Object.keys(collectionWeights);
const note = value => hasText(value) && value.length <= 600;

function reviewScores(input, slideCount) {
  requireCondition(input && typeof input === 'object' && !Array.isArray(input)
    && Object.keys(input).length === dimensions.length && dimensions.every(name => Object.hasOwn(input, name)),
  'O parecer de coleção precisa cobrir as quatro dimensões.');
  const observed = {};
  const unavailable = [];
  for (const name of dimensions) {
    const item = input[name];
    requireCondition(note(item?.evidence) && Array.isArray(item.slides) && item.slides.length <= slideCount
      && new Set(item.slides).size === item.slides.length
      && item.slides.every(value => Number.isInteger(value) && value >= 1 && value <= slideCount)
      && (item.status === 'observed' && item.slides.length > 0 && bounded(item.score, 100)
        || item.status === 'unknown' && item.score === undefined),
    'Nota de coleção sem observação ou lâminas vinculadas.');
    if (item.status === 'observed') observed[name] = { score: item.score, evidence: item.evidence, slides: item.slides };
    else unavailable.push(name);
  }
  return { scores: observed, unavailable };
}

function mediaKey(slide, rendered) {
  if (isDigest(rendered.artSource?.embeddedSha256)) return rendered.artSource.embeddedSha256;
  if (slide.diagram) {
    const { type = slide.diagram, labels, items, sample } = slide.diagram;
    return sha256(JSON.stringify({ type, labels, items, sample }));
  }
  return rendered.sha256;
}

function reviewSlides(plan, renderChecks, contactSheetSha256, jpgHashes, slides) {
  requireCondition(Array.isArray(plan.slides) && Array.isArray(renderChecks?.slides) && Array.isArray(renderChecks.artifacts)
    && Array.isArray(slides) && plan.slides.length >= 2 && plan.slides.length <= 20
    && [jpgHashes, slides, renderChecks.slides].every(list => list.length === plan.slides.length)
    && renderChecks.artifacts.some(artifact => artifact?.file === 'contact-sheet.png' && artifact.sha256 === contactSheetSha256),
  'As lâminas ou a folha do parecer divergem do recibo do renderer.');
  const ids = new Set();
  const visible = new Set();
  return plan.slides.map((slide, offset) => {
    const output = renderChecks.slides[offset];
    const observation = slides[offset];
    const index = offset + 1;
    const file = 'slide-' + String(index).padStart(2, '0') + '.jpg';
    const digest = jpgHashes[offset];
    requireCondition(hasText(slide?.id) && !ids.has(slide.id) && slide.id === output?.id && slide.id === observation?.id
      && output.index === index && observation.index === index && output.file === file && isDigest(digest)
      && digest === output.sha256 && digest === observation.sha256 && bounded(output.artAreaFraction, 1)
      && note(observation.evidence) && ['novel', 'reused', 'none', 'unknown'].includes(observation.visual),
    'O parecer de coleção diverge de uma lâmina renderizada.');
    ids.add(slide.id);
    const eligibleMedia = output.artAreaFraction >= coverageFloor;
    const key = mediaKey(slide, output);
    if (observation.visual === 'novel' || observation.visual === 'reused') {
      requireCondition(eligibleMedia, 'A mídia observada fica abaixo da cobertura mínima no quadro.');
    }
    if (eligibleMedia && observation.visual === 'novel') {
      requireCondition(!visible.has(key), 'A mesma mídia visível foi registrada como inédita mais de uma vez.');
    }
    if (eligibleMedia) visible.add(key);
    return { slide, id: slide.id, index, visual: observation.visual, artAreaFraction: output.artAreaFraction };
  });
}

function dualDelivery(slides, novelty, mode) {
  const byId = new Map((novelty?.observations ?? []).map(item => [item.id, item]));
  const eligible = slides.filter(({ slide, index }) => index > 1
    && !(index === slides.length && slide.layout === 'cta_closing' && !demonstrationDiagrams.includes(slide.diagram?.type))
    && !(index === slides.length - 1 && byId.get(slide.id)?.role === 'recap'));
  let observed = 0;
  let dual = 0;
  for (const item of eligible) {
    const gain = novelty?.result.embeddingsComplete ? byId.get(item.id)?.gain : undefined;
    const gainKnown = bounded(gain, 1);
    const knownAbsent = item.artAreaFraction < coverageFloor || ['none', 'reused'].includes(item.visual)
      || (gainKnown && gain < gainFloor);
    if (knownAbsent || (item.visual === 'novel' && gainKnown)) {
      observed += 1;
      if (!knownAbsent) dual += 1;
    }
  }
  return {
    applicable: mode === 'editorial_art', eligible: eligible.length, observed, dual,
    value: eligible.length > 0 && observed === eligible.length ? dual / eligible.length : null,
  };
}

export async function verifyCollectionReview(directory, reference, context) {
  if (reference === undefined) return null;
  const { plan, renderChecks, contactSheetSha256, jpgHashes, novelty, testCase } = context;
  requireCondition(/^collection-(?:first-pass|final)\.json$/.test(reference?.file ?? '') && isDigest(reference.sha256)
    && isDigest(plan?.digest) && isDigest(renderChecks?.digest) && isDigest(contactSheetSha256)
    && ['editorial_art', 'native_serial'].includes(testCase.mode) && plan.value?.mode === testCase.mode,
  'Referência de coleção inválida ou sem plano, folhas e recibo verificáveis.');
  const { value, digest } = await readJudgeDocument(directory, reference.file);
  const { reviewer } = value ?? {};
  requireCondition(digest === reference.sha256 && value?.version === formatVersion && value.scope === 'collection'
    && value.mode === testCase.mode && value.planSha256 === plan.digest && value.renderChecksSha256 === renderChecks.digest
    && value.contactSheetSha256 === contactSheetSha256 && value.deckSha256 === judgeDeckHash(jpgHashes)
    && value.briefingSha256 === sha256(judgeBriefing(testCase)) && value.noveltySha256 === (novelty?.result.assessmentSha256 ?? null)
    && ['human', 'vlm'].includes(reviewer?.method) && hasText(reviewer.identity) && reviewer.identity.length <= 160,
  'O parecer de coleção diverge dos hashes do briefing, plano, JPEGs, folha, render ou novidade.');
  const slides = reviewSlides(plan.value, renderChecks.value, contactSheetSha256, jpgHashes, value.slides);
  const { scores, unavailable } = reviewScores(value.scores, slides.length);
  return {
    status: unavailable.length ? 'unavailable' : 'verified', sha256: digest, reviewer,
    mode: testCase.mode, scores, unavailable,
    vac: slides.filter(item => item.artAreaFraction >= coverageFloor).length / slides.length,
    ddr: dualDelivery(slides, novelty, testCase.mode),
  };
}

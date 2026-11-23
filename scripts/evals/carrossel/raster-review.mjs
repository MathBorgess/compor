import { bounded, formatVersion, isDigest, requireCondition } from './protocol.mjs';
import { hasText, readJudgeDocument } from './judge-evidence.mjs';

const positiveInteger = value => Number.isInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isInteger(value) && value >= 0;
const slideId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

export function validNormalizedBox(box) {
  return box && [box.left, box.top, box.right, box.bottom].every(value => bounded(value, 1))
    && box.left < box.right && box.top < box.bottom;
}

function rasterTiles(renderChecks, sheetSha256) {
  const artifacts = renderChecks?.artifacts;
  const slides = renderChecks?.slides;
  requireCondition(Array.isArray(artifacts) && Array.isArray(slides), 'O recibo do renderer não identifica recortes de arte.');
  const record = artifacts.find(item => item?.file === 'art-sheet.jpg');
  requireCondition(record?.sha256 === sheetSha256 && Array.isArray(record.tiles) && record.tiles.length > 0
    && record.tiles.length <= 20, 'O recibo de render precisa identificar os recortes da folha de arte verificada.');
  const raster = slides.filter(slide => slide?.artSource);
  const byIndex = new Map(raster.map(slide => [slide.index, slide]));
  requireCondition(raster.length === record.tiles.length && byIndex.size === raster.length, 'A lista de recortes diverge das fontes raster.');
  const cells = new Set();
  const byId = new Map();
  for (const tile of record.tiles) {
    const slide = byIndex.get(tile?.slideIndex);
    const art = slide?.artSource;
    const cell = tile?.row + ':' + tile?.column;
    requireCondition(positiveInteger(tile?.slideIndex) && tile.slideIndex <= 20 && slideId(tile.slideId) && tile.slideId === slide?.id
      && nonnegativeInteger(tile.row) && nonnegativeInteger(tile.column) && !cells.has(cell) && !byId.has(tile.slideId)
      && isDigest(art?.sha256) && isDigest(art.embeddedSha256) && positiveInteger(art.bytes)
      && ['png', 'jpeg', 'webp'].includes(art.format) && positiveInteger(art.width) && positiveInteger(art.height),
    'Recorte raster incoerente com a origem registrada pelo renderer.');
    cells.add(cell);
    byId.set(tile.slideId, { ...tile, embeddedSha256: art.embeddedSha256, artPlacement: slide.artPlacement });
  }
  return byId;
}

export async function readRasterReview(
  directory, reference, { planSha256, artSheetSha256, renderChecks, rasterDeclared }, { scope, prefix, subject },
) {
  const required = rasterDeclared || Boolean(artSheetSha256);
  if (reference === undefined) return { required, status: required ? 'unavailable' : 'not_applicable' };
  requireCondition(['first-pass', 'final'].some(snapshot => reference?.file === `${prefix}-${snapshot}.json`)
    && isDigest(reference.sha256) && isDigest(artSheetSha256) && isDigest(planSha256) && renderChecks,
  `Referência de ${subject} inválida ou sem raster verificável.`);
  const { value, digest } = await readJudgeDocument(directory, reference.file);
  requireCondition(digest === reference.sha256 && value?.version === formatVersion && value.scope === scope
    && value.planSha256 === planSha256 && value.artSheetSha256 === artSheetSha256 && value.renderChecksSha256 === renderChecks.digest,
  `O parecer de ${subject} diverge dos hashes do plano, folha ou recibo do renderer.`);
  const { reviewer, observations } = value;
  const tiles = rasterTiles(renderChecks.value, artSheetSha256);
  requireCondition(['human', 'local_detector', 'vlm'].includes(reviewer?.method) && hasText(reviewer.identity)
    && reviewer.identity.length <= 160 && Array.isArray(observations) && observations.length === tiles.size,
  `O parecer de ${subject} precisa identificar o revisor e cobrir os recortes de todas as fontes raster.`);
  const observed = new Set();
  const entries = observations.map(observation => {
    const tile = tiles.get(observation?.slideId);
    requireCondition(tile && !observed.has(tile.slideId) && tile.slideIndex === observation.slideIndex
      && tile.embeddedSha256 === observation.embeddedSha256 && hasText(observation.evidence) && observation.evidence.length <= 600,
    'Observação raster sem vínculo, veredito ou região verificável.');
    observed.add(tile.slideId);
    return { tile, observation };
  });
  return { required, scope, sha256: digest, entries };
}

import { bounded, formatVersion, isDigest, requireCondition } from './protocol.mjs';
import { hasText, readJudgeDocument } from './judge-evidence.mjs';

const scope = 'raster-text';
const statuses = ['pass', 'fail', 'unknown'];
const positiveInteger = value => Number.isInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isInteger(value) && value >= 0;
const slideId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

function validBox(box) {
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
    byId.set(tile.slideId, { ...tile, embeddedSha256: art.embeddedSha256 });
  }
  return byId;
}

export async function verifyArtPurity(directory, reference, { planSha256, artSheetSha256, renderChecks, rasterDeclared }) {
  const required = rasterDeclared || Boolean(artSheetSha256);
  if (reference === undefined) return { required, status: required ? 'unavailable' : 'not_applicable' };
  requireCondition(/^art-purity-(?:first-pass|final)\.json$/.test(reference?.file ?? '') && isDigest(reference.sha256)
    && isDigest(artSheetSha256) && isDigest(planSha256) && renderChecks, 'Referência de pureza da arte inválida ou sem raster verificável.');
  const { value, digest } = await readJudgeDocument(directory, reference.file);
  requireCondition(digest === reference.sha256 && value?.version === formatVersion && value.scope === scope
    && value.planSha256 === planSha256 && value.artSheetSha256 === artSheetSha256 && value.renderChecksSha256 === renderChecks.digest,
  'O parecer de pureza diverge dos hashes do plano, folha ou recibo do renderer.');
  const { reviewer, observations } = value;
  const tiles = rasterTiles(renderChecks.value, artSheetSha256);
  requireCondition(['human', 'local_detector', 'vlm'].includes(reviewer?.method) && hasText(reviewer.identity)
    && reviewer.identity.length <= 160 && Array.isArray(observations) && observations.length === tiles.size,
  'O parecer de pureza precisa identificar o revisor e cobrir os recortes de todas as fontes raster.');
  const observed = new Set();
  const results = [];
  for (const observation of observations) {
    const tile = tiles.get(observation?.slideId);
    const { verdict, evidence, findings } = observation ?? {};
    requireCondition(tile && !observed.has(tile.slideId) && tile.slideIndex === observation.slideIndex
      && tile.embeddedSha256 === observation.embeddedSha256 && statuses.includes(verdict)
      && hasText(evidence) && evidence.length <= 600 && Array.isArray(findings) && findings.length <= 20
      && (verdict === 'fail' ? findings.length > 0 : findings.length === 0)
      && findings.every(item => item?.code === 'TEXT_IN_ART_LAYER' && validBox(item.box)),
    'Observação raster sem vínculo, veredito ou região verificável.');
    observed.add(tile.slideId);
    results.push({
      slideIndex: tile.slideIndex, slideId: tile.slideId, column: tile.column, row: tile.row, verdict,
      findings: findings.map(({ code, box: { left, top, right, bottom } }) => ({ code, box: { left, top, right, bottom } })),
    });
  }
  const status = results.some(item => item.verdict === 'fail') ? 'fail'
    : results.every(item => item.verdict === 'pass') ? 'pass' : 'unavailable';
  return { required, status, scope, sha256: digest, results };
}

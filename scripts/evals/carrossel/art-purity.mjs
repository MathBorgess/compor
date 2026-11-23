import { requireCondition } from './protocol.mjs';
import { readRasterReview, validNormalizedBox } from './raster-review.mjs';

const reviewType = { scope: 'raster-text', prefix: 'art-purity', subject: 'pureza' };
const statuses = ['pass', 'fail', 'unknown'];

export async function verifyArtPurity(directory, reference, snapshot) {
  const { entries, ...trace } = await readRasterReview(directory, reference, snapshot, reviewType);
  if (!entries) return trace;
  const results = entries.map(({ tile, observation }) => {
    const { verdict, findings } = observation;
    requireCondition(statuses.includes(verdict) && Array.isArray(findings) && findings.length <= 20
      && (verdict === 'fail' ? findings.length > 0 : findings.length === 0)
      && findings.every(item => item?.code === 'TEXT_IN_ART_LAYER' && validNormalizedBox(item.box)),
    'Observação raster sem vínculo, veredito ou região verificável.');
    return {
      slideIndex: tile.slideIndex, slideId: tile.slideId, column: tile.column, row: tile.row, verdict,
      findings: findings.map(({ code, box: { left, top, right, bottom } }) => ({ code, box: { left, top, right, bottom } })),
    };
  });
  const status = results.some(item => item.verdict === 'fail') ? 'fail'
    : results.every(item => item.verdict === 'pass') ? 'pass' : 'unavailable';
  return { ...trace, status, results };
}

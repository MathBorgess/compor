const wordSegments = new Intl.Segmenter('pt-BR', { granularity: 'word' });
const graphemeSegments = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

// Match the hard cover budget in the renderer. Eight words is the editorial target.
const coverCount = 10;
const wordLimit = 11;
const graphemeLimit = 65;

function normalizedHeadline(value) {
  return value.normalize('NFKD').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]/gu, '');
}

function candidateStats(headline, index) {
  const valid = typeof headline === 'string' && Boolean(normalizedHeadline(headline));
  const words = valid ? Array.from(wordSegments.segment(headline)).filter(item => item.isWordLike).length : null;
  const graphemes = valid ? Array.from(graphemeSegments.segment(headline)).length : null;
  const eligible = valid && words <= wordLimit && graphemes <= graphemeLimit;
  return { position: index + 1, words, graphemes, eligible, meetsTarget: eligible && words <= 8 };
}

export function inspectCoverLab(lab, headline) {
  const options = lab?.options;
  const ranking = lab?.ranking;
  const candidates = Array.isArray(options) ? options.map(candidateStats) : [];
  const violations = [];

  if (candidates.length !== coverCount || candidates.some(candidate => candidate.words === null)) {
    violations.push('COVER_LAB_OPTIONS');
  } else if (new Set(options.map(normalizedHeadline)).size !== coverCount) {
    violations.push('COVER_LAB_DUPLICATE');
  }

  const eligible = candidates.filter(candidate => candidate.eligible).map(candidate => candidate.position);
  const order = ranking?.order;
  const validOrder = eligible.length > 0 && Array.isArray(order) && order.length === eligible.length &&
    new Set(order).size === order.length && order.every(position => eligible.includes(position));
  if (!validOrder || typeof ranking?.rationale !== 'string' || !ranking.rationale.trim() || ranking.rationale.length > 1000) {
    violations.push('COVER_LAB_RANKING');
  }
  if (!validOrder || typeof headline !== 'string' || options[order[0] - 1] !== headline) {
    violations.push('COVER_LAB_SELECTION');
  }

  return {
    status: violations.length ? 'fail' : 'pass',
    candidates,
    eligible,
    selected: validOrder ? order[0] : null,
    violations,
  };
}

export function coverLabArtifact(deck, inputSha256) {
  if (!deck || !Object.hasOwn(deck, 'coverLab')) return null;
  return { version: 1, inputSha256, ...inspectCoverLab(deck.coverLab, deck.slides?.[0]?.headline) };
}

import { requireCondition, sha256 } from './protocol.mjs';

const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'word' });
const scaffold = /^\s*(?:(?:passo|regra|erro|item)\s+\d+\s*[:.–-]|(?:mito|fato)\s*:)\s*/iu;
const exclude = new Set(['scannable_recap', 'single_ask_cta', 'recap', 'cta']);

export function stripScaffold(copy) {
  return String(copy).normalize('NFKC').split('\n').map(line => line.replace(scaffold, '')).join('\n').trim();
}

function trigrams(text) {
  const words = Array.from(segmenter.segment(text.toLocaleLowerCase('pt-BR')))
    .filter(word => word.isWordLike).map(word => word.segment);
  return new Set(words.slice(2).map((word, index) => [words[index], words[index + 1], word].join(' ')));
}

function overlap(a, b) {
  const total = new Set([...a, ...b]).size;
  return total ? [...a].filter(value => b.has(value)).length / total : null;
}

function unitVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions || !vector.every(Number.isFinite)) return null;
  const length = Math.hypot(...vector);
  return length > Number.EPSILON && Number.isFinite(length) ? vector.map(value => value / length) : null;
}

function cosine(a, b) {
  if (!a || !b) return null;
  return Math.max(-1, Math.min(1, a.reduce((sum, value, index) => sum + value * b[index], 0)));
}

function requireObservation(items) {
  const dimensions = items.find(item => Array.isArray(item.embedding))?.embedding.length ?? 0;
  const embeddings = items.map(item => dimensions >= 2 && dimensions <= 3072 ? unitVector(item.embedding, dimensions) : null);
  if (embeddings.length === 0 || embeddings.some(value => value === null)) {
    return { embeddings, residuals: items.map(() => null), complete: false };
  }
  const center = Array.from({ length: dimensions }, (_, index) =>
    embeddings.reduce((sum, vector) => sum + vector[index], 0) / embeddings.length);
  const residuals = embeddings.map(vector => unitVector(vector.map((value, index) => value - center[index]), dimensions));
  return { embeddings, residuals, complete: true };
}

function scoreGain(items) {
  const gains = items.map(({ gain }) => gain);
  const observed = gains.filter(gain => Number.isFinite(gain) && gain >= 0 && gain <= 1);
  const belowFloor = items.filter(item => Number.isFinite(item.gain) && item.gain >= 0 && item.gain < 0.5).map(item => item.id);
  return {
    mean: observed.length === items.length && observed.length > 0
      ? observed.reduce((sum, gain) => sum + gain, 0) / observed.length : null,
    belowFloor,
  };
}

export function measureNovelty(slides) {
  const content = slides.filter(slide => !exclude.has(slide.role));
  const grams = content.map(item => trigrams(stripScaffold(item.text)));
  const { embeddings, residuals, complete } = requireObservation(content);
  const pairs = [];
  for (const [index, first] of content.entries()) {
    for (let offset = index + 1; offset < content.length; offset += 1) {
      const next = content[offset];
      const raw = cosine(embeddings[index], embeddings[offset]);
      const centered = cosine(residuals[index], residuals[offset]);
      const cleanJaccard = overlap(grams[index], grams[offset]);
      const repeatedByGain = raw > 0.80 && Number.isFinite(next.gain) && next.gain < 0.50;
      const fail = raw > 0.88 || (raw > 0.84 && centered > 0.55) || repeatedByGain || cleanJaccard > 0.35;
      pairs.push({ ids: [first.id, next.id], raw, centered, cleanJaccard, fail });
    }
  }
  const { mean, belowFloor } = scoreGain(content);
  const operations = new Set(content.map(item => item.cognitiveOperation).filter(value => typeof value === 'string' && value.trim())).size;
  const diversity = slides.length < 7 || operations >= 4;
  const fail = pairs.some(pair => pair.fail) || belowFloor.length > 0 || (mean !== null && mean < 0.75) ||
    (!diversity && content.every(item => item.cognitiveOperation));
  return {
    status: fail ? 'fail' : complete && mean !== null && diversity && pairs.length ? 'pass' : 'unknown',
    pairs, migMean: mean, belowFloor, distinctCognitiveOperations: operations, embeddingsComplete: complete,
  };
}

export function reviewNovelty(plan, assessment) {
  const { model, inputSha256, slides } = assessment.value ?? {};
  requireCondition(model === 'text-embedding-3-small' && inputSha256 === plan.digest &&
    Array.isArray(slides) && slides.length <= 20 && Array.isArray(plan.value?.slides) && plan.value.slides.length <= 20,
    'Observação de novidade sem modelo, plano e lâminas vinculados.');
  const byId = new Map(slides.map(slide => [slide?.id, slide]));
  const items = plan.value.slides.map((slide, index) => {
    requireCondition(typeof slide?.id === 'string' && typeof slide.headline === 'string', 'Lâmina do plano inválida.');
    const text = stripScaffold([slide.headline, slide.body, ...(slide.listItems ?? [])].filter(Boolean).join('\n'));
    const observation = byId.get(slide.id);
    if (observation) {
      requireCondition(observation.textSha256 === sha256(text) && typeof observation.evidence === 'string' && observation.evidence.trim(),
        'Julgamento de novidade desvinculado da copy ou sem evidência.');
      byId.delete(slide.id);
    }
    return {
      id: slide.id, text, role: slide.layout === 'cta_closing' && index === plan.value.slides.length - 1 ? 'cta'
        : observation?.role === 'recap' && index === plan.value.slides.length - 2 ? 'recap' : undefined,
      embedding: observation?.embedding, gain: observation?.gain, cognitiveOperation: observation?.cognitiveOperation,
    };
  });
  requireCondition(byId.size === 0 && new Set(slides.map(slide => slide?.id)).size === slides.length, 'Observação de lâmina ambígua ou desconhecida.');
  return { model, inputSha256, assessmentSha256: assessment.digest, ...measureNovelty(items) };
}

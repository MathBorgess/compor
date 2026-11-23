import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const formatVersion = 1;
export const physicalChecks = [
  'LAYOUT_OVERFLOW', 'TEXT_COLLISION', 'SAFE_ZONE', 'TYPOGRAPHY',
  'TEXT_CONTRAST', 'ASSET_DECODE', 'JPEG_PROFILE',
];
export const requiredChecks = {
  physical: physicalChecks,
  editorial: ['FACT_GROUNDING', 'S2_STANDALONE', 'CTA_SINGLE', 'ALT_TEXT'],
  collection: ['COLLECTION_CADENCE', 'DUPLICATE_VISUAL', 'ART_PURITY'],
};
export const collectionWeights = { visualDelivery: 25, diversity: 25, progression: 30, cohesion: 20 };
export const judgeWeights = {
  cover: 16, editorial: 15, artMessage: 15, hierarchy: 14,
  rhythm: 13, reentry: 11, voice: 9, closing: 7,
};

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function isDigest(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function isId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

export function bounded(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

export async function readDocument(path) {
  const bytes = await readFile(path);
  return { value: JSON.parse(bytes), digest: sha256(bytes) };
}

export async function readSuite(path, split, expectedDigest) {
  const { value, digest } = await readDocument(path);
  if (split !== 'dev') {
    requireCondition(isDigest(expectedDigest) && digest === expectedDigest,
      'O SHA-256 da suíte privada diverge do valor congelado.');
  }
  const expectedSize = split === 'dev' ? 10 : 6;
  requireCondition(value?.version === formatVersion && value.split === split && Array.isArray(value.cases) && value.cases.length === expectedSize,
    `A suíte ${split} exige ${expectedSize} casos na versão ${formatVersion}.`);
  const ids = new Set();
  for (const item of value.cases) {
    requireCondition(isId(item.id) && !ids.has(item.id)
      && ['editorial_art', 'native_serial'].includes(item.mode)
      && ['deliver_deck', 'reject_claim'].includes(item.expected)
      && typeof item.briefing === 'string' && item.briefing.trim()
      && Array.isArray(item.facts) && item.facts.every(fact => typeof fact === 'string' && fact.trim())
      && Array.isArray(item.strata) && item.strata.length && item.strata.every(isId),
    'Caso de avaliação inválido ou repetido.');
    ids.add(item.id);
  }
  requireCondition(value.cases.some(item => item.expected === 'deliver_deck'), 'A suíte exige ao menos um caso de entrega.');
  return { cases: value.cases.map(item => ({ ...item, split })), digest };
}

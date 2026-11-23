import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDiagram, validateDeck } from '../../../packages/carousel-renderer/src/plan.mjs';
import { isDigest, isId, requireCondition, sha256 } from './protocol.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const sides = ['A', 'B'];
const maxBundleBytes = 128 * 1024;
const maxPlanBytes = 32 * 1024;
const caseTarget = ({ caseId, side, slideId }) => `${caseId}/${side}/${slideId}`;
const validSlideId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

function relativeJson(file) {
  return typeof file === 'string' && file.length <= 240 && file.endsWith('.json') &&
    file.split('/').every(part => part !== '.' && part !== '..' && /^[A-Za-z0-9._-]+$/.test(part));
}

async function readPinnedJson(root, file, digest, maximum) {
  requireCondition(relativeJson(file) && isDigest(digest), 'Referência JSON inválida no preflight de diagramas.');
  const path = resolve(root, file);
  requireCondition(await realpath(path) === path, 'O preflight de diagramas exige caminhos JSON sem redirecionamento.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    requireCondition(stat.isFile() && stat.size <= maximum, 'Arquivo JSON inválido ou grande demais no preflight de diagramas.');
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const bytes = buffer.subarray(0, offset);
    requireCondition(bytes.length <= maximum && sha256(bytes) === digest, 'SHA-256 divergente no preflight de diagramas.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    await handle.close();
  }
}

function categorySplit(panels) {
  return { type: 'category_split', labels: panels.map(panel => panel.label), items: panels.map(panel => panel.item) };
}

function validExpectation(expectation) {
  if (!exactKeys(expectation, ['slideId', 'decision', 'panels']) || !validSlideId(expectation.slideId)) return false;
  const { decision, panels } = expectation;
  return exactKeys(decision, ['slot', 'quote']) && ['body', 'headline'].includes(decision.slot) &&
    typeof decision.quote === 'string' && decision.quote.trim().length > 0 && decision.quote.length <= 480 &&
    Array.isArray(panels) && panels.length === 2 && panels.every(panel => exactKeys(panel, ['label', 'item'])) &&
    isDiagram(categorySplit(panels));
}

function sideExpectations(input) {
  requireCondition(exactKeys(input, ['plan', 'slides']) && exactKeys(input.plan, ['file', 'sha256']) &&
    relativeJson(input.plan.file) && isDigest(input.plan.sha256) && Array.isArray(input.slides) &&
    input.slides.length <= 10 && input.slides.every(validExpectation), 'Expectativa inválida no preflight de diagramas.');
  const expectations = new Map(input.slides.map(item => [item.slideId, item]));
  requireCondition(expectations.size === input.slides.length, 'Expectativas de diagrama repetidas no mesmo lado.');
  return expectations;
}

function relationKeys({ labels, items }) {
  return labels.map((label, i) => JSON.stringify([label.normalize('NFC'), items[i].normalize('NFC')])).sort();
}

function checkCategory(slide, expected, expectMismatch) {
  if (!expected) return { status: 'unchecked' };
  const { slot, quote } = expected.decision;
  if (!slide[slot]?.normalize('NFC').includes(quote.normalize('NFC'))) {
    return { status: 'fail', reason: 'decision_not_found' };
  }
  const actualPairs = relationKeys(slide.diagram);
  const expectedPairs = relationKeys(categorySplit(expected.panels));
  const relationMatches = actualPairs.every((pair, index) => pair === expectedPairs[index]);
  if (expectMismatch) return relationMatches ? { status: 'fail', reason: 'expected_mismatch_missing' } : { status: 'expected_mismatch' };
  return relationMatches ? { status: 'pass' } : { status: 'fail', reason: 'panel_relation_mismatch' };
}

function mismatchTargets(scopes) {
  requireCondition(Array.isArray(scopes) && scopes.length <= 30 && scopes.every(scope =>
    exactKeys(scope, ['caseId', 'side', 'slideId']) && isId(scope.caseId) && sides.includes(scope.side) && validSlideId(scope.slideId)),
  'Alvo de divergência esperada inválido no preflight de diagramas.');
  const targets = new Map(scopes.map(scope => [caseTarget(scope), scope]));
  requireCondition(targets.size === scopes.length, 'Alvo de divergência esperada repetido no preflight de diagramas.');
  return targets;
}

export async function inspectCalibrationDiagrams({ directory, bundleFile = 'diagram-preflight.json', bundleSha256, expectedMismatches = [] } = {}) {
  const targets = mismatchTargets(expectedMismatches);
  if (directory === undefined && bundleSha256 === undefined && bundleFile === 'diagram-preflight.json' && targets.size === 0) {
    return { status: 'unchecked', checks: [] };
  }
  requireCondition(typeof directory === 'string' && isAbsolute(directory) && isDigest(bundleSha256),
    'Informe o diretório privado absoluto e o SHA-256 do preflight de diagramas.');
  const root = await realpath(directory);
  const repo = await realpath(repository);
  requireCondition(relative(repo, root).startsWith(`..${sep}`) && relative(root, repo).startsWith(`..${sep}`),
    'O preflight de diagramas precisa permanecer fora do repositório.');
  const bundle = await readPinnedJson(root, bundleFile, bundleSha256, maxBundleBytes);
  requireCondition(exactKeys(bundle, ['version', 'cases']) && bundle.version === 1 &&
    Array.isArray(bundle.cases) && bundle.cases.length >= 1 && bundle.cases.length <= 30,
  'Bundle inválido no preflight de diagramas.');

  const checks = [];
  const seenCases = new Set();
  for (const item of bundle.cases) {
    requireCondition(exactKeys(item, ['id', 'sides']) && isId(item.id) && !seenCases.has(item.id) &&
      object(item.sides) && Object.keys(item.sides).length > 0 && Object.keys(item.sides).every(side => sides.includes(side)),
    'Caso ou lado inválido no preflight de diagramas.');
    seenCases.add(item.id);
    for (const [side, input] of Object.entries(item.sides)) {
      const expectations = sideExpectations(input);
      const plan = await readPinnedJson(root, input.plan.file, input.plan.sha256, maxPlanBytes);
      requireCondition(validateDeck(plan).length === 0, 'Plano inválido no preflight de diagramas.');
      const comparisons = plan.slides.filter(slide => slide.diagram?.type === 'category_split');
      requireCondition([...expectations.keys()].every(id => comparisons.some(slide => slide.id === id)),
        'Uma expectativa do preflight não corresponde a um category_split do plano.');
      for (const slide of comparisons) {
        const scope = { caseId: item.id, side, slideId: slide.id };
        const expectation = expectations.get(slide.id);
        const expectMismatch = expectation !== undefined && targets.delete(caseTarget(scope));
        checks.push({ ...scope, planSha256: input.plan.sha256, ...checkCategory(slide, expectation, expectMismatch) });
      }
    }
  }
  for (const scope of targets.values()) checks.push({ ...scope, status: 'fail', reason: 'expected_mismatch_outside_expectations' });
  const status = checks.some(check => check.status === 'fail') ? 'fail'
    : checks.some(check => check.status !== 'unchecked') ? 'pass' : 'unchecked';
  return { status, bundleSha256, checks };
}

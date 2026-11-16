import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BUDGET_KEYS, digestJson, sha256, validateGoal, validateManifest, validateObservations } from './contracts.mjs';

const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

async function confinedRead(directory, relativePath) {
  const base = await realpath(directory);
  const target = await realpath(resolve(base, relativePath));
  if (!target.startsWith(`${base}${sep}`)) throw new Error('artifact escapes run directory');
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES) throw new Error('artifact must be a bounded regular file');
  return readFile(target);
}

function lookup(artifact, pointer) {
  let value = artifact;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return { found: false };
    value = value[key];
  }
  return { found: true, value };
}

function observation(artifacts, id, pointer) {
  const artifact = artifacts.get(id);
  if (!artifact || artifact.error) return { found: false, reason: artifact?.error ?? `missing artifact ${id}` };
  if (artifact.kind !== 'observations') return { found: false, reason: `artifact ${id} is not observations` };
  const result = lookup(artifact.value, pointer);
  return { ...result, reason: result.found ? undefined : `missing observation ${id}#${pointer}` };
}

function checkResult(check, artifacts) {
  if (check.kind === 'file-digest') {
    const file = artifacts.get(check.artifact);
    const expected = observation(artifacts, check.expectedArtifact, check.expectedPath);
    if (!file || file.error || !expected.found) return { status: 'inconclusivo', reason: file?.error ?? expected.reason ?? `missing file ${check.artifact}` };
    if (file.kind !== 'file') return { status: 'inconclusivo', reason: `${check.artifact} is not a file artifact` };
    return { status: file.digest === expected.value ? 'atendido' : 'violado', reason: 'file bytes compared with independently observed digest' };
  }
  const actual = observation(artifacts, check.artifact, check.path);
  if (!actual.found) return { status: 'inconclusivo', reason: actual.reason };
  let matches;
  if (['same', 'includes'].includes(check.kind)) {
    const other = observation(artifacts, check.artifact, check.otherPath);
    if (!other.found) return { status: 'inconclusivo', reason: other.reason };
    matches = check.kind === 'same' ? isDeepStrictEqual(actual.value, other.value)
      : Array.isArray(actual.value) && actual.value.some(entry => isDeepStrictEqual(entry, other.value));
  } else if (check.kind === 'length') matches = Array.isArray(actual.value) && actual.value.length === check.expected;
  else if (check.kind === 'minimum-length') matches = Array.isArray(actual.value) && actual.value.length >= check.expected;
  else if (check.kind === 'one-of') matches = check.expected.some(expected => isDeepStrictEqual(actual.value, expected));
  else matches = isDeepStrictEqual(actual.value, check.expected);
  return { status: matches ? 'atendido' : 'violado', reason: `${check.kind} comparison at ${check.artifact}#${check.path}` };
}

function summarize(statuses) {
  if (statuses.includes('violado')) return 'violado';
  if (statuses.includes('inconclusivo') || statuses.length === 0) return 'inconclusivo';
  return 'atendido';
}

function invalidReport(goal, reasons) {
  return {
    schemaVersion: 'evaluation/v1', goalId: goal.id, profile: null, status: 'inconclusivo', passed: false,
    integrity: { valid: false, reasons }, completion: { complete: false, reasons: ['invalid manifest or trusted inputs'] },
    criteria: goal.criteria.map(criterion => ({ id: criterion.id, profile: criterion.profile, status: 'inconclusivo', reason: 'run provenance could not be verified', checks: [] })),
    modelUsage: { tokens: null, costUsd: null },
  };
}

function provenanceIssues(manifest, goal, options) {
  const issues = [];
  if (digestJson(goal) !== options.expectedGoalDigest || manifest.goalDigest !== options.expectedGoalDigest) issues.push('goal digest mismatch');
  if (manifest.suiteDigest !== options.expectedSuiteDigest) issues.push('suite digest mismatch');
  if (manifest.goalId !== goal.id || manifest.goalRevision !== goal.revision) issues.push('goal identity mismatch');
  if (!goal.requiredProfiles.includes(manifest.profile)) issues.push('unexpected profile');
  for (const [field, expected] of [['appRevision', options.expectedAppRevision], ['snapshotDigest', options.expectedSnapshotDigest], ['runId', options.expectedRunId]]) {
    if (expected !== undefined && manifest[field] !== expected) issues.push(`${field} mismatch`);
  }
  for (const key of BUDGET_KEYS) if (manifest.budgets[key] > goal.budgets[key]) issues.push(`budget ${key} exceeds fixed goal`);
  return issues;
}

async function loadArtifacts(runDir, manifest) {
  const artifacts = new Map();
  await Promise.all(manifest.artifacts.map(async descriptor => {
    try {
      const bytes = await confinedRead(runDir, descriptor.path);
      const digest = sha256(bytes);
      if (digest !== descriptor.sha256) throw new Error(`artifact digest mismatch: ${descriptor.id}`);
      const value = descriptor.kind === 'observations' ? validateObservations(JSON.parse(bytes.toString('utf8'))) : undefined;
      artifacts.set(descriptor.id, { ...descriptor, digest, value });
    } catch (error) { artifacts.set(descriptor.id, { ...descriptor, error: error.message }); }
  }));
  return artifacts;
}

export async function evaluate(runDir, options) {
  const goal = validateGoal(options.goal);
  for (const key of ['expectedGoalDigest', 'expectedSuiteDigest', 'expectedSnapshotDigest']) {
    if (typeof options[key] !== 'string' || !/^[a-f0-9]{64}$/.test(options[key])) throw new TypeError(`${key} must be a trusted SHA256 digest`);
  }
  if (typeof options.expectedAppRevision !== 'string' || !/^[a-f0-9]{40}$/.test(options.expectedAppRevision)) throw new TypeError('expectedAppRevision must be a trusted Git revision');
  let manifest;
  try { manifest = validateManifest(JSON.parse((await confinedRead(runDir, 'manifest.json')).toString('utf8'))); }
  catch (error) { return invalidReport(goal, [error.message]); }
  const provenance = provenanceIssues(manifest, goal, options);
  if (provenance.length) return invalidReport(goal, provenance);
  const artifacts = await loadArtifacts(runDir, manifest);
  const integrityReasons = [...artifacts.values()].filter(artifact => artifact.error).map(artifact => `${artifact.id}: ${artifact.error}`);
  const completionReasons = [];
  if (manifest.status !== 'completed') completionReasons.push(`run ${manifest.status}`);
  for (const key of BUDGET_KEYS) if (manifest.usage[key] > manifest.budgets[key]) completionReasons.push(`budget exceeded: ${key}`);
  for (const artifact of artifacts.values()) {
    if (artifact.kind === 'observations' && !artifact.error) {
      for (const error of artifact.value.errors ?? []) completionReasons.push(`scenario error at ${error.stage}: ${error.message}`);
    }
  }
  const criteria = goal.criteria.map(criterion => {
    if (criterion.profile !== manifest.profile) return { id: criterion.id, profile: criterion.profile, status: 'inconclusivo', reason: 'profile not executed', checks: [] };
    const checks = criterion.checks.map(check => ({ ...checkResult(check, artifacts), evidence: check.kind === 'file-digest' ? check.artifact : `${check.artifact}#${check.path}` }));
    return { id: criterion.id, profile: criterion.profile, status: summarize(checks.map(check => check.status)), checks };
  });
  const status = summarize([...criteria.map(criterion => criterion.status), ...(integrityReasons.length || completionReasons.length ? ['inconclusivo'] : [])]);
  return {
    schemaVersion: 'evaluation/v1', runId: manifest.runId, goalId: goal.id, profile: manifest.profile,
    appRevision: manifest.appRevision, snapshotDigest: manifest.snapshotDigest, goalDigest: manifest.goalDigest, suiteDigest: manifest.suiteDigest,
    status, passed: status === 'atendido', integrity: { valid: integrityReasons.length === 0, reasons: integrityReasons },
    completion: { complete: completionReasons.length === 0, reasons: completionReasons }, criteria,
    modelUsage: { tokens: manifest.usage.modelTokens, costUsd: manifest.usage.modelCostUsd },
  };
}

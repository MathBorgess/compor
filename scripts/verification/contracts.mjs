import { createHash } from 'node:crypto';

export const BUDGET_KEYS = Object.freeze(['actions', 'requests', 'wallTimeMs', 'cycles', 'candidates', 'concurrency']);
export const PROFILES = Object.freeze(['offline', 'browser', 'real']);
const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function object(value, path, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required');
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`${path}.${key}`, 'unknown field');
}
function string(value, path, pattern) {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) fail(path, 'invalid string');
}
function integer(value, path, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(path, `expected integer >= ${minimum}`);
}
function member(value, path, values) { if (!values.includes(value)) fail(path, `expected one of ${values.join(', ')}`); }
function strings(value, path, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail(path, 'invalid array');
  value.forEach((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(value).size !== value.length) fail(path, 'duplicate entries');
}
function json(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((entry, index) => json(entry, `${path}[${index}]`)); return; }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, entry] of Object.entries(value)) json(entry, `${path}.${key}`);
    return;
  }
  fail(path, 'expected a finite JSON value');
}
function pointer(value, path) {
  if (typeof value !== 'string' || !value.startsWith('/') || /~(?![01])/u.test(value)) fail(path, 'expected JSON Pointer');
}
function date(value, path) {
  string(value, path);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(path, 'expected ISO UTC timestamp');
}

export function validateBudgets(value, path = 'budgets') {
  object(value, path, BUDGET_KEYS);
  for (const key of BUDGET_KEYS) integer(value[key], `${path}.${key}`);
  return value;
}

function check(value, path) {
  if (!value || typeof value !== 'object') fail(path, 'expected check');
  member(value.kind, `${path}.kind`, ['equals', 'length', 'minimum-length', 'same', 'includes', 'one-of', 'file-digest']);
  const fields = ['same', 'includes'].includes(value.kind) ? ['path', 'otherPath']
    : value.kind === 'file-digest' ? ['expectedArtifact', 'expectedPath'] : ['path', 'expected'];
  object(value, path, ['kind', 'artifact', ...fields]);
  string(value.artifact, `${path}.artifact`, ID);
  if (value.kind === 'file-digest') {
    string(value.expectedArtifact, `${path}.expectedArtifact`, ID);
    pointer(value.expectedPath, `${path}.expectedPath`);
    return;
  }
  pointer(value.path, `${path}.path`);
  if (['same', 'includes'].includes(value.kind)) pointer(value.otherPath, `${path}.otherPath`);
  else if (['length', 'minimum-length'].includes(value.kind)) integer(value.expected, `${path}.expected`, 0);
  else if (value.kind === 'one-of') {
    if (!Array.isArray(value.expected) || value.expected.length === 0) fail(path, 'one-of requires alternatives');
    json(value.expected, `${path}.expected`);
  } else json(value.expected, `${path}.expected`);
}

export function validateGoal(value) {
  object(value, 'goal', ['schemaVersion', 'id', 'revision', 'objective', 'requiredProfiles', 'preconditions', 'initialState', 'authorizedIntents', 'allowedEffects', 'forbiddenEffects', 'obstacles', 'faults', 'clockPolicy', 'seed', 'budgets', 'suiteRevision', 'criteria']);
  member(value.schemaVersion, 'goal.schemaVersion', ['goal/v1']);
  string(value.id, 'goal.id', ID); integer(value.revision, 'goal.revision'); string(value.objective, 'goal.objective');
  strings(value.requiredProfiles, 'goal.requiredProfiles', 1);
  value.requiredProfiles.forEach(profile => member(profile, 'goal.requiredProfiles', PROFILES));
  for (const key of ['preconditions', 'authorizedIntents', 'allowedEffects', 'forbiddenEffects', 'obstacles']) strings(value[key], `goal.${key}`);
  object(value.initialState, 'goal.initialState', ['accounts', 'projectId', 'postId']);
  strings(value.initialState.accounts, 'goal.initialState.accounts', 2);
  for (const key of ['projectId', 'postId']) string(value.initialState[key], `goal.initialState.${key}`);
  if (!Array.isArray(value.faults)) fail('goal.faults', 'expected array');
  value.faults.forEach((fault, index) => {
    object(fault, `goal.faults[${index}]`, ['id', 'stage', 'timing']);
    for (const key of ['id', 'stage', 'timing']) string(fault[key], `goal.faults[${index}].${key}`);
  });
  object(value.clockPolicy, 'goal.clockPolicy', ['virtual', 'real']);
  strings(value.clockPolicy.virtual, 'goal.clockPolicy.virtual'); strings(value.clockPolicy.real, 'goal.clockPolicy.real', 1);
  string(value.seed, 'goal.seed'); string(value.suiteRevision, 'goal.suiteRevision'); validateBudgets(value.budgets, 'goal.budgets');
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) fail('goal.criteria', 'expected nonempty array');
  const ids = new Set();
  value.criteria.forEach((criterion, index) => {
    const path = `goal.criteria[${index}]`;
    object(criterion, path, ['id', 'description', 'profile', 'required', 'checks']);
    string(criterion.id, `${path}.id`, ID); string(criterion.description, `${path}.description`);
    member(criterion.profile, `${path}.profile`, value.requiredProfiles);
    if (criterion.required !== true) fail(`${path}.required`, 'pilot criteria cannot be optional');
    if (ids.has(criterion.id)) fail(`${path}.id`, 'duplicate criterion');
    ids.add(criterion.id);
    if (!Array.isArray(criterion.checks) || criterion.checks.length === 0) fail(`${path}.checks`, 'expected nonempty array');
    criterion.checks.forEach((entry, i) => check(entry, `${path}.checks[${i}]`));
  });
  for (const profile of value.requiredProfiles) if (!value.criteria.some(criterion => criterion.profile === profile)) fail('goal.criteria', `no criterion for ${profile}`);
  return value;
}

export function validateManifest(value) {
  object(value, 'manifest', ['schemaVersion', 'runId', 'goalId', 'goalRevision', 'goalDigest', 'suiteDigest', 'appRevision', 'snapshotDigest', 'profile', 'status', 'budgets', 'usage', 'startedAt', 'endedAt', 'artifacts']);
  member(value.schemaVersion, 'manifest.schemaVersion', ['run/v1']);
  for (const key of ['runId', 'goalId']) string(value[key], `manifest.${key}`, ID);
  integer(value.goalRevision, 'manifest.goalRevision');
  for (const key of ['goalDigest', 'suiteDigest', 'snapshotDigest']) string(value[key], `manifest.${key}`, DIGEST);
  string(value.appRevision, 'manifest.appRevision', REVISION);
  member(value.profile, 'manifest.profile', PROFILES);
  member(value.status, 'manifest.status', ['completed', 'exhausted', 'interrupted']);
  validateBudgets(value.budgets, 'manifest.budgets');
  object(value.usage, 'manifest.usage', [...BUDGET_KEYS, 'modelTokens', 'modelCostUsd']);
  for (const key of BUDGET_KEYS) integer(value.usage[key], `manifest.usage.${key}`, 0);
  for (const key of ['modelTokens', 'modelCostUsd']) {
    const usage = value.usage[key];
    if (usage !== null && (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0)) fail(`manifest.usage.${key}`, 'expected nonnegative number or null (unknown)');
  }
  if (value.usage.modelTokens !== null) integer(value.usage.modelTokens, 'manifest.usage.modelTokens', 0);
  date(value.startedAt, 'manifest.startedAt'); date(value.endedAt, 'manifest.endedAt');
  if (Date.parse(value.endedAt) < Date.parse(value.startedAt)) fail('manifest.endedAt', 'precedes start');
  if (!Array.isArray(value.artifacts)) fail('manifest.artifacts', 'expected array');
  const ids = new Set(), paths = new Set();
  value.artifacts.forEach((artifact, index) => {
    const path = `manifest.artifacts[${index}]`;
    object(artifact, path, ['id', 'kind', 'path', 'sha256']);
    string(artifact.id, `${path}.id`, ID); member(artifact.kind, `${path}.kind`, ['observations', 'file']);
    string(artifact.sha256, `${path}.sha256`, DIGEST); string(artifact.path, `${path}.path`);
    if (artifact.path.includes('\\') || artifact.path.split('/').some(part => part === '' || part === '.' || part === '..')) fail(`${path}.path`, 'expected confined relative path');
    if (ids.has(artifact.id) || paths.has(artifact.path)) fail(path, 'duplicate artifact id or path');
    ids.add(artifact.id); paths.add(artifact.path);
  });
  return value;
}

export function validateObservations(value) {
  object(value, 'observations', [], ['http', 'db', 'files', 'providerLedger', 'clock', 'controller', 'errors', 'identity']);
  if (value.errors !== undefined) {
    if (!Array.isArray(value.errors)) fail('observations.errors', 'expected array');
    value.errors.forEach((error, index) => {
      object(error, `observations.errors[${index}]`, ['stage', 'message']);
      string(error.stage, `observations.errors[${index}].stage`); string(error.message, `observations.errors[${index}].message`);
    });
  }
  if (value.identity !== undefined) {
    object(value.identity, 'observations.identity', ['actor', 'projectId'], ['pieceId']);
    for (const [key, entry] of Object.entries(value.identity)) string(entry, `observations.identity.${key}`);
  }
  json(value, 'observations');
  return value;
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export function canonicalJson(value) {
  json(value, 'value');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
export function digestJson(value) { return sha256(canonicalJson(value)); }

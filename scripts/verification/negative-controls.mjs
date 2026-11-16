import { mkdir, mkdtemp, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { sha256, validateManifest } from './contracts.mjs';
import { evaluate } from './evaluate.mjs';

const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

async function readConfined(base, path) {
  const target = await realpath(resolve(base, path));
  if (!target.startsWith(base + sep)) throw Error('negative_control_artifact_escapes_run');
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES) throw Error('negative_control_artifact_not_bounded_file');
  return readFile(target);
}

/**
 * Re-evaluate four damaged copies of an approved G01 without changing its source.
 * anchors contains evaluate's expected* fields, supplied by the run supervisor.
 * These are evidence-integrity controls, not additional product scenarios.
 */
export async function captureNegativeControls(runDir, { goal, anchors }) {
  if (goal.id !== 'G01') throw Error('negative_controls_require_G01');
  if (typeof anchors.expectedRunId !== 'string' || !anchors.expectedRunId) throw Error('negative_controls_require_run_anchor');
  const options = { ...anchors, goal };
  const positive = await evaluate(runDir, options);
  if (positive.passed !== true) throw Error('negative_controls_require_approved_source');

  const source = await realpath(runDir);
  const manifestBytes = await readConfined(source, 'manifest.json');
  const manifest = validateManifest(JSON.parse(manifestBytes));
  const image = manifest.artifacts.find(artifact => artifact.id === 'generated-image' && artifact.kind === 'file');
  if (!image) throw Error('negative_controls_require_generated_image');
  const snapshots = [];
  for (const artifact of manifest.artifacts) {
    const bytes = await readConfined(source, artifact.path);
    if (sha256(bytes) !== artifact.sha256) throw Error('negative_control_source_changed:' + artifact.id);
    snapshots.push({ path: artifact.path, bytes });
  }
  if (sha256(await readConfined(source, 'manifest.json')) !== sha256(manifestBytes)) throw Error('negative_control_source_manifest_changed');

  const directory = await mkdtemp(join(source, 'negative-controls-'));
  await writeJson(join(directory, 'positive-evaluation.json'), positive);
  const cases = [
    { id: 'missing-artifact', mutate: copy => unlink(join(copy, image.path)) },
    { id: 'corrupt-bytes', mutate: copy => writeFile(join(copy, image.path), Buffer.concat([snapshots.find(item => item.path === image.path).bytes, Buffer.from('\nnegative-control-corruption')])) },
    { id: 'stale-snapshot', mutate: copy => writeFile(join(copy, 'manifest.json'), JSON.stringify({ ...manifest, snapshotDigest: (manifest.snapshotDigest[0] === '0' ? '1' : '0') + manifest.snapshotDigest.slice(1) })) },
    { id: 'missing-manifest', mutate: copy => unlink(join(copy, 'manifest.json')) },
  ];
  const controls = [];
  for (const control of cases) {
    const copy = join(directory, control.id);
    await mkdir(copy);
    await writeFile(join(copy, 'manifest.json'), manifestBytes, { flag: 'wx' });
    for (const snapshot of snapshots) {
      const target = join(copy, snapshot.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, snapshot.bytes, { flag: 'wx' });
    }
    await control.mutate(copy);
    const evaluation = await evaluate(copy, options);
    const reportPath = control.id + '.evaluation.json';
    await writeJson(join(directory, reportPath), evaluation);
    controls.push({ id: control.id, evaluationPassed: evaluation.passed, detected: evaluation.passed === false, status: evaluation.status, reportPath, integrityReasons: evaluation.integrity.reasons });
  }
  const receipt = {
    schemaVersion: 'negative-controls/v1', sourceRunId: manifest.runId,
    sourceManifestSha256: sha256(manifestBytes), directory: relative(source, directory),
    goalDigest: anchors.expectedGoalDigest, suiteDigest: anchors.expectedSuiteDigest,
    snapshotDigest: anchors.expectedSnapshotDigest, appRevision: anchors.expectedAppRevision,
    passed: controls.every(control => control.detected), controls,
  };
  await writeJson(join(directory, 'receipt.json'), receipt);
  if (!receipt.passed) throw Object.assign(Error('negative_control_was_accepted'), { receipt });
  return receipt;
}

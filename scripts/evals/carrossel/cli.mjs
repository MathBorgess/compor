import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { calibrationFile, measureJudgeCalibration } from './calibration.mjs';
import { evaluate } from './evaluate.mjs';
import { reviewNovelty } from './novelty.mjs';
import { formatVersion, isDigest, isId, readDocument, readSuite, requireCondition } from './protocol.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

function requireOutsideRepository(path) {
  const local = relative(repository, resolve(path));
  requireCondition(isAbsolute(local) || local === '..' || local.startsWith('..' + sep), 'Use um caminho externo ao repositório para a suíte privada, seus artefatos e relatório.');
}

async function privateSuite(path, kind, sha) {
  requireCondition(path && sha, `Informe a suíte privada ${kind} e seu SHA-256 congelado.`);
  requireOutsideRepository(await realpath(path));
  return readSuite(path, kind, sha);
}

function checkUnique(cases) {
  requireCondition(new Set(cases.map(testCase => testCase.id)).size === cases.length,
    'Casos de desenvolvimento, reserva e confirmação independente precisam de IDs distintos.');
}

async function loadReferences(paths) {
  const references = new Map();
  for (const path of paths ?? []) {
    const { value } = await readDocument(path);
    requireCondition(value?.version === formatVersion
      && Number.isInteger(value.cycle) && value.cycle >= 0 && value.cycle <= 4
      && Array.isArray(value.cases) && !references.has(value.cycle),
    'Cada controle deve ser um relatório válido de um ciclo distinto.');
    references.set(value.cycle, value);
  }
  return references;
}

async function evaluateCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    cycle: { type: 'string' }, evidence: { type: 'string' }, output: { type: 'string' },
    holdout: { type: 'string' }, 'holdout-sha256': { type: 'string' },
    independent: { type: 'string' }, 'independent-sha256': { type: 'string' }, 'candidate-sha256': { type: 'string' },
    'judge-calibration': { type: 'string' }, 'calibration-sha256': { type: 'string' },
    compare: { type: 'string', multiple: true }, 'control-only': { type: 'boolean' }, strict: { type: 'boolean' },
  } });
  requireCondition(/^[0-5]$/.test(values.cycle ?? '') && values.evidence && values.output,
    'Use evaluate --cycle 0..5 --evidence <diretório> --output <relatório.json>.');
  const cycle = Number(values.cycle);
  const controlOnly = values['control-only'] === true;
  requireCondition(cycle !== 5 || !controlOnly, 'C5 é a confirmação independente. Use C4 com --control-only para o controle.');
  requireCondition(cycle >= 4 || controlOnly || (!values.holdout && !values.independent),
    'Até C3, ajuste candidatos apenas no desenvolvimento. Para avaliar uma revisão já congelada, use --control-only.');
  requireCondition(!values.independent || cycle === 5 || (cycle === 4 && controlOnly),
    'A suíte independente pertence ao C5 e ao seu controle C4 já congelado.');
  const dev = await readSuite(new URL('./dev-cases.json', import.meta.url), 'dev');
  const readHoldout = cycle >= 4 && !controlOnly || Boolean(values.holdout);
  const holdout = readHoldout ? await privateSuite(values.holdout, 'holdout', values['holdout-sha256']) : null;
  const independent = cycle === 5 || values.independent
    ? await privateSuite(values.independent, 'independent', values['independent-sha256']) : null;
  const cohorts = [...dev.cases, ...(holdout?.cases ?? []), ...(independent?.cases ?? [])];
  checkUnique(cohorts);
  requireCondition(Boolean(values['judge-calibration']) === Boolean(values['calibration-sha256']),
    'Informe o diretório privado da calibração e o SHA-256 do relatório.');
  let judgeCalibration;
  if (values['judge-calibration']) {
    const directory = await realpath(values['judge-calibration']);
    requireOutsideRepository(directory);
    judgeCalibration = { directory, sha256: values['calibration-sha256'] };
  }
  if (holdout || independent || judgeCalibration) {
    requireOutsideRepository(await realpath(values.evidence));
    requireOutsideRepository(join(await realpath(dirname(values.output)), 'report.json'));
  }
  const tests = independent ? independent.cases : [...dev.cases, ...(holdout?.cases ?? [])];
  const references = await loadReferences(values.compare);
  const result = await evaluate({
    cycle, tests, evidenceRoot: resolve(values.evidence), references, controlOnly, candidateSha256: values['candidate-sha256'],
    judgeCalibration, cohorts,
    suiteDigests: { dev: dev.digest, holdout: holdout?.digest ?? null, independent: independent?.digest ?? null },
  });
  await writeFile(values.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ cycle, status: result.status, coverage: result.coverage, checks: result.checks }));
  if (values.strict && result.status === 'insufficient_or_failed') process.exitCode = 2;
}

async function renderCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    case: { type: 'string' }, first: { type: 'string' }, final: { type: 'string' },
    'repair-reason': { type: 'string' }, evidence: { type: 'string' },
  } });
  requireCondition(isId(values.case) && values.first && values.evidence,
    'Use render --case <id> --first <plano.json> --evidence <diretório>.');
  const directory = resolve(values.evidence);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { renderEvidence } = await import('./render-evidence.mjs');
  const result = await renderEvidence({
    caseId: values.case, firstPath: values.first, finalPath: values.final, repairReason: values['repair-reason'],
    caseDirectory: join(directory, values.case), executablePath: process.env.BROWSER_EXECUTABLE_PATH,
  });
  console.log(JSON.stringify({ caseId: result.caseId, repair_count: result.repair_count, outcome: result.final.outcome }));
  if (result.final.outcome !== 'delivered') process.exitCode = 2;
}

async function noveltyCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    plan: { type: 'string' }, observations: { type: 'string' }, output: { type: 'string' },
  } });
  requireCondition(values.plan && values.observations && values.output,
    'Use novelty --plan <plano.json> --observations <avaliação.json> --output <relatório.json>.');
  const [plan, assessment] = await Promise.all([readDocument(values.plan), readDocument(values.observations)]);
  const result = reviewNovelty(plan, assessment);
  await writeFile(values.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: result.status, migMean: result.migMean, pairs: result.pairs.length }));
  if (result.status !== 'pass') process.exitCode = 2;
}

async function calibrateCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    bundle: { type: 'string' }, 'truth-sha256': { type: 'string' },
  } });
  requireCondition(values.bundle && values['truth-sha256'],
    'Use calibrate --bundle <diretório privado> --truth-sha256 <hash congelado dos rótulos de referência>.');
  const directory = await realpath(values.bundle);
  requireOutsideRepository(directory);
  const result = await measureJudgeCalibration(directory, values['truth-sha256']);
  await writeFile(join(directory, calibrationFile), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: result.status, metrics: result.metrics }));
  if (result.status !== 'pass') process.exitCode = 2;
}

async function calibrationRunCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    bundle: { type: 'string' }, 'truth-sha256': { type: 'string' }, execute: { type: 'boolean' },
    'max-new-pairs': { type: 'string' },
  } });
  const requested = values['max-new-pairs'];
  requireCondition(values.bundle && isDigest(values['truth-sha256'])
    && (requested === undefined ? !values.execute : /^\d{1,2}$/.test(requested)),
  'Use calibration-run --bundle <diretório> --truth-sha256 <hash> [--execute --max-new-pairs <teto>].');
  const { runJudgeCalibration } = await import('./calibration-run.mjs');
  const maxNewPairs = requested === undefined ? undefined : Number(requested);
  const result = await runJudgeCalibration({
    directory: resolve(values.bundle), truthSha256: values['truth-sha256'], execute: values.execute, maxNewPairs,
    key: values.execute && maxNewPairs > 0 ? process.env.OPENAI_API_KEY : undefined,
  });
  console.log(JSON.stringify(result));
}

async function diagramPreflightCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    bundle: { type: 'string' }, 'bundle-sha256': { type: 'string' },
    'expect-mismatch': { type: 'string', multiple: true },
  } });
  const help = 'Use diagram-preflight --bundle <arquivo JSON privado> --bundle-sha256 <hash> [--expect-mismatch <caso>:A|B:<lâmina>].';
  requireCondition(values.bundle && isDigest(values['bundle-sha256']), help);
  const bundle = resolve(values.bundle);
  requireOutsideRepository(await realpath(bundle));
  const expectedMismatches = (values['expect-mismatch'] ?? []).map(value => {
    const [caseId, side, slideId, extra] = value.split(':');
    requireCondition(caseId && side && slideId && extra === undefined, help);
    return { caseId, side, slideId };
  });
  const { inspectCalibrationDiagrams } = await import('./calibration-diagrams.mjs');
  const report = await inspectCalibrationDiagrams({
    directory: dirname(bundle), bundleFile: basename(bundle),
    bundleSha256: values['bundle-sha256'], expectedMismatches,
  });
  console.log(JSON.stringify(report));
  if (report.status !== 'pass') process.exitCode = 2;
}

async function artBatchCommand(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: {
    cycle: { type: 'string' }, case: { type: 'string' }, evidence: { type: 'string' }, 'max-images': { type: 'string' },
    execute: { type: 'boolean' }, 'no-render': { type: 'boolean' },
  } });
  requireCondition(/^[3-5]$/.test(values.cycle ?? '') && isId(values.case) && values.evidence
    && /^[2-6]$/.test(values['max-images'] ?? ''),
  'Use art-batch --cycle 3..5 --case <caso sintético> --evidence <diretório> --max-images 2..6.');
  const { runLiveCarousel } = await import('./live.mjs');
  const maxImages = Number(values['max-images']);
  const result = await runLiveCarousel({
    key: values.execute ? process.env.OPENAI_API_KEY : undefined,
    preflightOnly: !values.execute, artBatch: { maxImages },
    cycle: Number(values.cycle), caseId: values.case, root: resolve(values.evidence), render: !values['no-render'],
  });
  console.log(JSON.stringify({ state: result.state, caseId: result.caseId, cycle: result.cycle, maxImages,
    ...(result.state !== 'preflight' && { receiptPath: result.receiptPath, reused: result.reused === true }),
  }));
  if (!['preflight', 'planned', 'delivered'].includes(result.state)) process.exitCode = 2;
}

try {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === 'evaluate') await evaluateCommand(arguments_);
  else if (command === 'render') await renderCommand(arguments_);
  else if (command === 'novelty') await noveltyCommand(arguments_);
  else if (command === 'calibrate') await calibrateCommand(arguments_);
  else if (command === 'calibration-run') await calibrationRunCommand(arguments_);
  else if (command === 'diagram-preflight') await diagramPreflightCommand(arguments_);
  else if (command === 'art-batch') await artBatchCommand(arguments_);
  else throw Error('Comandos: evaluate, render, novelty, calibrate, calibration-run, diagram-preflight e art-batch. Consulte scripts/evals/carrossel/README.md.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

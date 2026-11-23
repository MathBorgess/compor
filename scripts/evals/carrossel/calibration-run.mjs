import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { runBlindCarouselPair } from './blind-judge.mjs';
import { judgeInputForLabel, readCalibrationLabels, registerCalibrationRuns } from './calibration.mjs';
import { judgeBriefing, judgeDeckHash, judgeRubricSha256, readBlindJudgePair, readJudgeDocument } from './judge-evidence.mjs';
import { formatVersion, requireCondition, sha256 } from './protocol.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const sides = ['baseline', 'candidate'];
const repetitions = [1, 2];
const observationFile = 'observations.json';

function outputStem(id, repetition) {
  const slug = id.length <= 77 ? id : 'cal-' + sha256(id);
  return `${slug}-r${repetition}`;
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readInputFile(path, maximum, label) {
  const stat = await lstat(path);
  requireCondition(stat.isFile() && stat.size <= maximum, `Arquivo inválido ou grande demais em ${label}.`);
  const bytes = await readFile(path);
  requireCondition(bytes.length <= maximum, `Arquivo grande demais em ${label}.`);
  return bytes;
}

async function inputSide(root, label, side) {
  const name = join(label.id, side);
  const folder = join(root, name);
  requireCondition((await lstat(folder)).isDirectory(), `Diretório inválido em ${name}.`);
  const slides = (await readdir(folder)).filter(file => file.startsWith('slide-') && file.endsWith('.jpg')).sort();
  requireCondition(slides.length >= 2 && slides.length <= 20
    && slides.every((file, index) => file === `slide-${String(index + 1).padStart(2, '0')}.jpg`),
  `As lâminas de ${name} precisam ser JPEGs sequenciais a partir de slide-01.jpg.`);
  const files = slides.map(slide => join(name, slide));
  const hashes = [];
  for (const file of files) {
    const bytes = await readInputFile(join(root, file), 8_000_000, file);
    requireCondition(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `Arquivo sem assinatura JPEG em ${file}.`);
    hashes.push(sha256(bytes));
  }
  requireCondition(judgeDeckHash(hashes) === label[side].deckSha256, `SHA-256 das lâminas diverge em ${name}.`);
  const captionBytes = await readInputFile(join(folder, 'legenda.txt'), 9600, name + '/legenda.txt');
  requireCondition(sha256(captionBytes) === label[side].captionSha256, `SHA-256 da legenda diverge em ${name}.`);
  const caption = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(captionBytes);
  requireCondition(caption.length <= 2400, `Legenda excede o limite em ${name}.`);
  return { files, caption };
}

async function readPair(root, work, used) {
  const { output, expectedInput } = work;
  const file = output + '.pair.json';
  const names = [file, output + '-ab.receipt.json', output + '-ba.receipt.json'];
  const presence = await Promise.all(names.map(name => exists(join(root, name))));
  if (presence.every(present => !present)) return null;
  requireCondition(presence.every(Boolean), `Par ${output} tem recibo parcial. Reconcilie a execução antes de continuar.`);
  const report = await readJudgeDocument(root, file);
  const reference = { file, sha256: report.digest };
  const parsed = await readBlindJudgePair(root, reference);
  requireCondition(isDeepStrictEqual(parsed.input, expectedInput), `Par ${output} diverge dos insumos congelados.`);
  registerCalibrationRuns(parsed, used.sessions, used.turns);
  return reference;
}

async function loadWork(root, truthSha256) {
  const { cases } = await readCalibrationLabels(root, truthSha256);
  const used = { sessions: new Set(), turns: new Set() };
  const work = [];
  for (const label of cases) {
    requireCondition((await lstat(join(root, label.id))).isDirectory(), `Diretório inválido para ${label.id}.`);
    const [baseline, candidate] = await Promise.all(sides.map(side => inputSide(root, label, side)));
    const briefing = judgeBriefing(label);
    requireCondition(briefing.length <= 6000, `Briefing excede o limite em ${label.id}.`);
    const expectedInput = judgeInputForLabel(label);
    for (const repetition of repetitions) {
      const job = { id: label.id, baseline, candidate, briefing, expectedInput, output: outputStem(label.id, repetition) };
      job.reference = await readPair(root, job, used);
      work.push(job);
    }
  }
  requireCondition(new Set(work.map(job => job.output)).size === work.length, 'Nomes de pares da calibração repetidos.');
  return { work, used, cases };
}

function observationsFor(work, cases, truthSha256) {
  if (work.some(item => !item.reference)) return null;
  return {
    version: formatVersion, truthSha256,
    cases: cases.map(({ id }) => ({ id, pairs: work.filter(job => job.id === id).map(job => job.reference) })),
  };
}

async function writeObservations(root, expected, execute) {
  const path = join(root, observationFile);
  const verify = async () => {
    const { value } = await readJudgeDocument(root, observationFile);
    requireCondition(expected && isDeepStrictEqual(value, expected), 'observations.json diverge dos pares concluídos.');
    return false;
  };
  if (await exists(path)) return verify();
  if (!expected || !execute) return false;
  try {
    await writeFile(path, JSON.stringify(expected, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return verify();
  }
}

export async function runJudgeCalibration({
  directory, truthSha256, execute = false, maxNewPairs, key, fetchApi, runPair = runBlindCarouselPair,
}) {
  requireCondition(typeof directory === 'string' && isAbsolute(directory), 'Use um diretório de calibração absoluto.');
  const root = await realpath(directory);
  const fromRepository = relative(await realpath(repository), root);
  requireCondition(isAbsolute(fromRepository) || fromRepository === '..' || fromRepository.startsWith('..' + sep),
    'Use um diretório de calibração fora do repositório.');
  requireCondition(!execute && maxNewPairs === undefined
    || Number.isInteger(maxNewPairs) && maxNewPairs >= 0 && maxNewPairs <= 60,
  'Use um teto explícito de 0 a 60 pares novos ao executar a calibração.');
  const { work, used, cases } = await loadWork(root, truthSha256);
  const pending = work.filter(job => !job.reference);
  const plannedNewPairs = Math.min(pending.length, maxNewPairs ?? pending.length);
  const initialObservations = observationsFor(work, cases, truthSha256);
  await writeObservations(root, initialObservations, false);
  const info = { cases: cases.length, rubricSha256: judgeRubricSha256, truthSha256,
    targetPairs: work.length, completedPairs: work.length - pending.length,
    pendingPairs: pending.length, plannedNewPairs, maxNewSessions: plannedNewPairs * 2 };
  if (!execute) return { status: 'preflight', ...info };
  requireCondition(!plannedNewPairs || /^sk-[^\s]{20,300}$/.test(key ?? ''), 'Credencial do juiz ausente ou inválida.');

  for (const job of pending.slice(0, plannedNewPairs)) {
    const { baseline, candidate, briefing, output, expectedInput } = job;
    await runPair({ key, root, baseline, candidate, briefing, output, expectedInput, fetchApi });
    job.reference = await readPair(root, job, used);
    requireCondition(job.reference, `Par ${output} terminou sem recibos verificáveis.`);
  }
  const observations = observationsFor(work, cases, truthSha256);
  const observationsWritten = await writeObservations(root, observations, true);
  return {
    status: observations ? 'complete' : 'pending', ...info, newPairs: plannedNewPairs,
    completedPairs: info.completedPairs + plannedNewPairs, pendingPairs: info.pendingPairs - plannedNewPairs, observationsWritten,
  };
}

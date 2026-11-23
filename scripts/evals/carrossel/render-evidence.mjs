import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { formatVersion, physicalChecks, readDocument, requireCondition, sha256 } from './protocol.mjs';

const web = new URL('../../../apps/web/', import.meta.url);
const require = createRequire(new URL('package.json', web));
const repairableChecks = ['LAYOUT_OVERFLOW', 'TEXT_COLLISION', 'SAFE_ZONE', 'TYPOGRAPHY', 'TEXT_CONTRAST'];

function selectCheck(checks, id) {
  if (Array.isArray(checks)) return checks.find(item => item.id === id);
  return checks?.[id];
}

function collectCheck(id, slides) {
  const observations = slides.map(slide => selectCheck(slide.checks, id));
  const failedSlides = observations.flatMap((check, index) => check?.status === 'fail' ? [index + 1] : []);
  if (failedSlides.length) return { status: 'fail', evidence: `Renderer: ${id} nas lâminas ${failedSlides.join(', ')}.` };
  if (observations.every(check => check?.status === 'pass') && observations.length > 0) {
    return { status: 'pass', evidence: `Renderer: ${id} observada nas ${observations.length} lâminas.` };
  }
  return { status: 'not_run' };
}

async function captureSnapshot(renderDeck, document, directory, name, browser, sharp, fonts, repair) {
  const { value: deck, digest: inputSha256 } = document;
  const outputDir = join(directory, name);
  try {
    const result = await renderDeck(deck, { outputDir, browser, sharp, fonts, repair });
    const planFailures = result.slides.length ? [] : result.checks
      .filter(item => item.status === 'fail').map(item => item.id);
    const checks = Object.fromEntries(physicalChecks.map(id => [id, collectCheck(id, result.slides)]));
    for (const id of ['COLLECTION_CADENCE', 'DUPLICATE_VISUAL']) {
      const observation = selectCheck(result.checks, id);
      if (['pass', 'fail'].includes(observation?.status)) {
        checks[id] = { status: observation.status, evidence: `Renderer: observações de ${id} em render-checks.json.` };
      }
    }
    if (Array.isArray(deck.slides) && deck.slides.length > 0
      && deck.slides.every(slide => typeof slide.alt === 'string' && slide.alt.trim())) {
      checks.ALT_TEXT = { status: 'pass', evidence: 'O plano inclui texto alternativo em todas as lâminas.' };
    }
    if (planFailures.includes('ALT')) checks.ALT_TEXT = { status: 'fail', evidence: 'O plano omitiu texto alternativo obrigatório.' };
    if (planFailures.includes('S2_DEPENDENT_OPEN')) {
      checks.S2_STANDALONE = { status: 'fail', evidence: 'A segunda manchete começa com uma referência ao contexto anterior.' };
    }
    const artSheetApplicable = Array.isArray(deck.slides) && deck.slides.some(slide => Boolean(slide?.art));
    if (!artSheetApplicable) checks.ART_PURITY = { status: 'not_applicable', evidence: 'O plano não contém arte raster.' };
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    const checksBytes = JSON.stringify(result, null, 2) + '\n';
    await writeFile(join(outputDir, 'render-checks.json'), checksBytes, { flag: 'wx', mode: 0o600 });
    const artifacts = [...result.slides, ...result.artifacts]
      .filter(asset => asset.file).map(asset => ({ file: `${name}/${asset.file}`, sha256: asset.sha256 }));
    artifacts.push({ file: `${name}/render-checks.json`, sha256: sha256(checksBytes) });
    const outcome = planFailures.length ? 'blocked_plan' : 'delivered';
    const slideCount = planFailures.length === 0 ? deck.slides.length : undefined;
    return { outcome, inputSha256, artifacts, checks, planFailures, artSheetApplicable, slideCount };
  } catch (error) {
    return { outcome: 'failed_execution', inputSha256, reason: error.message, checks: {}, artifacts: [] };
  }
}

export async function renderEvidence({
  caseId, firstPath, finalPath, repairReason, caseDirectory,
  executablePath = process.env.BROWSER_EXECUTABLE_PATH,
}) {
  const first = await readDocument(firstPath);
  const final = finalPath ? await readDocument(finalPath) : first;
  requireCondition(first.value?.mode === final.value?.mode, 'O reparo deve preservar o modo do carrossel.');
  requireCondition(!finalPath || (typeof repairReason === 'string' && repairReason.trim()),
    'Um segundo plano exige o motivo observado do reparo.');
  requireCondition(typeof executablePath === 'string' && executablePath, 'Defina BROWSER_EXECUTABLE_PATH para um Chromium disponível.');
  await access(executablePath);
  const { renderDeck } = await import('../../../packages/carousel-renderer/src/index.mjs');
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const fonts = { 400: regular, 700: bold };
  await mkdir(caseDirectory, { mode: 0o700 });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const firstSnapshot = await captureSnapshot(renderDeck, first, caseDirectory, 'first-pass', browser, sharp, fonts, false);
    const failures = repairableChecks.filter(id => firstSnapshot.checks[id]?.status === 'fail');
    const shouldRepair = Boolean(finalPath) || failures.length > 0;
    const finalSnapshot = shouldRepair
      ? await captureSnapshot(renderDeck, final, caseDirectory, 'final', browser, sharp, fonts, true)
      : firstSnapshot;
    const repairs = shouldRepair
      ? [{ stage: 'render', reason: repairReason || `Verificações físicas na primeira passagem: ${failures.join(', ')}.` }]
      : [];
    const manifest = {
      version: formatVersion, caseId, mode: first.value.mode,
      first_pass: firstSnapshot, final: finalSnapshot,
      repair_count: repairs.length, repairs,
    };
    await writeFile(join(caseDirectory, 'qa-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally {
    await browser.close();
  }
}

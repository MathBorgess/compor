import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateExplorationContext} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {parseVisualInput} from '../../../../packages/agents-api/src/visual-input.mjs';

const here = new URL('.', import.meta.url);
export const cases = JSON.parse(readFileSync(new URL('cases.json', here), 'utf8'));
const historical = new URL('../../pr61/triagem/corpus/', here);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Content-derived UUIDs keep the same file's identity stable when removing or repositioning another.
function uuid(name) {
  const h = hash('compor-eval-reference-v1/' + name);
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-');
}

export function assetPath(asset) {
  assert.match(asset, /^[a-z]+-[a-z]+$/);
  const old = asset.startsWith('oficina-') || asset.startsWith('mostra-');
  return fileURLToPath(new URL((old ? '' : 'assets/') + asset + '.png', old ? historical : here));
}

export function packet(caseId, arm) {
  const item = cases.find(c => c.id === caseId);
  assert.ok(item, 'Caso desconhecido');
  assert.ok(arm === 'with' || arm === 'without', 'Braço inválido');
  const projectId = uuid(caseId);
  const references = item.references.map(r => ({
    ...r, id: uuid(caseId + '/' + r.asset), present: arm === 'with' || r.asset !== item.optional,
  }));
  const labels = references.map(r => r.id + ' = ' + r.label).join('\n');
  const context = {
    idea: item.idea, offer: item.offer, audience: item.audience, goal: item.goal,
    direction: item.direction + '\nNomes dados pela pessoa. Use cada referência somente se presente entre as imagens selecionadas.\n' + labels,
    offerFacts: item.facts.map(([label, value], i) => ({id: 'fact-' + (i + 1), label, value, status: 'confirmed'})),
    accepted: [], rejected: [], feedback: [],
  };
  const entries = [], referenceImages = [];
  for (const r of references.filter(r => r.present)) {
    const bytes = readFileSync(assetPath(r.asset));
    const original = {sha256: hash(bytes), mime: 'image/png', byteLength: bytes.length};
    const transport = {...original, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    const source = r.origin === 'generated' ? {projectId, imageId: r.id}
      : r.origin === 'external' ? {originUrl: 'https://www.pinterest.com/pin/' + r.id + '/', board: 'compor/fixture'} : null;
    entries.push({id: r.id, ordinal: entries.length + 1, role: 'reference', inputOrigin: r.origin, source, original, transport, transformation: 'none'});
    referenceImages.push({id: r.id, mime: original.mime, data: bytes.toString('base64')});
  }
  const visualInput = {version: 2, policy: 'optimized-v1', externalConsent: true, entries};
  assert.ok(validateExplorationContext(context));
  parseVisualInput(visualInput, referenceImages);
  const rubric = {
    split: item.split, optionalId: references.find(r => r.asset === item.optional).id,
    references, invariants: item.invariants, allowedCopy: item.facts.map(([, value]) => value),
  };
  return {id: caseId, arm, projectId, context, visualInput, referenceImages, rubric};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.length !== 4) throw new Error('Uso: node packets.mjs ID_DO_CASO with|without');
  console.log(JSON.stringify(packet(process.argv[2], process.argv[3])));
}

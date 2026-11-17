import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {parallelExplorationContext} from '../../../../apps/web/lib/parallel-exploration-context.ts';
import {createStudioState} from '../../../../apps/web/lib/studio-state.ts';

const hash = data => createHash('sha256').update(data).digest('hex');
const corpus = new URL('../../../../prototypes/compor-mcp/evals/model-efficiency/blind/', import.meta.url);
const packets = [];
for (const domain of ['mentoria', 'startup']) {
  // A fixed prefix keeps missing assets visible instead of sampling only successes.
  for (const id of ['P01', 'P02']) {
    const directory = new URL(`round1-${domain}/${id}/`, corpus);
    const example = JSON.parse(readFileSync(new URL('package.json', directory)));
    for (const [task, inputs] of Object.entries({variacao: ['V1', 'V2'], convergencia: ['V1', 'R1']})) {
      const key = `${domain}-${id}-${task}`;
      const order = [...inputs].sort((a,b) => hash(key+a).localeCompare(hash(key+b), 'en'));
      const artifacts = example.stages.flatMap(stage => stage.artifacts);
      const available = order.every(name => artifacts.some(asset => asset.id === name) && existsSync(new URL(`${name}-360.png`, directory)));
      const images = available ? order.map(name => new URL(`${name}-360.png`, directory)) : [];
      const digest = hash(Buffer.concat(images.map(url => readFileSync(url))));
      packets.push({key, task, order, images, available, digest});
    }
  }
}

if (process.argv.includes('--blind')) {
  const destination = mkdtempSync(join(tmpdir(), 'compor-pr61-variacoes-'));
  for (const packet of packets.filter(packet => packet.available)) {
    packet.images.forEach((url, i) => copyFileSync(fileURLToPath(url), join(destination, `${packet.key}-${i ? 'B' : 'A'}.png`)));
  }
  console.log(destination);
} else {
  const judgments = JSON.parse(readFileSync(new URL('julgamentos.json', import.meta.url)));
  let distinct = 0, improved = 0, unchanged = 0, regressed = 0;
  for (const packet of packets.filter(item => item.available)) {
    const result = judgments[packet.key];
    assert.equal(result.digest, packet.digest, `Pixels alterados em ${packet.key}. Julgar outra vez.`);
    if (packet.task === 'variacao') {
      assert([0,1,2].includes(result.divergence));
      distinct += Number(result.divergence === 2 && result.preserves === true);
    } else {
      assert(['A', 'B', 'empate'].includes(result.closer));
      if (result.closer === 'empate') unchanged++;
      else if (packet.order[result.closer === 'A' ? 0 : 1] === 'R1' && result.preserves) improved++;
      else regressed++;
    }
  }
  console.log({pairs: packets.length, missing: packets.filter(item => !item.available).length, distinct, improved, unchanged, regressed});
}

// Exercise the web production handoff with a fixed local HTTP response.
const uuid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const projectId = uuid(11);
const state = createStudioState({userId:uuid(10), projectId});
const signal = {id:uuid(12), imageId:uuid(13), projectId, action:'comment', comment:'Manter a paleta e aumentar a headline.', supersedes:null, createdAt:'2026-11-17T12:00:00Z', plan:{composition:'blocos',contrast:'escala'}};
const context = await parallelExplorationContext(state, projectId, 'references', 'Apresentar a oficina', async path =>
  Response.json({signals:path.includes('/explorations/') ? [signal] : []}));
assert.deepEqual(context.feedback, [{action:'comment',comment:signal.comment,composition:'blocos',contrast:'escala'}]);
const item = {creativePrompt:'Retrato central com fundo de papel',composition:'retrato central',contrast:'ameixa sobre creme',differenceFromOthers:'Mesma proposta'};
const numbered = [1,2,3].map(position => ({...item,position,creativePrompt:item.creativePrompt+' '+position, composition:item.composition+' '+position,contrast:item.contrast+' '+position}));
assert(validateExplorationPlan({version:1,items:numbered},context));
assert.equal(validateExplorationPlan({version:1,items:numbered.map(value => ({...value,...item}))},context),null);
console.log('Web: 1 comentário/1 encaminhado. Plano com sufixos numéricos aceito. Plano com três cópias idênticas recusado.');

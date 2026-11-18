import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createManagedExplorationPlanProvider} from '../../../../packages/agents-api/src/exploration-plan-provider.mjs';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {parseSelectedVisualInput} from '../../../../packages/agents-api/src/visual-input.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = id(100);
const oficina = [
  // Synthetic 32x32 PNGs: product mark, palette, layout, distractor.
  ['local-upload', null, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAmklEQVR42u1VQQ6AIAyDhg/5Gn0ivsaXePfgwasBGWWIxIQdydqOrNvseeymZcA0jiGQDUfmTcscvGx+ZYA266KYukhGEpCpSRnUs8vJqGeXIT1sqihfADoef+8kXwTI8gOfpGwTw6F2ITloY9m9I/DYedJIIFsX0JFmK5sD3QBC7T8S2KnJik+kIFCfKjK568n86OiPXfR7gQtVjkhnyNeCdAAAAABJRU5ErkJggg=='],
  ['external', {originUrl:'https://www.pinterest.com/pin/example1/',board:'test/palette'}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAOElEQVR42mMU94tgwAuOBTDiVyAfNQWPLBMDjcGoBaMWjFowasGoBaMWjFowasGoBaMWjFpALQAAC1gDIZD4r+kAAAAASUVORK5CYII='],
  ['generated', {projectId,imageId:id(103)}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAQklEQVR42mNUUlJiIARuXTvNQC5gYqAxGLVg1ALKAQu1DFLTMsWadUbjYNSCUQtGLRi1YGTVB7jaTqNxMGrBELAAAEewCKCQ3EpBAAAAAElFTkSuQmCC'],
  ['external', {originUrl:'https://www.pinterest.com/pin/example2/',board:'test/diagonal'}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAgUlEQVR42mOcJr6BgYGBgYEh7aEtAxKYJX+YKuJMmCqoy2aihauRxZloFDJwcSbahT5EnPHPj7eYYYesmkJxJlqEO3oqoqkdTLRLPzjzAXXtGM0HIyAfMKIV12j2Uy6OnkzR7KdcHOED6gY9IqONJtPR4nq0uB4trkdKPkDmU50NAGXphtxjahWkAAAAAElFTkSuQmCC'],
];
const mostra = [
  ['external', {originUrl:'https://www.pinterest.com/pin/t1/',board:'test/texture'}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAS0lEQVR42mP89vEOAy0BEwONAX0tsHeJxKqIEnEmNFFMPRSKIyw4uGc5nEQGFIozjqai0Xwwmg9G88FoPhjNB6P5YDQfjOaDYZIPAMvoe8sdMXQmAAAAAElFTkSuQmCC'],
  ['generated', {projectId,imageId:id(202)}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAU0lEQVR42mP89vEOAy0BEwONwZCyQMYgQMYggFYWwI1Gs4OJuqZjcodIHDy5sAEXl2o+gBuKZhnjaEYbtWDUglELRi0YChYwCinqjAbRqAUj3QIAsrsTW8VK8M4AAAAASUVORK5CYII='],
  ['local-upload', null, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAj0lEQVR42mP89vEOAy0BEwONwYiyoDFgKw0tgJhOhh2DI4iQHU6qJ8jxAUl2MJFnHPF2DHQc4HEpkZ6gyAfE2MFE9ZxF5Tgg6Agmyp2PXyV1UhEeO5hoF/pUzge43MRERedj1chCpOb6Dd7UKSooDH1M7dQvi9DsYKJF4kE2h46lKRXTPrJpjKMtu1ELKAYAs+kx6fdVI68AAAAASUVORK5CYII='],
  ['external', {originUrl:'https://www.pinterest.com/pin/t2/',board:'test/colors'}, 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAOElEQVR42mOMdKlmwAtUS+QYCIEaPn5cUkwMNAajFoxaMGrBqAWjFoxaMGrBqAWjFoxaMGoBtQAAeZACqE92xFQAAAAASUVORK5CYII='],
];
const transfer = process.argv.includes('--mostra');
const fixtures = transfer ? mostra : oficina;
const entries = fixtures.map(([inputOrigin,source,data], i) => {
  const bytes = Buffer.from(data, 'base64');
  const original = {mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length};
  return {id:id(i+1),ordinal:i+1,role:'reference',inputOrigin,source,original,transport:{...original,width:32,height:32},transformation:'none'};
});
const visualInput = {version:2,policy:'optimized-v1',externalConsent:true,entries};
const referenceImages = fixtures.map(([, ,data],i) => ({id:id(i+1),mime:'image/png',data}));
const context = {
  idea:'Cartaz de uma oficina de impressão',offer:'Oficina',audience:'',goal:'Inscrições',
  direction:'Preserve o símbolo enviado, adote a paleta da primeira externa e a distribuição de massas da arte gerada. Evite as listras da outra externa.',
  accepted:[],rejected:[],offerFacts:[],feedback:[],
};
if (transfer) {
  context.idea='Identidade de uma mostra de gravuras experimentais';
  context.offer='Mostra de gravuras';
  context.goal='Convidar a visitar a mostra';
  context.direction='Preserve exatamente o símbolo que enviei, a disposição das massas da imagem gerada e a paleta específica da última externa. Da primeira externa só interessa sugerir a textura; a distribuição exata dessa textura é livre.';
}
let message;
let instructions;
const provider = createManagedExplorationPlanProvider({
  apiKey:'sk-synthetic-fixture-not-a-real-credential',
  fetch:async (_url, options) => {
    assert.equal(options.method,'POST');
    const body = JSON.parse(options.body);
    message = body.input[0].content;
    instructions = body.agent.instructions;
    return Response.json({id:'sess_fixture'});
  },
});
await provider.create({context,visualInput,referenceImages});
const messageManifest = JSON.parse(message[0].text).visualInput;
assert.deepEqual(messageManifest,visualInput);
const attachedToPlanner = entries.map((entry,i) => {
  const label = message[i*2+1].text;
  const data = message[i*2+2].image_url;
  assert.equal(data,`data:image/png;base64,${referenceImages[i].data}`);
  return {id:entry.id,declaredOrigin:entry.inputOrigin,label,bytes:entry.transport.byteLength};
});
// Optional export for an independent multimodal judge with the exact synthetic prompt.
if (process.argv[2] === '--packet') {
  const destination = process.argv[3];
  assert.ok(destination, 'pass a new directory for this arm');
  await mkdir(destination, {recursive:false});
  await writeFile(join(destination,'prompt.txt'), [
    'Execute somente o papel a seguir sobre os dados sintéticos e as quatro imagens recebidas na ordem indicada. Responda o JSON do plano. Não use ferramentas.',
    instructions,
    ...message.filter(part=>part.type==='input_text').map(part=>part.text),
  ].join('\n\n'));
  for (const [i,image] of referenceImages.entries()) {
    await writeFile(join(destination,`ref-${i+1}.png`), Buffer.from(image.data,'base64'));
  }
}
// A fixed provider response isolates plan parsing and file transport from creative quality.
const referenceIds = transfer ? [id(2),id(3),id(4)] : [id(1),id(2),id(3)];
const items = [1,2,3].map(position => ({
  position, creativePrompt:`Caminho ${position}`,composition:`Composição ${position}`,
  contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`,
}));
const replayArg = process.argv.indexOf('--replay');
const rawPlan = replayArg === -1 ? {version:2,referenceIds,items} : JSON.parse(await readFile(process.argv[replayArg+1],'utf8'));
const plan = validateExplorationPlan(rawPlan,context,visualInput);
assert.ok(plan);
const requiredUpload = entries.find(entry=>entry.inputOrigin==='local-upload').id;
for (const invalid of [referenceIds.filter(item=>item!==requiredUpload),[...referenceIds].reverse(),[requiredUpload,id(99)],[requiredUpload,requiredUpload]]) {
  assert.equal(validateExplorationPlan({version:2,referenceIds:invalid,items},context,visualInput),null);
}
const selected = parseSelectedVisualInput(visualInput,referenceImages.filter(image=>plan.referenceIds.includes(image.id)),plan.referenceIds);
const payloadBytes = selected.referenceImages.reduce((sum,image)=>sum+Buffer.from(image.data,'base64').length,0);
const allBytes = entries.reduce((sum,entry)=>sum+entry.transport.byteLength,0);
console.log(JSON.stringify({
  stage:3, fixture:transfer?'mostra-visual-v1':'oficina-visual-v1', plannerTransport:'injected-synthetic', planSource:replayArg===-1?'fixed-control':'recorded-replay', plannerInputs:attachedToPlanner,
  validatedPlanFields:Object.keys(plan), retainedIds:plan.referenceIds, omittedAsFile:entries.filter(entry=>!plan.referenceIds.includes(entry.id)).map(entry=>entry.id),
  creativePrompts:plan.items.map(item=>item.creativePrompt),
  negativeControlsRejected:4,
  plannerImageBytes:allBytes, downstreamImageBytesPerRequest:payloadBytes,
  imageBytesAcrossThreeRequests:payloadBytes*3, allCandidatesCounterfactualBytesAcrossThreeRequests:allBytes*3,
  observedProviderUsage:null, inferredTextSubstitutions:null, observedFinalSimilarity:null,
},null,2));

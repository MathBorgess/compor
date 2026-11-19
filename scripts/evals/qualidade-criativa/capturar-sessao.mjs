import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2]);
const scenario = JSON.parse(await readFile(process.argv[3], 'utf8'));
const {createStudioChatHandlers} = await import(pathToFileURL(resolve(root, 'packages/agents-api/src/studio-chat.mjs')));
const {createSessionBindings} = await import(pathToFileURL(resolve(root, 'packages/agents-api/src/session-binding.mjs')));
const {createStudioBindings} = await import(pathToFileURL(resolve(root, 'packages/agents-api/src/studio-chat-bindings.mjs')));

const projectId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const pieceId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const appOrigin = 'https://compor.test';
const secret = Buffer.alloc(32, 8);

async function visualFixture(references, hashes) {
  assert.equal(scenario.provenance.kind, 'synthetic', 'A captura visual requer um caso sintético');
  const directory = await realpath(fileURLToPath(new URL('./fixtures', import.meta.url)));
  const entries = [], visualImages = [], contextReferences = [];
  for (const {id, name, asset, attach = true} of references) {
    assert.equal(typeof attach, 'boolean');
    assert.match(asset, /^scripts\/evals\/qualidade-criativa\/fixtures\/[a-z0-9-]+\.png$/);
    const file = await realpath(resolve(directory, basename(asset)));
    assert.equal(dirname(file), directory, 'Referência fora das fixtures públicas');
    const bytes = await readFile(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, hashes[asset], 'Hash da referência divergente');
    const original = {sha256, mime:'image/png', byteLength:bytes.length};
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    contextReferences.push({id, name, mime:original.mime, size:bytes.length, width, height,
      ...(attach ? {source:{kind:'local-upload'}} : {})});
    if (!attach) continue;
    entries.push({id, ordinal:entries.length + 1, role:'reference', inputOrigin:'local-upload', source:null,
      original, transport:{...original, width, height}, transformation:'none'});
    visualImages.push({id, mime:original.mime, data:bytes.toString('base64')});
  }
  return {contextReferences, visualInput:{version:2, policy:'optimized-v1', externalConsent:false, entries}, visualImages};
}

const {input} = scenario;
const visual = input.references.length ? await visualFixture(input.references, JSON.parse(process.argv[4])) : null;
const visualOptions = visual ? {
  selectedVisualsEnabled:true,
  authorizeVisualInput:async () => true,
  prepareVisualAuthority:async ({visualInput}) => {
    const {visualInputDigest} = await import(pathToFileURL(resolve(root, 'packages/agents-api/src/visual-input.mjs')));
    return {pieceId, manifestDigest:visualInputDigest(visualInput), consentSecret:null};
  },
  checkVisualAuthority:async () => true,
} : {};

let captured;
const unused = () => { throw new Error('A captura não executa ações nem consulta sessões remotas'); };
const {chat} = createStudioChatHandlers({
  appOrigin,
  ...visualOptions,
  resolveActor: async () => ({userId,token:'jwt-sintetico'}),
  ownsProject: async () => true,
  store: {
    reserve: async () => ({status:'reserved',turn:{attemptId,state:'starting'}}),
    bind: async () => {},
    get: unused, state: unused, claimAction: unused, finishAction: unused, getAction: unused,
  },
  attempts: {bindRecovery: async () => {},finish:unused},
  bindings: createSessionBindings({secret}),
  studioBindings: createStudioBindings({secret}),
  fetch: async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/agents/sessions');
    assert.equal(request.method, 'POST');
    assert.equal(captured, undefined);
    captured = JSON.parse(request.body);
    return Response.json({id:'sess_sintetico'},{status:201});
  },
  readPages: unused,
});

const context = {
  revision: 1, pieceId, projectTitle: input.project, projectTitleProvisional: false,
  brief: input.brief ?? {},
  postContext: input.postContext ?? {message:'',objective:'',action:''},
  references: visual?.contextReferences ?? [],
};
const response = await chat(new Request(appOrigin + '/api/studio/chat',{
  method:'POST',
  headers:{origin:appOrigin,'content-type':'application/json'},
  body:JSON.stringify({
    apiKey:'sk-sintetica_abcdefghijklmnopqrstuvwxyz',projectId,requestId,conversationId:pieceId,
    message:input.request,context,history:input.turns.map(({role,content})=>({role,text:content})),
    ...(visual ? {visualInput:visual.visualInput, visualImages:visual.visualImages} : {}),
  }),
}));
const result = await response.json();
assert.equal(response.status, 202, JSON.stringify(result));
assert.equal(result.status, 'running');
assert.equal(result.sessionReused, false);
assert.ok(captured?.agent?.instructions);
process.stdout.write(JSON.stringify(captured));

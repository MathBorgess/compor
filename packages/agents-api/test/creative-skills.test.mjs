import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POST_FORMATS,
  FORMAT_SPECS,
  CREATIVE_SKILLS_CATALOG_VERSION,
  formatImageSize,
  resolveCreativeSkillBundle,
} from '../src/creative-skills/index.mjs';
import { parseImageProposal } from '../src/image-proposal.mjs';
import {
  parseArtworkInput,
  artworkInputDigest,
  validateArtworkForProposal,
  compileArtworkPrompt,
} from '../src/artwork-input.mjs';
import { parseStudioAction, AGENT_STUDIO_TOOLS } from '../src/studio-chat-tools.mjs';
import { validateExplorationContext } from '../src/exploration-plan-contract.mjs';
import { createManagedExplorationPlanProvider } from '../src/exploration-plan-provider.mjs';
import { createStudioChatHandlers } from '../src/studio-chat.mjs';
import { createSessionBindings } from '../src/session-binding.mjs';
import { createStudioBindings } from '../src/studio-chat-bindings.mjs';

const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64').toString('base64');

test('catálogo de skills resolve duas camadas + copy-na-imagem e exatamente uma skill de formato por vez', () => {
  assert.deepEqual(POST_FORMATS, ['single', 'carousel', 'collection', 'story']);
  assert.equal(formatImageSize('single'), '1024x1280');
  assert.equal(formatImageSize('carousel'), '1024x1280');
  assert.equal(formatImageSize('collection'), '1024x1280');
  assert.equal(formatImageSize('story'), '864x1536');
  assert.equal(FORMAT_SPECS.carousel.minFrames, 3);
  assert.equal(FORMAT_SPECS.carousel.maxFrames, 10);
  assert.equal(FORMAT_SPECS.collection.minFrames, 2);
  assert.equal(FORMAT_SPECS.collection.maxFrames, 10);

  const expectedByFormat = {
    single: 'post-feed-estatico.v1',
    carousel: 'carrossel-narrativo.v1',
    collection: 'colecao-editorial.v1',
    story: 'story-vertical.v1',
  };

  for (const surface of ['chat', 'planner']) {
    for (const format of POST_FORMATS) {
      const bundle = resolveCreativeSkillBundle({ format, surface });
      assert.equal(bundle.catalogVersion, CREATIVE_SKILLS_CATALOG_VERSION);
      assert.equal(bundle.format, format);
      assert.deepEqual(bundle.ids, ['creative-core.v1', 'on-image-copy.v1', expectedByFormat[format]]);
      assert.match(bundle.instructions, /creative-core\.v1/);
      assert.match(bundle.instructions, /on-image-copy\.v1/);
      if (surface === 'chat') {
        assert.match(bundle.instructions, /Eugene Schwartz/);
        assert.match(bundle.instructions, /Slippery Slide/);
        assert.match(bundle.instructions, /Teste da Troca de Concorrente/);
        assert.match(bundle.instructions, /Não é sobre X, é sobre Y/);
      }
      for (const [otherFormat, otherId] of Object.entries(expectedByFormat)) {
        if (otherFormat !== format) {
          assert.equal(bundle.instructions.includes(otherId), false, `${format} não deve vazar ${otherId}`);
        }
      }
    }
  }
  assert.throws(() => resolveCreativeSkillBundle({ format: 'single', surface: 'invalid' }), TypeError);
});

test('image-proposal e artwork-input validam formatos, lâminas, âncora visual e proporção 9:16 mantendo legado intacto', () => {
  const frameId = uuid(10), anchorId = uuid(11), refId = uuid(12);
  const legacyInput = { literalText: { headline: 'Título', price: '', date: '' }, source: null, images: [] };
  const legacyProposal = { prompt: 'Pedido', operation: 'create', baseImageId: null, referenceIds: [] };
  assert.deepEqual(parseArtworkInput(legacyInput), legacyInput);
  assert.deepEqual(parseImageProposal(legacyProposal), legacyProposal);

  const storyProposal = parseImageProposal({ ...legacyProposal, format: 'story' });
  assert.equal(storyProposal.format, 'story');
  const storyInput = { ...legacyInput, format: 'story' };
  assert.notEqual(artworkInputDigest(storyInput), artworkInputDigest(legacyInput));
  const storyPrompt = compileArtworkPrompt(storyProposal, storyInput);
  assert.match(storyPrompt, /9:16 \(864x1536\)/);
  assert.match(storyPrompt, /15% superiores/);

  const carouselProposal = parseImageProposal({
    prompt: 'Slide 2 explicando o mecanismo com contraste limpo',
    operation: 'create',
    baseImageId: null,
    referenceIds: [refId],
    format: 'carousel',
    frameId,
    frameIndex: 2,
  });
  const carouselInput = {
    literalText: { headline: 'O erro que trava o alcance', price: '', date: '' },
    source: null,
    format: 'carousel',
    frame: {
      id: frameId,
      position: 2,
      total: 5,
      role: 'problema',
      headline: 'O erro que trava o alcance',
      body: 'A maioria troca a cor do fundo sem mudar o gancho.',
      visualCue: 'Diagrama simples comparando dois cards',
      visualInvariants: 'Fundo creme quente, tipografia sem serifa preta, destaque terracota',
    },
    images: [
      { id: anchorId, role: 'anchor', mime: 'image/png', data: png },
      { id: refId, role: 'reference', mime: 'image/png', data: png },
    ],
  };
  assert.doesNotThrow(() => validateArtworkForProposal(carouselProposal, carouselInput));
  const carouselPrompt = compileArtworkPrompt(carouselProposal, carouselInput);
  assert.match(carouselPrompt, /posição 2 de 5/);
  assert.match(carouselPrompt, /lâmina 1 âncora visual da série/);
  assert.match(carouselPrompt, /Invariantes visuais do conjunto/);

  // Carousel requires frameId
  assert.throws(() => parseImageProposal({ ...legacyProposal, format: 'carousel' }));
  // Story forbids frameId
  assert.throws(() => parseImageProposal({ ...legacyProposal, format: 'story', frameId }));
  // Anchor image forbidden in single/story
  assert.throws(() => parseArtworkInput({ ...legacyInput, format: 'story', images: [{ id: anchorId, role: 'anchor', mime: 'image/png', data: png }] }));
});

test('ferramentas de formato, plano de lâminas, edição cirúrgica de lâmina e perfil de voz validam estritamente', () => {
  const scope = { projectId: uuid(1), revision: 2, requestId: uuid(2) };
  const pieceId = uuid(3), frameId = uuid(4);

  assert.equal(parseStudioAction('compor_definir_formato', { ...scope, pieceId, format: 'story' }).format, 'story');
  assert.equal(parseStudioAction('compor_definir_formato', { ...scope, pieceId, format: 'carousel', frameCount: 5 }).frameCount, 5);
  assert.equal(parseStudioAction('compor_definir_formato', { ...scope, pieceId, format: 'collection', frameCount: 2 }).frameCount, 2);
  assert.throws(() => parseStudioAction('compor_definir_formato', { ...scope, pieceId, format: 'carousel', frameCount: 2 }));
  assert.throws(() => parseStudioAction('compor_definir_formato', { ...scope, pieceId, format: 'story', frameCount: 2 }));

  const plan = {
    ...scope,
    pieceId,
    baseVersion: 0,
    visualInvariants: 'Paleta areia e grafite, luz natural lateral',
    frames: [
      { id: frameId, position: 1, role: 'capa', headline: 'Pare de perder tempo', body: 'O ajuste de 2 minutos.', visualCue: 'Close da mesa de trabalho' },
      { position: 2, role: 'detalhe', headline: 'O detalhe?', body: 'Comece pela primeira dobra.', visualCue: 'Tela de celular em 360px' },
    ],
  };
  assert.equal(parseStudioAction('compor_definir_plano_laminas', plan).frames.length, 2);
  assert.throws(() => parseStudioAction('compor_definir_plano_laminas', { ...plan, frames: [plan.frames[0]] }));
  assert.throws(() => parseStudioAction('compor_definir_plano_laminas', { ...plan, visualInvariants: 'sk-segredo' }));

  assert.equal(parseStudioAction('compor_editar_lamina', { ...scope, pieceId, baseVersion: 0, frameId, field: 'headline', value: 'Novo gancho' }).value, 'Novo gancho');
  assert.throws(() => parseStudioAction('compor_editar_lamina', { ...scope, pieceId, baseVersion: 0, frameId: 'invalido', field: 'headline', value: 'x' }));

  assert.equal(parseStudioAction('compor_editar_voz', { ...scope, field: 'avoid', value: 'destrave, revolucione' }).field, 'avoid');
  assert.throws(() => parseStudioAction('compor_editar_voz', { ...scope, field: 'tone', value: 'sk-nao-pode' }));

  for (const name of ['compor_definir_formato', 'compor_definir_plano_laminas', 'compor_editar_lamina', 'compor_editar_voz']) {
    assert.ok(AGENT_STUDIO_TOOLS.some(tool => tool.name === name), `ferramenta ${name} deve estar exposta ao agente`);
  }
});

test('planejador de exploração aceita postFormat e brandVoice opcionais e injeta skills correspondentes', async () => {
  const baseContext = {
    idea: 'Lançamento de café torra média',
    offer: 'Assinatura mensal de café em grãos',
    audience: 'Pessoas que preparam café coado em casa',
    goal: 'Levar ao link nos stories',
    direction: 'Editorial limpo e quente',
    offerFacts: [],
    accepted: [],
    rejected: [],
    feedback: [],
  };
  assert.equal(validateExplorationContext(baseContext), true);
  const storyContext = {
    ...baseContext,
    postFormat: 'story',
    brandVoice: { tone: 'Direto e acolhedor', examples: 'Café moído na hora muda a manhã.', avoid: 'destrave, revolucione' },
  };
  assert.equal(validateExplorationContext(storyContext), true);
  assert.equal(validateExplorationContext({ ...baseContext, postFormat: 'banner' }), false);
  assert.equal(validateExplorationContext({ ...baseContext, brandVoice: { tone: 'sk-leak', examples: '', avoid: '' } }), false);

  let sentInstructions = '';
  const provider = createManagedExplorationPlanProvider({
    apiKey: `sk-${'a'.repeat(30)}`,
    fetch: async (_url, init) => {
      sentInstructions = JSON.parse(init.body).agent.instructions;
      return Response.json({ id: 'sess_story_plan' });
    },
  });
  const created = await provider.create({ context: storyContext });
  assert.equal(created.sessionId, 'sess_story_plan');
  assert.match(sentInstructions, /creative-core\.v1/);
  assert.match(sentInstructions, /on-image-copy\.v1/);
  assert.match(sentInstructions, /story 9:16 \(864x1536\)/);
});

test('studio-chat injeta skill do formato ativo, valida brandVoice/frames e abre nova sessão ao trocar formato', async () => {
  const secret = Buffer.alloc(32, 9);
  const userId = uuid(1), projectId = uuid(2), pieceId = uuid(3), frameId = uuid(4), req1 = uuid(5), req2 = uuid(6);
  const apiKey = `sk-${'b'.repeat(30)}`;
  const records = new Map();
  let sessionCount = 0;
  const createdSessions = [];
  const events = [];
  const store = {
    async reserve(scope) {
      const attemptId = uuid(100 + records.size);
      const record = { ...scope, userId: scope.actor.userId, attemptId, state: 'starting', binding: null, expiresAt: new Date(Date.now() + 200000).toISOString(), turnId: 'turn_1' };
      records.set(scope.requestId, record);
      return { status: 'reserved', turn: record };
    },
    async get(scope) { return records.get(scope.requestId) ?? null; },
    async bind(scope) { const r = records.get(scope.requestId); Object.assign(r, { binding: scope.binding, expiresAt: scope.expiresAt }); },
    async state(scope) { const r = records.get(scope.requestId); r.state = scope.state; if (scope.turnId) r.turnId = scope.turnId; },
    async claimAction() { return { status: 'claimed', id: uuid(200) }; },
    async finishAction() {},
    async getAction() { return null; },
  };
  const { chat } = createStudioChatHandlers({
    appOrigin: 'https://compor.test',
    resolveActor: async () => ({ userId, token: 'tok' }),
    ownsProject: async () => true,
    store,
    attempts: { bindRecovery: async () => {}, finish: async () => {} },
    bindings: createSessionBindings({ secret }),
    studioBindings: createStudioBindings({ secret }),
    onEvent: (name, meta) => { events.push({ name, meta }); },
    fetch: async (url, init = {}) => {
      if (init.method === 'POST' && String(url).endsWith('/sessions')) {
        const body = JSON.parse(init.body);
        createdSessions.push(body.agent.instructions);
        return Response.json({ id: `sess_${++sessionCount}` });
      }
      if (String(url).endsWith('/sess_1')) {
        return Response.json({
          id: 'sess_1',
          status: 'idle',
          required_actions: [],
          agent: { model: 'gpt-6.1-terra', tools: AGENT_STUDIO_TOOLS, instructions: createdSessions[0] },
          usage: { input_tokens: 10, output_tokens: 5 },
        });
      }
      throw Error(`unexpected fetch ${url}`);
    },
  });

  const baseReq = (requestId, extra = {}) => new Request('https://compor.test/api/studio/chat', {
    method: 'POST',
    headers: { origin: 'https://compor.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      projectId,
      requestId,
      conversationId: pieceId,
      message: 'Crie ganchos no meu tom de voz',
      context: {
        revision: 1,
        pieceId,
        postFormat: 'carousel',
        brandVoice: { tone: 'Claro e técnico sem jargão vazio', examples: 'Corte 40% do texto antes de abrir o editor.', avoid: 'destrave, game-changer' },
        frames: [{ id: frameId, position: 1, role: 'capa', headline: 'Gancho', body: 'Apoio', visualCue: 'Diagrama', hasImage: false }],
        activeFrameId: frameId,
        ...extra.context,
      },
      ...extra.body,
    }),
  });

  const r1 = await chat(baseReq(req1));
  assert.equal(r1.status, 202);
  assert.equal(createdSessions.length, 1);
  assert.match(createdSessions[0], /carrossel-narrativo\.v1/);
  assert.match(createdSessions[0], /on-image-copy\.v1/);
  assert.equal(createdSessions[0].includes('story-vertical.v1'), false);
  assert.equal(events.find(e => e.name === 'session_created')?.meta.postFormat, 'carousel');

  // Marca req1 como completed e troca postFormat para story -> deve criar nova sessão em vez de reutilizar sess_1
  records.get(req1).state = 'completed';
  const r2 = await chat(baseReq(req2, { context: { postFormat: 'story', frames: undefined, activeFrameId: null }, body: { previousAttemptKey: req1 } }));
  assert.equal(r2.status, 202);
  const body2 = await r2.json();
  assert.equal(body2.sessionReused, false);
  assert.equal(createdSessions.length, 2);
  assert.match(createdSessions[1], /story-vertical\.v1/);
  assert.equal(createdSessions[1].includes('carrossel-narrativo.v1'), false);
});

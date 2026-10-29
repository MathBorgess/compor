import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import {
  apply_sid_diversity_decay,
  CANONICAL_BOARD_SLUGS,
  compute_board_affinity_score,
  compute_ema_session_vector,
  compute_phoenix_multi_action_score,
  compute_user_tower_embedding,
  cosine_similarity,
  createPhoenixHyperparams,
  EXPLORATION_FEED_BOARDS,
  filter_excluded_sid_candidates,
  format_mcp_response,
  inferCandidateSid,
  l2_normalize,
  matches_excluded_sid,
  PhoenixDecisionApiService,
  PhoenixMemoryStore,
  SID_TAXONOMY,
  webDiscoveryResponseSchema,
} from '../dist/phoenix_engine/index.js';

test('1. L2 normalization and User Tower vector direction (pos_session_vecs vs neg_session_vecs)', () => {
  const hp = createPhoenixHyperparams();

  const rawVec = [3.0, 4.0, 0.0, 0.0];
  const normalized = l2_normalize(rawVec);
  const norm = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 1e-9, 'L2 norm must be 1.0');
  assert.ok(Math.abs(normalized[0] - 0.6) < 1e-9);
  assert.ok(Math.abs(normalized[1] - 0.8) < 1e-9);

  // Base query vector and target candidate vector
  const queryVec = l2_normalize([1.0, 0.2, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0]);
  const targetVec = l2_normalize([0.1, 1.0, 0.4, 0.0, 0.0, 0.2, 0.0, 0.0]);

  const baseUserTower = compute_user_tower_embedding(queryVec, [], [], null, hp);
  const baseSim = cosine_similarity(baseUserTower, targetVec);

  // Adding targetVec to pos_session_vecs must strictly increase cosine similarity
  const userTowerWithPos = compute_user_tower_embedding(
    queryVec,
    [targetVec],
    [],
    null,
    hp,
  );
  const posSim = cosine_similarity(userTowerWithPos, targetVec);
  assert.ok(
    posSim > baseSim,
    `Expected positive session interaction to increase similarity (${posSim} > ${baseSim})`,
  );

  // Adding targetVec to neg_session_vecs must strictly decrease cosine similarity
  const userTowerWithNeg = compute_user_tower_embedding(
    queryVec,
    [],
    [targetVec],
    null,
    hp,
  );
  const negSim = cosine_similarity(userTowerWithNeg, targetVec);
  assert.ok(
    negSim < baseSim,
    `Expected negative session interaction to decrease similarity (${negSim} < ${baseSim})`,
  );

  // Verify EMA session decay gives greater weight to the most recent vector
  const oldVec = [1.0, 0.0, 0.0, 0.0];
  const recentVec = [0.0, 1.0, 0.0, 0.0];
  const emaVec = compute_ema_session_vector([oldVec, recentVec], hp.ema_session_decay);
  assert.ok(
     cosine_similarity(emaVec, recentVec) > cosine_similarity(emaVec, oldVec),
    'Most recent session vector must weigh more than older vector under EMA decay',
  );
});

test('2. Candidate Isolation (Batch Invariance) & Beta-Bernoulli Board Affinity', async () => {
  const hp = createPhoenixHyperparams();
  const decisionService = new PhoenixDecisionApiService({
    hp,
    forceDeterministicMock: true,
  });

  const candidateA = {
    candidate_id: 'cand_A',
    board: 'behance/typography',
    metadata_sid: [
      'carousel_editorial_4:5',
      'swiss_grid',
      'bold_display_hook',
      'tactile_paper_texture',
    ],
    visual_description: 'Grid suíço editorial com tipografia bold na capa.',
    preview_url: 'https://i.pinimg.com/236x/a.jpg',
    origin_url: 'https://www.pinterest.com/pin/1/',
    staging_path: '/tmp/compor-refs/sid_test/board.html#cand_A',
  };

  const candidateB = {
    candidate_id: 'cand_B',
    board: 'dribbble/design-inspiration',
    metadata_sid: [
      'carousel_editorial_4:5',
      'bento_grid',
      'minimal_whitespace',
      'dark_tech_saas',
    ],
    visual_description: 'Bento grid dark tech SaaS.',
    preview_url: 'https://i.pinimg.com/236x/b.jpg',
    origin_url: 'https://www.pinterest.com/pin/2/',
    staging_path: '/tmp/compor-refs/sid_test/board.html#cand_B',
  };

  const candidateC = {
    candidate_id: 'cand_C',
    board: 'kittldesign/ads-designs',
    metadata_sid: [
      'ad_performance_4:5',
      'hero_product_d2c',
      'high_contrast_cta',
      'vibrant_retail_promo',
    ],
    visual_description: 'Anúncio promocional de varejo com CTA de alto contraste.',
    preview_url: 'https://i.pinimg.com/236x/c.jpg',
    origin_url: 'https://www.pinterest.com/pin/3/',
    staging_path: '/tmp/compor-refs/sid_test/board.html#cand_C',
  };

  const userTowerVec = await decisionService.embedText('carrossel editorial tipografia grid suíço');
  const userTaste = {
    user_id: 'user_invariance',
    preferred_boards_by_goal: {},
    visual_dna_rules: [],
    negative_constraints: [],
    updated_at: new Date().toISOString(),
  };

  // Evaluate Batch 1: [A, B]
  const probsBatch1 = await Promise.all(
    [candidateA, candidateB].map((candidate) =>
      decisionService.rankSingleCandidateIsolated({
        user_id: 'user_invariance',
        briefing: 'carrossel editorial',
        user_taste: userTaste,
        session_events_log: 'Nenhum evento',
        user_tower_vec: userTowerVec,
        candidate,
        source: 'deterministic_mock',
      }),
    ),
  );
  const rawScoreA_Batch1 = compute_phoenix_multi_action_score(probsBatch1[0], hp);

  // Evaluate Batch 2: [C, A]
  const probsBatch2 = await Promise.all(
    [candidateC, candidateA].map((candidate) =>
      decisionService.rankSingleCandidateIsolated({
        user_id: 'user_invariance',
        briefing: 'carrossel editorial',
        user_taste: userTaste,
        session_events_log: 'Nenhum evento',
        user_tower_vec: userTowerVec,
        candidate,
        source: 'deterministic_mock',
      }),
    ),
  );
  const rawScoreA_Batch2 = compute_phoenix_multi_action_score(probsBatch2[1], hp);

  assert.equal(
    rawScoreA_Batch1,
    rawScoreA_Batch2,
    'Candidate A raw_score must be 100% invariant to other candidates in the batch',
  );

  // Beta-Bernoulli posterior mean verification
  const priorMean = compute_board_affinity_score(0, 0, hp);
  assert.equal(priorMean, 0.5);
  const afterSuccess = compute_board_affinity_score(3, 3, hp);
  const afterFailures = compute_board_affinity_score(0, 3, hp);
  assert.ok(afterSuccess > priorMean);
  assert.ok(afterFailures < priorMean);
});

test('3. SID Prefix Diversity Decay demotes repetitive clusters and promotes distinct mechanic', () => {
  const hp = createPhoenixHyperparams({
    sid_diversity_decay_factor: 0.65,
    sid_prefix_depth: 2,
  });

  const candidates = [
    {
      candidate_id: 'swiss_1',
      metadata_sid: ['carousel_editorial_4:5', 'swiss_grid', 'bold_display_hook', 'tactile_paper_texture'],
      raw_score: 20.0,
    },
    {
      candidate_id: 'swiss_2',
      metadata_sid: ['carousel_editorial_4:5', 'swiss_grid', 'minimal_whitespace', 'executive_clean_b2b'],
      raw_score: 19.0,
    },
    {
      candidate_id: 'swiss_3',
      metadata_sid: ['carousel_editorial_4:5', 'swiss_grid', 'editorial_multicolumn', 'tactile_paper_texture'],
      raw_score: 18.0,
    },
    {
      candidate_id: 'bento_1',
      metadata_sid: ['carousel_editorial_4:5', 'bento_grid', 'bold_display_hook', 'dark_tech_saas'],
      raw_score: 15.0,
    },
  ];

  const reranked = apply_sid_diversity_decay(candidates, hp);

  // Expected final scores:
  // swiss_1 (seen=0): 20.0 * (0.65^0) = 20.0
  // bento_1 (seen=0): 15.0 * (0.65^0) = 15.0  <-- promoted to #2!
  // swiss_2 (seen=1): 19.0 * (0.65^1) = 12.35
  // swiss_3 (seen=2): 18.0 * (0.65^2) = 7.605
  assert.deepEqual(
    reranked.map((c) => c.candidate_id),
    ['swiss_1', 'bento_1', 'swiss_2', 'swiss_3'],
  );
  assert.equal(reranked[0].final_score, 20.0);
  assert.equal(reranked[0].diversity_multiplier, 1.0);
  assert.equal(reranked[1].final_score, 15.0);
  assert.equal(reranked[1].diversity_multiplier, 1.0);
  assert.equal(reranked[2].final_score, 12.35);
  assert.equal(reranked[2].diversity_multiplier, 0.65);
  assert.equal(reranked[3].final_score, 7.605);
  assert.equal(reranked[3].diversity_multiplier, 0.4225);
});

test('4. Dual MCP Serialization (codex vs web), 3-Tier Memory, and Luna Subagent / API Key flow', async () => {
  assert.ok(CANONICAL_BOARD_SLUGS.length >= 40);
  assert.ok(EXPLORATION_FEED_BOARDS.every((b) => b.endsWith('/feed')));
  assert.equal(Object.keys(SID_TAXONOMY).length, 4);

  const hp = createPhoenixHyperparams({ memory_compaction_threshold: 2 });
  const memoryStore = new PhoenixMemoryStore({ hp });
  let lunaCalls = 0;

  const decisionService = new PhoenixDecisionApiService({
    hp,
    forceDeterministicMock: false,
    subagentRunner: (prompt, schemaName) => {
      lunaCalls += 1;
      if (schemaName === 'phoenix_board_router_decision') {
        return JSON.stringify({
          board_allocations: [
            {
              board: 'behance/typography',
              role: 'hook_cover',
              weight: 0.45,
              synthetic_query: 'Tipografia impactante de capa para carrossel',
              rationale: 'Forte gancho tipográfico.',
            },
            {
              board: 'creativemarket/magazine-templates',
              role: 'structural_grid',
              weight: 0.35,
              synthetic_query: 'Grid editorial modular em colunas',
              rationale: 'Estrutura limpa de leitura.',
            },
            {
              board: 'dribbble/feed',
              role: 'wildcard_exploration',
              weight: 0.2,
              synthetic_query: 'Exploração de componentes e bento grid',
              rationale: 'Descoberta out-of-network.',
            },
          ],
          required_sid_tags: ['carousel_editorial_4:5', 'swiss_grid'],
          excluded_sid_tags: [],
        });
      }
      return JSON.stringify({
        p_use_as_layout_grid: 0.8, p_use_as_typography_hook: 0.7,
        p_use_color_and_vibe: 0.6, p_high_conversion_clarity: 0.6,
        p_dwell_engagement: 0.5, p_reject_too_generic: 0.1,
        p_reject_style_mismatch: 0.1, composition_guideline: 'Grid editorial',
      });
    },
  });

  const mockPinterestProvider = {
    sourceId: 'pinterest_curated_design',
    accessMethod: 'curated_board_http',
    async searchMetadataOnly(query) {
      const board = query.source?.allowed_boards_or_queries?.[0] || 'behance/typography';
      return Array.from({ length: query.limit || 2 }, (_, idx) => ({
        raw_title: `Pin Real de ${board} #${idx + 1}`,
        raw_caption: `Composição real de ${board} para ${query.briefing_summary} (${idx + 1})`,
        source_id: 'pinterest_curated_design',
        origin_url: `https://www.pinterest.com/pin/real_${board.replace(/[^a-z0-9]/gi, '_')}_${idx + 1}/`,
        preview_url: `https://i.pinimg.com/236x/real/${board}/${idx + 1}.jpg`,
        media_url: `https://i.pinimg.com/736x/real/${board}/${idx + 1}.jpg`,
        aspect_rationale: { composition: `Composição de ${board}` },
        thumbnail_base64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/v3AgAA=',
        thumbnail_mime_type: 'image/webp',
      }));
    },
  };

  const server = createComporServer({
    phoenixHyperparams: hp,
    phoenixMemoryStore: memoryStore,
    phoenixActorId: 'matheus_dev',
    phoenixDecisionService: decisionService,
    providers: new Map([['pinterest_curated_design', mockPinterestProvider]]),
  });
  const client = new Client({ name: 'phoenix-dual-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    // 4a. Test client_mode="codex" with subagent Luna fallback when OPENAI_API_KEY is unset
    const savedApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const codexRes = await client.callTool({
        name: 'discover_visual_references',
        arguments: {
          briefing: 'Carrossel de 5 slides sobre arquitetura de sistemas com estética editorial suíça',
          target_format: 'carousel_editorial_4:5',
          client_mode: 'codex',
          consent_external_search: true,
          consent_model: true,
        },
      });

      assert.equal(codexRes.isError, undefined);
      const codexMarkdown = codexRes.content[0].text;
      assert.equal(typeof codexMarkdown, 'string');
      assert.match(codexMarkdown, /Phoenix Visual Decision Engine/);
      assert.match(codexMarkdown, /SIDs:/);
      assert.match(codexMarkdown, /gpt-6-luna/);
      assert.match(codexMarkdown, /https:\/\/www\.pinterest\.com\/pin\//i);
      assert.doesNotMatch(codexMarkdown, /utm_/i);
      assert.equal(codexRes.content.filter(block => block.type === 'image').length, codexRes.structuredContent.top_candidates.length);
      assert.ok(codexRes.structuredContent.top_candidates.every(c => c.origin_url.startsWith('https://www.pinterest.com/pin/')));
      assert.ok(lunaCalls >= 1, 'Expected subagent Luna runner to be invoked in codex mode without OPENAI_API_KEY');

      // 4b. Test decision_fallback_mode="require_key" asking user for OPENAI_API_KEY
      const askKeyRes = await client.callTool({
        name: 'discover_visual_references',
        arguments: {
          briefing: 'Post de anúncio de curso',
          target_format: 'ad_performance_4:5',
          client_mode: 'codex',
          consent_external_search: true,
          consent_model: true,
          decision_fallback_mode: 'require_key',
        },
      });
      assert.equal(askKeyRes.structuredContent.status, 'requires_api_key');
      assert.match(askKeyRes.content[0].text, /OPENAI_API_KEY/);
    } finally {
      if (savedApiKey !== undefined) {
        process.env.OPENAI_API_KEY = savedApiKey;
      }
    }

    // 4c. Test client_mode="web" returning full JSON validated by webDiscoveryResponseSchema
    const webRes = await client.callTool({
      name: 'discover_visual_references',
      arguments: {
        briefing: 'Infográfico executivo B2B para LinkedIn sobre funil de vendas',
        target_format: 'linkedin_infographic',
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
        decision_fallback_mode: 'deterministic_mock',
      },
    });

    assert.equal(webRes.isError, undefined);
    const parsedWeb = webDiscoveryResponseSchema.parse(webRes.structuredContent);
    assert.equal(parsedWeb.client_mode, 'web');
    assert.ok(parsedWeb.board_allocations.length >= 2);
    assert.ok(parsedWeb.candidates.length >= 4);
    assert.ok(parsedWeb.telemetry.exploration_quota_allocated <= hp.exploration_feed_quota);

    // Confirm format_mcp_response("codex") vs format_mcp_response("web") directly
    const directCodex = format_mcp_response(parsedWeb, 'codex');
    assert.equal(typeof directCodex, 'string');
    assert.match(directCodex, /https:\/\/www\.pinterest\.com\/pin\//i);

    const directWeb = format_mcp_response(parsedWeb, 'web');
    assert.deepEqual(directWeb, parsedWeb);

    // 4d. Test record_visual_feedback & automatic compaction after 2 events (memory_compaction_threshold = 2)
    const firstCand = parsedWeb.candidates[0];
    const fb1 = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        event_id: 'first-lock',
        candidate_id: firstCand.candidate_id,
        board: firstCand.board,
        metadata_sid: firstCand.metadata_sid,
        action: 'locked_as_reference',
        dwell_time_ms: 4200,
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(fb1.isError, undefined);
    assert.equal(fb1.structuredContent.positive_session_count, 1);
    assert.equal(fb1.structuredContent.compaction_triggered, false);
    assert.ok(fb1.structuredContent.board_affinity.total_impressions >= 1);

    const secondCand = parsedWeb.candidates[1];
    const fb2 = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        event_id: 'second-reject',
        candidate_id: secondCand.candidate_id,
        board: secondCand.board,
        metadata_sid: secondCand.metadata_sid,
        action: 'style_mismatch',
        dwell_time_ms: 800,
        client_mode: 'codex',
      },
    });
    assert.equal(fb2.isError, undefined);
    assert.equal(fb2.structuredContent.negative_session_count, 1);
    assert.equal(fb2.structuredContent.compaction_triggered, true);
    assert.deepEqual(fb2.structuredContent.negative_constraints, []);
  } finally {
    await client.close();
    await server.close();
  }
});

test('5. Review Fixes: real provider retrieval, discovery-scoped IDs, unified embedding space, and hard SID exclusion filter', async () => {
  const hp = createPhoenixHyperparams({ memory_compaction_threshold: 2 });
  const memoryStore = new PhoenixMemoryStore({ hp });

  const providerCalls = [];
  const realPinterestProvider = {
    sourceId: 'pinterest_curated_design',
    accessMethod: 'curated_board_http',
    async searchMetadataOnly(query) {
      const board = query.source?.allowed_boards_or_queries?.[0] || 'behance/typography';
      providerCalls.push({ board, query: query.briefing_summary, limit: query.limit });
      return [
        {
          raw_title: `Real Pin A (${board})`,
          raw_caption: `Real editorial layout from ${board} with swiss grid typography`,
          source_id: 'pinterest_curated_design',
          origin_url: `https://www.pinterest.com/pin/real_a_${board.replace(/[^a-z0-9]/gi, '_')}/`,
          preview_url: `https://i.pinimg.com/236x/real_a/${board}/pin1.jpg`,
          media_url: `https://i.pinimg.com/736x/real_a/${board}/pin1.jpg`,
          aspect_rationale: { composition: 'Swiss grid editorial' },
          thumbnail_base64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/v3AgAA=',
          thumbnail_mime_type: 'image/webp',
        },
        {
          raw_title: `Real Pin B (${board})`,
          raw_caption: `Real glassmorphism UI concept from ${board} with neon glow`,
          source_id: 'pinterest_curated_design',
          origin_url: `https://www.pinterest.com/pin/real_b_${board.replace(/[^a-z0-9]/gi, '_')}/`,
          preview_url: `https://i.pinimg.com/236x/real_b/${board}/pin2.jpg`,
          media_url: `https://i.pinimg.com/736x/real_b/${board}/pin2.jpg`,
          aspect_rationale: { composition: 'Glassmorphism UI' },
          thumbnail_base64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/v3AgAA=',
          thumbnail_mime_type: 'image/webp',
        },
      ];
    },
  };

  // Mock OpenAI client that embeds all texts in a distinctive coordinate basis
  // (index 0 = 0.99, whereas SHA-256 local embeddings are distributed across 64 dims)
  const embeddedInputs = [];
  const makeOpenAiBasisVec = (text) => {
    const raw = new Array(hp.embedding_dimension).fill(0);
    raw[0] = 0.95;
    raw[1] = text.toLowerCase().includes('swiss') ? 0.3 : 0.05;
    raw[2] = text.toLowerCase().includes('glassmorphism') ? -0.25 : 0.1;
    raw[3] = (text.length % 17) / 100;
    return l2_normalize(raw);
  };

  const mockOpenAiClient = {
    embeddings: {
      async create({ input }) {
        const list = Array.isArray(input) ? input : [input];
        embeddedInputs.push(...list);
        return {
          data: list.map((item) => ({
            embedding: makeOpenAiBasisVec(String(item)),
          })),
        };
      },
    },
    responses: {
      async create({ text }) {
        const schemaName = text?.format?.name;
        if (schemaName === 'phoenix_board_router_decision') {
          return {
            output_text: JSON.stringify({
              board_allocations: [
                {
                  board: 'behance/typography',
                  role: 'hook_cover',
                  weight: 0.45,
                  synthetic_query: 'Swiss grid editorial cover typography',
                  rationale: 'High-impact typographic hook.',
                },
                {
                  board: 'creativemarket/magazine-templates',
                  role: 'structural_grid',
                  weight: 0.35,
                  synthetic_query: 'Modular magazine grid layout',
                  rationale: 'Clean editorial rhythm.',
                },
                {
                  board: 'dribbble/feed',
                  role: 'wildcard_exploration',
                  weight: 0.2,
                  synthetic_query: 'Experimental UI layout exploration',
                  rationale: 'Out-of-network discovery.',
                },
              ],
              required_sid_tags: ['carousel_editorial_4:5', 'swiss_grid'],
              excluded_sid_tags: [],
            }),
          };
        }
        if (schemaName === 'phoenix_isolated_candidate_action_probs') {
          return {
            output_text: JSON.stringify({
              p_use_as_layout_grid: 0.88,
              p_use_as_typography_hook: 0.82,
              p_use_color_and_vibe: 0.79,
              p_high_conversion_clarity: 0.75,
              p_dwell_engagement: 0.5,
              p_reject_too_generic: 0.06,
              p_reject_style_mismatch: 0.04,
              composition_guideline: 'Grid suíço de alta precisão com hierarquia tipográfica clara.',
            }),
          };
        }
        if (schemaName === 'phoenix_memory_consolidation') {
          return {
            output_text: JSON.stringify({
              visual_dna_rules: ['Priorizar grid suíço e contraste tipográfico editorial'],
              negative_constraints: ['carousel_editorial_4:5/glassmorphism_ui'],
              preferred_boards_by_goal: {
                'carousel_editorial_4:5': ['behance/typography'],
              },
              consolidated_taste_summary: 'swiss grid editorial typography minimal whitespace',
            }),
          };
        }
        throw new Error(`Unexpected schema: ${schemaName}`);
      },
    },
  };

  const decisionService = new PhoenixDecisionApiService({
    hp,
    forceDeterministicMock: false,
    openaiClient: mockOpenAiClient,
  });

  // Mock fetchFn for stage_approved_references so staging verifies the real provider media_url is fetched
  const fetchedUrls = [];
  const validWebpBytes = Buffer.from(
    'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAQAcJaQAA3AA/v3AgAA=',
    'base64',
  );
  const mockFetchFn = async (url) => {
    fetchedUrls.push(String(url));
    return new Response(validWebpBytes, {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    });
  };

  const server = createComporServer({
    phoenixHyperparams: hp,
    phoenixMemoryStore: memoryStore,
    phoenixActorId: 'user_fixes',
    phoenixDecisionService: decisionService,
    providers: new Map([['pinterest_curated_design', realPinterestProvider]]),
    fetchFn: mockFetchFn,
  });

  const client = new Client({ name: 'phoenix-fixes-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    // --- FIX 1: Retrieve real references from providers instead of fabricating /mock/ URLs ---
    const disc1Res = await client.callTool({
      name: 'discover_visual_references',
      arguments: {
        briefing: 'Carrossel editorial suíço sobre engenharia de software',
        target_format: 'carousel_editorial_4:5',
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(disc1Res.isError, undefined);
    const disc1 = webDiscoveryResponseSchema.parse(disc1Res.structuredContent);

    assert.ok(providerCalls.length >= 3, 'Expected real provider to be queried for allocated boards');
    for (const cand of disc1.candidates) {
      assert.doesNotMatch(
        cand.preview_url,
        /\/mock\//,
        'Non-mock discovery must NOT fabricate /mock/ preview URLs',
      );
      assert.match(
        cand.preview_url,
        /^https:\/\/i\.pinimg\.com\/236x\/real_[ab]\//,
        'Candidate preview_url must come from real provider item',
      );
      assert.match(
        cand.origin_url,
        /^https:\/\/www\.pinterest\.com\/pin\/real_[ab]_/,
        'Candidate origin_url must come from real provider item',
      );
      assert.match(
        cand.visual_description,
        /Real (editorial layout|glassmorphism UI concept)/,
        'Candidate description must come from real provider caption',
      );
    }

    // --- FIX 2: Unique discovery-scoped candidate IDs across sequential discoveries ---
    const disc2Res = await client.callTool({
      name: 'discover_visual_references',
      arguments: {
        briefing: 'Segundo discovery para outro usuário na mesma instância de store',
        target_format: 'carousel_editorial_4:5',
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(disc2Res.isError, undefined);
    const disc2 = webDiscoveryResponseSchema.parse(disc2Res.structuredContent);

    const disc1Ids = new Set(disc1.candidates.map((c) => c.candidate_id));
    const disc2Ids = new Set(disc2.candidates.map((c) => c.candidate_id));

    for (const id of disc1Ids) {
      assert.notEqual(id, 'phx_ref_01', 'Must not use static phx_ref_01 ID');
      assert.ok(!disc2Ids.has(id), `Candidate ID ${id} from discovery 1 must not collide with discovery 2`);
    }

    // Stage a candidate from Discovery #1 AFTER Discovery #2 ran: must still resolve to Discovery #1's session & real URL!
    const targetCand1 = disc1.candidates[0];
    const stageRes = await client.callTool({
      name: 'stage_approved_references',
      arguments: {
        proceed_without_references: false,
        selections: [
          {
            ref_id: targetCand1.candidate_id,
            selected_attributes: ['composition', 'typography'],
          },
        ],
      },
    });
    assert.equal(stageRes.isError, undefined);
    assert.equal(stageRes.structuredContent.status, 'staged');
    assert.equal(stageRes.structuredContent.staged_references.length, 1);
    assert.equal(stageRes.structuredContent.staged_references[0].ref_id, targetCand1.candidate_id);
    assert.equal(stageRes.structuredContent.staged_references[0].origin_url, targetCand1.origin_url);
    assert.ok(
      fetchedUrls.some((u) => u.includes('/736x/real_')),
      'stage_approved_references must download the real provider media_url from Discovery #1',
    );

    // --- FIX 3: Unified embedding coordinate space across query, candidates, feedback, and long-term taste ---
    // Record positive feedback on Discovery #1 candidate 0 and negative style_mismatch on glassmorphism
    const fbPos = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        event_id: 'fixes-positive',
        candidate_id: targetCand1.candidate_id,
        board: targetCand1.board,
        metadata_sid: targetCand1.metadata_sid,
        action: 'locked_as_reference',
        dwell_time_ms: 5100,
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(fbPos.isError, undefined);

    const fbNeg = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        event_id: 'fixes-negative',
        candidate_id: disc1.candidates[1].candidate_id,
        board: disc1.candidates[1].board,
        metadata_sid: disc1.candidates[1].metadata_sid,
        action: 'style_mismatch',
        dwell_time_ms: 600,
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(fbNeg.isError, undefined);
    assert.equal(fbNeg.structuredContent.compaction_triggered, true);

    const userMem = memoryStore.getOrCreateUser('user_fixes');
    assert.equal(
      userMem.embedding_space,
      'openai_text_embedding_3_small',
      'User memory must track the active OpenAI embedding space',
    );
    assert.equal(userMem.pos_session_vecs.length, 1);
    assert.equal(userMem.neg_session_vecs.length, 1);
    assert.equal(userMem.long_term_vec, null, 'Feedback efêmero não deve consolidar perfil');

    // In our mock OpenAI basis, component [0] is ~0.95 (after L2 norm > 0.85),
    // verifying that feedback and long-term vectors were embedded via OpenAI and NOT local SHA-256!
    assert.ok(
      userMem.pos_session_vecs[0][0] > 0.85,
      'Positive feedback vector must be in the OpenAI embedding coordinate space',
    );
    assert.ok(
      userMem.neg_session_vecs[0][0] > 0.85,
      'Negative feedback vector must be in the OpenAI embedding coordinate space',
    );


    // --- FIX 4: Hard SID exclusion filter blocks rejected SID prefixes before ranking/selection ---
    // Direct unit check on filter_excluded_sid_candidates and matches_excluded_sid
    assert.equal(
      matches_excluded_sid(
        ['carousel_editorial_4:5', 'glassmorphism_ui', 'bold_display_hook', 'dark_tech_saas'],
        ['carousel_editorial_4:5/glassmorphism_ui'],
      ),
      true,
    );
    assert.equal(
      matches_excluded_sid(
        ['carousel_editorial_4:5', 'swiss_grid', 'bold_display_hook', 'tactile_paper_texture'],
        ['carousel_editorial_4:5/glassmorphism_ui'],
      ),
      false,
    );
    const filteredUnit = filter_excluded_sid_candidates(
      [
        {
          candidate_id: 'blocked_1',
          metadata_sid: ['carousel_editorial_4:5', 'glassmorphism_ui', 'bold_display_hook', 'dark_tech_saas'],
        },
        {
          candidate_id: 'blocked_2',
          metadata_sid: ['carousel_editorial_4:5', 'glassmorphism_ui', 'minimal_whitespace', 'dark_tech_saas'],
        },
        {
          candidate_id: 'allowed_1',
          metadata_sid: ['carousel_editorial_4:5', 'swiss_grid', 'bold_display_hook', 'tactile_paper_texture'],
        },
      ],
      ['carousel_editorial_4:5/glassmorphism_ui'],
    );
    assert.deepEqual(
      filteredUnit.map((c) => c.candidate_id),
      ['allowed_1'],
      'All candidates matching excluded SID prefix must be removed before ranking',
    );

    // Rejeição bloqueia imediatamente a origem exata, sem inferir rejeição de todo o estilo.
    const rejectedOrigin = disc1.candidates[1].origin_url;
    const discAfterRejectRes = await client.callTool({
      name: 'discover_visual_references',
      arguments: {
        briefing: 'Carrossel editorial sobre arquitetura limpa',
        target_format: 'carousel_editorial_4:5', client_mode: 'web',
        consent_external_search: true, consent_model: true,
      },
    });
    assert.equal(discAfterRejectRes.isError, undefined);
    const discAfterReject = webDiscoveryResponseSchema.parse(discAfterRejectRes.structuredContent);
    assert.ok(discAfterReject.candidates.every(c => c.origin_url !== rejectedOrigin));
    assert.deepEqual(userMem.user_taste.negative_constraints, []);
  } finally {
    await client.close();
    await server.close();
  }
});

test('Phoenix exige autorizações separadas, conta exposições, deduplica feedback e recusa fallback silencioso', async () => {
  const hp = createPhoenixHyperparams();
  const memoryStore = new PhoenixMemoryStore({ hp });
  let searches = 0;
  let modelCalls = 0;
  const provider = {
    sourceId: 'pinterest_curated_design', accessMethod: 'curated_board_http',
    async searchMetadataOnly({ source }) {
      searches++;
      const board = source.allowed_boards_or_queries[0];
      return [{ source_id: 'pinterest_curated_design', raw_title: 'Referência teste', raw_caption: 'grid',
        origin_url: `https://www.pinterest.com/pin/${encodeURIComponent(board)}`,
        preview_url: `https://i.pinimg.com/236x/${encodeURIComponent(board)}.jpg`,
        media_url: `https://i.pinimg.com/736x/${encodeURIComponent(board)}.jpg`,
        aspect_rationale: { composition: 'grid' }, thumbnail_base64: null, thumbnail_mime_type: null }];
    },
  };
  const service = new PhoenixDecisionApiService({ hp, subagentRunner: () => { modelCalls++; return null; } });
  const server = createComporServer({ phoenixActorId: 'actor-test', phoenixMemoryStore: memoryStore,
    phoenixDecisionService: service, providers: new Map([['pinterest_curated_design', provider]]) });
  const client = new Client({ name: 'phoenix-consents', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
    const base = { briefing: 'grid', target_format: 'single_feed', client_mode: 'web', decision_fallback_mode: 'deterministic_mock' };
    const blocked = await client.callTool({ name: 'discover_visual_references', arguments: base });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.structuredContent.code, 'consent_required');
    assert.equal(searches, 0); assert.equal(modelCalls, 0);

    const remoteBlocked = await client.callTool({ name: 'discover_visual_references', arguments: {
      ...base, client_mode: 'codex', decision_fallback_mode: 'luna_subagent', consent_external_search: true,
    } });
    assert.equal(remoteBlocked.isError, true);
    assert.equal(remoteBlocked.structuredContent.code, 'model_consent_required');
    assert.equal(searches, 0); assert.equal(modelCalls, 0);

    const found = await client.callTool({ name: 'discover_visual_references', arguments: { ...base, consent_external_search: true } });
    assert.equal(found.isError, undefined);
    const result = webDiscoveryResponseSchema.parse(found.structuredContent);
    assert.equal(result.candidate_origin, 'provider');
    assert.equal(result.decision_engine_source, 'deterministic_mock');
    assert.equal(result.can_proceed_without_references, true);
    const candidate = result.candidates[0];
    assert.ok(candidate);
    assert.equal(candidate.origin_kind, 'provider');
    const priorImpressions = memoryStore.getOrCreateUser('actor-test').board_bandit.get(candidate.board).total_impressions;
    assert.ok(priorImpressions >= 1);
    const feedback = { event_id: 'evt-1', candidate_id: candidate.candidate_id, board: candidate.board,
      metadata_sid: candidate.metadata_sid, action: 'discard_generic', client_mode: 'web' };
    const first = await client.callTool({ name: 'record_visual_feedback', arguments: feedback });
    const duplicate = await client.callTool({ name: 'record_visual_feedback', arguments: feedback });
    assert.equal(first.isError, undefined);
    assert.equal(duplicate.structuredContent.duplicate, true);
    assert.equal(memoryStore.getOrCreateUser('actor-test').session_events.length, 1);
    assert.equal(memoryStore.getOrCreateUser('actor-test').board_bandit.get(candidate.board).total_impressions, priorImpressions);
    const conflicting = await client.callTool({ name: 'record_visual_feedback', arguments: { ...feedback, action: 'locked_as_reference' } });
    assert.equal(conflicting.isError, true);
    const forged = await client.callTool({ name: 'record_visual_feedback', arguments: { ...feedback, event_id: 'evt-2', board: 'fake/board' } });
    assert.equal(forged.isError, true);
    const retried = await client.callTool({ name: 'discover_visual_references', arguments: { ...base, consent_external_search: true } });
    assert.ok(retried.structuredContent.candidates.every(c => c.origin_url !== candidate.origin_url));
    assert.deepEqual(memoryStore.getOrCreateUser('actor-test').user_taste.negative_constraints, []);
    assert.equal(memoryStore.getOrCreateUser('actor-test').long_term_vec, null);

    const modelFailed = await client.callTool({ name: 'discover_visual_references', arguments: {
      ...base, client_mode: 'codex', decision_fallback_mode: 'luna_subagent', consent_external_search: true, consent_model: true,
    } });
    assert.equal(modelFailed.isError, true);
    assert.match(modelFailed.content[0].text, /indisponível|inválida/);
    assert.equal(modelCalls, 1);
  } finally { await client.close(); await server.close(); }
});

test('Diversidade não aumenta nota negativa de candidato repetido', () => {
  const hp = createPhoenixHyperparams({ sid_diversity_decay_factor: 0.5 });
  const ranked = apply_sid_diversity_decay([
    { candidate_id: 'a', metadata_sid: ['same', 'same'], raw_score: -1 },
    { candidate_id: 'b', metadata_sid: ['same', 'same'], raw_score: -2 },
  ], hp);
  const repeated = ranked.find(c => c.candidate_id === 'b');
  assert.ok(repeated.final_score < repeated.raw_score);
});

test('Modo sintético é explícito, offline e não pode ser materializado como referência real', async () => {
  const server = createComporServer();
  const client = new Client({ name: 'phoenix-mock', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
    const response = await client.callTool({ name: 'discover_visual_references', arguments: {
      briefing: 'exemplo sintético', target_format: 'single_feed', client_mode: 'web', decision_fallback_mode: 'deterministic_mock',
    } });
    assert.equal(response.isError, undefined);
    const result = webDiscoveryResponseSchema.parse(response.structuredContent);
    assert.equal(result.candidate_origin, 'synthetic');
    assert.equal(result.telemetry.board_html_path, null);
    assert.ok(result.candidates.length > 0);
    assert.ok(result.candidates.every(c => c.origin_kind === 'synthetic' && c.preview_url.startsWith('synthetic:')));
    const staged = await client.callTool({ name: 'stage_approved_references', arguments: {
      proceed_without_references: false, selections: [{ ref_id: result.candidates[0].candidate_id, selected_attributes: ['composition'] }],
    } });
    assert.equal(staged.isError, true);
  } finally { await client.close(); await server.close(); }
});

test('Escolha explícita de Luna não é substituída por chave do servidor', () => {
  const hp = createPhoenixHyperparams();
  const service = new PhoenixDecisionApiService({ hp, apiKey: 'server-only-test-key' });
  assert.equal(service.resolveExecutionStrategy({ client_mode: 'codex', fallback_mode: 'luna_subagent' }).source, 'codex_luna_subagent');
  assert.equal(service.resolveExecutionStrategy({ client_mode: 'web', fallback_mode: 'luna_subagent' }).source, 'codex_luna_subagent');
  assert.equal(service.resolveExecutionStrategy({ client_mode: 'codex', fallback_mode: 'require_key' }).source, 'openai_api');
});

test('6. Format-independent SID mechanics, per-board catalog source resolution, and User Tower similarity in non-mock selection', async () => {
  // 1. Format-independent SID mechanics & aesthetics
  const glassSid = inferCandidateSid({
    target_format: 'carousel_editorial_4:5',
    board: 'behance/interaction-design',
    description: 'Glassmorphism UI with translucent cards',
  });
  assert.equal(glassSid[0], 'carousel_editorial_4:5');
  assert.equal(glassSid[1], 'glassmorphism_ui');
  assert.notEqual(glassSid[1], 'swiss_grid');
  assert.equal(glassSid[3], 'dark_tech_saas');
  assert.notEqual(glassSid[3], 'tactile_paper_texture');

  const seamlessSid = inferCandidateSid({
    target_format: 'carousel_editorial_4:5',
    board: 'latermedia/instagram-post-design',
    description: 'Seamless split layout with bold typography',
  });
  assert.equal(seamlessSid[1], 'seamless_split');

  const flowSid = inferCandidateSid({
    target_format: 'carousel_editorial_4:5',
    board: 'canva/canva-cheatsheets',
    description: 'Flowchart comparison diagram with clean minimal whitespace',
  });
  assert.equal(flowSid[1], 'flowchart_comparison');

  // 2. Per-board catalog source resolution (pinterest_curated_design + pinterest_curated_photography)
  // and 3. User Tower similarity applied in non-mock candidate selection
  const hp = createPhoenixHyperparams({ alpha_query_weight: 5.0 });
  const memoryStore = new PhoenixMemoryStore({ hp });

  const designBoardsQueried = [];
  const photoBoardsQueried = [];

  const designProvider = {
    sourceId: 'pinterest_curated_design',
    accessMethod: 'curated_board_http',
    async searchMetadataOnly({ source }) {
      const board = source.allowed_boards_or_queries[0];
      designBoardsQueried.push(board);
      return [
        {
          source_id: 'pinterest_curated_design',
          raw_title: 'Design Reference',
          raw_caption: 'Swiss grid editorial layout',
          origin_url: `https://www.pinterest.com/pin/design_${encodeURIComponent(board)}/`,
          preview_url: `https://i.pinimg.com/236x/design_${encodeURIComponent(board)}.jpg`,
          media_url: `https://i.pinimg.com/736x/design_${encodeURIComponent(board)}.jpg`,
          aspect_rationale: { composition: 'swiss grid' },
          thumbnail_base64: null,
          thumbnail_mime_type: null,
        },
      ];
    },
  };

  const photoProvider = {
    sourceId: 'pinterest_curated_photography',
    accessMethod: 'curated_board_http',
    async searchMetadataOnly({ source }) {
      const board = source.allowed_boards_or_queries[0];
      photoBoardsQueried.push(board);
      return [
        {
          source_id: 'pinterest_curated_photography',
          raw_title: 'Photography Reference',
          raw_caption: 'Editorial portrait photography with dramatic lighting',
          origin_url: `https://www.pinterest.com/pin/photo_${encodeURIComponent(board)}/`,
          preview_url: `https://i.pinimg.com/236x/photo_${encodeURIComponent(board)}.jpg`,
          media_url: `https://i.pinimg.com/736x/photo_${encodeURIComponent(board)}.jpg`,
          aspect_rationale: { photography: 'dramatic portrait lighting' },
          thumbnail_base64: null,
          thumbnail_mime_type: null,
        },
      ];
    },
  };

  const rankerPrompts = [];
  const makeTargetedVec = (text) => {
    const raw = new Array(hp.embedding_dimension).fill(0);
    const lower = String(text).toLowerCase();
    // Query and photography candidate share axis 0; design candidate sits on orthogonal/opposite axis 1
    if (lower.includes('portrait') || lower.includes('photography') || lower.includes('retrato')) {
      raw[0] = 1.0;
      raw[1] = 0.0;
    } else {
      raw[0] = -0.5;
      raw[1] = 0.866;
    }
    return l2_normalize(raw);
  };

  const mockOpenAiClient = {
    embeddings: {
      async create({ input }) {
        const list = Array.isArray(input) ? input : [input];
        return {
          data: list.map((item) => ({
            embedding: makeTargetedVec(item),
          })),
        };
      },
    },
    responses: {
      async create({ input, text }) {
        const schemaName = text?.format?.name;
        if (schemaName === 'phoenix_board_router_decision') {
          return {
            output_text: JSON.stringify({
              board_allocations: [
                {
                  board: 'behance/typography',
                  role: 'hook_cover',
                  weight: 0.4,
                  synthetic_query: 'Tipografia para capa',
                  rationale: 'Gancho tipográfico.',
                },
                {
                  board: 'behance/photography',
                  role: 'conversion_cta',
                  weight: 0.4,
                  synthetic_query: 'Portrait photography direction',
                  rationale: 'Fotografia autoral de retrato.',
                },
                {
                  board: 'behance/feed',
                  role: 'wildcard_exploration',
                  weight: 0.2,
                  synthetic_query: 'Editorial photography exploration',
                  rationale: 'Exploração out-of-network.',
                },
              ],
              required_sid_tags: ['carousel_editorial_4:5'],
              excluded_sid_tags: [],
            }),
          };
        }
        if (schemaName === 'phoenix_isolated_candidate_action_probs') {
          rankerPrompts.push(JSON.stringify(input));
          // Return identical action probabilities for every candidate so only User Tower similarity differentiates them
          return {
            output_text: JSON.stringify({
              p_use_as_layout_grid: 0.7,
              p_use_as_typography_hook: 0.7,
              p_use_color_and_vibe: 0.7,
              p_high_conversion_clarity: 0.7,
              p_dwell_engagement: 0.7,
              p_reject_too_generic: 0.1,
              p_reject_style_mismatch: 0.05,
              composition_guideline: 'Direção consistente.',
            }),
          };
        }
        throw new Error(`Unexpected schema: ${schemaName}`);
      },
    },
  };

  const decisionService = new PhoenixDecisionApiService({
    hp,
    forceDeterministicMock: false,
    apiKey: 'sk-test-per-board-and-usertower',
    openaiClient: mockOpenAiClient,
  });

  const server = createComporServer({
    phoenixActorId: 'user_multiboard',
    phoenixHyperparams: hp,
    phoenixMemoryStore: memoryStore,
    phoenixDecisionService: decisionService,
    providers: new Map([
      ['pinterest_curated_design', designProvider],
      ['pinterest_curated_photography', photoProvider],
    ]),
  });

  const client = new Client({ name: 'phoenix-multiboard-test', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  try {
    const res = await client.callTool({
      name: 'discover_visual_references',
      arguments: {
        briefing: 'Ensaio de retrato portrait photography editorial',
        target_format: 'carousel_editorial_4:5',
        client_mode: 'web',
        consent_external_search: true,
        consent_model: true,
      },
    });
    assert.equal(res.isError, undefined);
    const parsed = webDiscoveryResponseSchema.parse(res.structuredContent);

    // Fix 2 assertions: both pinterest_curated_design and pinterest_curated_photography boards were resolved and queried
    assert.deepEqual(designBoardsQueried, ['behance/typography']);
    assert.deepEqual(photoBoardsQueried, ['behance/photography', 'behance/feed']);
    assert.ok(
      parsed.candidates.some((c) => c.source_id === 'pinterest_curated_photography' && c.board === 'behance/photography'),
      'Expected behance/photography from pinterest_curated_photography to be retrieved',
    );
    assert.ok(
      parsed.candidates.some((c) => c.source_id === 'pinterest_curated_photography' && c.board === 'behance/feed'),
      'Expected behance/feed from pinterest_curated_photography to be retrieved',
    );

    // Fix 3 assertions: ranker prompt includes User Tower cosine similarity and raw_score reflects Two-Tower similarity
    assert.ok(rankerPrompts.length >= 3);
    assert.ok(
      rankerPrompts.every((p) => p.includes('Similaridade Vetorial Two-Tower (User Tower):')),
      'Ranker prompt must include the User Tower cosine similarity',
    );

    const photoCand = parsed.candidates.find((c) => c.board === 'behance/photography');
    const designCand = parsed.candidates.find((c) => c.board === 'behance/typography');
    assert.ok(photoCand && designCand);
    assert.ok(
      photoCand.user_tower_cosine_similarity > designCand.user_tower_cosine_similarity,
      'Photography candidate must have higher User Tower cosine similarity for portrait photography query',
    );
    assert.ok(
      photoCand.raw_score > designCand.raw_score,
      `Expected User Tower similarity to increase raw_score even when LLM action_probs are identical (${photoCand.raw_score} > ${designCand.raw_score})`,
    );
    assert.equal(
      parsed.candidates[0].board,
      'behance/photography',
      'Candidate with highest User Tower similarity must rank first when LLM action_probs are tied',
    );
  } finally {
    await client.close();
    await server.close();
  }
});

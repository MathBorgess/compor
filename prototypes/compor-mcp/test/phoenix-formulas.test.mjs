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
  format_mcp_response,
  l2_normalize,
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
      return null;
    },
  });

  const server = createComporServer({
    phoenixHyperparams: hp,
    phoenixMemoryStore: memoryStore,
    phoenixDecisionService: decisionService,
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
          user_id: 'matheus_dev',
          client_mode: 'codex',
        },
      });

      assert.equal(codexRes.isError, undefined);
      const codexMarkdown = codexRes.content[0].text;
      assert.equal(typeof codexMarkdown, 'string');
      assert.match(codexMarkdown, /Phoenix Visual Decision Engine/);
      assert.match(codexMarkdown, /Staging Local:/);
      assert.match(codexMarkdown, /SIDs:/);
      assert.match(codexMarkdown, /gpt-6-luna/);
      // Must NOT contain raw external URLs or tracking parameters
      assert.doesNotMatch(codexMarkdown, /https?:\/\//i);
      assert.doesNotMatch(codexMarkdown, /utm_/i);
      assert.ok(lunaCalls >= 1, 'Expected subagent Luna runner to be invoked in codex mode without OPENAI_API_KEY');

      // 4b. Test decision_fallback_mode="require_key" asking user for OPENAI_API_KEY
      const askKeyRes = await client.callTool({
        name: 'discover_visual_references',
        arguments: {
          briefing: 'Post de anúncio de curso',
          target_format: 'ad_performance_4:5',
          user_id: 'matheus_dev',
          client_mode: 'codex',
          decision_fallback_mode: 'require_key',
        },
      });
      assert.equal(askKeyRes.structuredContent.status, 'requires_api_key');
      assert.match(askKeyRes.content[0].text, /openai_api_key/);
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
        user_id: 'matheus_dev',
        client_mode: 'web',
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
    assert.doesNotMatch(directCodex, /https?:\/\//i);

    const directWeb = format_mcp_response(parsedWeb, 'web');
    assert.deepEqual(directWeb, parsedWeb);

    // 4d. Test record_visual_feedback & automatic compaction after 2 events (memory_compaction_threshold = 2)
    const firstCand = parsedWeb.candidates[0];
    const fb1 = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        user_id: 'matheus_dev',
        candidate_id: firstCand.candidate_id,
        board: firstCand.board,
        metadata_sid: firstCand.metadata_sid,
        action: 'locked_as_reference',
        dwell_time_ms: 4200,
        client_mode: 'web',
      },
    });
    assert.equal(fb1.isError, undefined);
    assert.equal(fb1.structuredContent.positive_session_count, 1);
    assert.equal(fb1.structuredContent.compaction_triggered, false);
    assert.ok(fb1.structuredContent.board_affinity.affinity_score > 0.5);

    const secondCand = parsedWeb.candidates[1];
    const fb2 = await client.callTool({
      name: 'record_visual_feedback',
      arguments: {
        user_id: 'matheus_dev',
        candidate_id: secondCand.candidate_id,
        board: secondCand.board,
        metadata_sid: ['carousel_editorial_4:5', 'glassmorphism_ui', 'kinetic_retro_type', 'neo_brutalist_bold'],
        action: 'style_mismatch',
        dwell_time_ms: 800,
        client_mode: 'codex',
      },
    });
    assert.equal(fb2.isError, undefined);
    assert.equal(fb2.structuredContent.negative_session_count, 1);
    assert.equal(fb2.structuredContent.compaction_triggered, true);
    assert.ok(
      fb2.structuredContent.negative_constraints.includes(
        'carousel_editorial_4:5/glassmorphism_ui',
      ),
    );
  } finally {
    await client.close();
    await server.close();
  }
});

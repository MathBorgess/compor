import test from 'node:test';
import assert from 'node:assert/strict';
import { inferEvidenceBasedSid, UNKNOWN_SID_LEVELS, inferCandidateSid } from '../dist/phoenix_engine/domain/catalog.js';
import { distillBriefingIntent, projectRoleSyntheticQuery, PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { apply_sid_diversity_decay } from '../dist/phoenix_engine/math/formulas.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { buildCandidateEmbeddingText } from '../dist/phoenix_engine/mcp/dual_adapter.js';
import { formatRankerIsolatedCandidateSuffix } from '../dist/phoenix_engine/prompts/decision_prompts.js';

test('neutral and reordered real metadata do not manufacture SID categories', () => {
  const metadata = { description: 'Romantic Florist Instagram Template by And Done Studio' };
  const oldAt3 = inferCandidateSid({ ...metadata, target_format:'instagram_post', board:'creativemarket/social-media-templates', index:3 });
  const oldAt5 = inferCandidateSid({ ...metadata, target_format:'instagram_post', board:'creativemarket/social-media-templates', index:5 });
  assert.notDeepEqual(oldAt3,oldAt5,'the old index-based heuristic exhibits the defect');
  assert.deepEqual(inferEvidenceBasedSid(metadata), [...UNKNOWN_SID_LEVELS]);
  assert.deepEqual(inferEvidenceBasedSid({ ...metadata, index:3 }), inferEvidenceBasedSid({ ...metadata, index:5 }));
  assert.deepEqual(inferEvidenceBasedSid({ description:'Texto sem atributos visuais', target_format:'instagram_post' }), [...UNKNOWN_SID_LEVELS]);
});

test('explicit positive SID terminology is preserved, denied or ambiguous claims stay unknown', () => {
  const data = inferEvidenceBasedSid({ description:'Swiss grid, bold display hook e tactile paper texture', target_format:'carousel_editorial_4:5' });
  assert.deepEqual(data, ['carousel_editorial_4:5','swiss_grid','bold_display_hook','tactile_paper_texture']);
  assert.equal(inferEvidenceBasedSid({description:'Sem glassmorphism; foto de um copo de vidro'} )[1],UNKNOWN_SID_LEVELS[1]);
  assert.equal(inferEvidenceBasedSid({description:'Swiss grid e bento grid'} )[1],UNKNOWN_SID_LEVELS[1]);
  assert.notEqual(inferCandidateSid({target_format:'instagram_post',board:'example',description:'comunidade e criatividade'} )[0],'ad_performance_4:5');
});

test('unknown intent is omitted from queries and unknown diversity is not a fabricated cluster', () => {
  const d=distillBriefingIntent({briefing:'Ideia de curso sobre cerâmica para a comunidade.',target_format:'instagram_post'});
  assert.deepEqual(d.inferred_sid,[...UNKNOWN_SID_LEVELS]);
  assert.ok(!d.matched_catalog_keywords.includes('ad'));
  const q=projectRoleSyntheticQuery({distilled:d,board:'behance/typography',role:'hook_cover',target_format:'instagram_post'});
  assert.doesNotMatch(q,/sid_unknown|swiss_grid|dark_tech_saas/);
  const result=apply_sid_diversity_decay([{candidate_id:'a',raw_score:10,metadata_sid:[...UNKNOWN_SID_LEVELS]},{candidate_id:'b',raw_score:9,metadata_sid:[...UNKNOWN_SID_LEVELS]}],createPhoenixHyperparams());
  assert.deepEqual(result.map(c=>c.final_score),[10,9]);
  assert.deepEqual(result.map(c=>c.diversity_multiplier),[1,1]);
  assert.doesNotMatch(buildCandidateEmbeddingText({board:'board',metadata_sid:UNKNOWN_SID_LEVELS,visual_description:'dados'}),/sid_unknown/);
  assert.doesNotMatch(formatRankerIsolatedCandidateSuffix({candidate_id:'id',board:'board',metadata_sid:UNKNOWN_SID_LEVELS,visual_description:'dados'}),/sid_unknown/);
});

test('an ordinary Portuguese word cannot switch deterministic router to ad mode', async () => {
  const hp=createPhoenixHyperparams(), service=new PhoenixDecisionApiService({hp,forceDeterministicMock:true});
  const taste={user_id:'test',preferred_boards_by_goal:{},visual_dna_rules:[],negative_constraints:[],updated_at:new Date().toISOString()};
  const result=await service.routeBoards({user_id:'test',briefing:'Uma ideia para a comunidade',target_format:'instagram_post',user_taste:taste,board_affinities:[],board_affinity_table:'',session_events_summary:'',source:'deterministic_mock'});
  assert.ok(!result.required_sid_tags.some(s=>s.startsWith('sid_unknown_')));
  assert.ok(result.board_allocations.every(a=>!a.synthetic_query.includes('sid_unknown_')));
  assert.ok(result.board_allocations.some(a=>a.role==='structural_grid'));
});

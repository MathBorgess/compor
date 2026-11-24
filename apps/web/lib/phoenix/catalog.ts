// Adapted from the Compor Phoenix prototype; see PROVENANCE.md and ADR-0019.
import * as z from '../schema.ts';

/** Static catalog vocabulary for synthetic exploration; no source is fetched or verified here. */
export const SPECIALIZED_ADS_BOARDS = [
  'behance/advertising',
  'kittldesign/ads-designs',
  'creativemarket/social-media-templates',
  'behance/branding-packaging',
  'weandthecolor/packaging-design',
  'thedieline/promotional-packaging',
  '99designs/packaging-label-design',
] as const;

export const SPECIALIZED_CAROUSEL_BOARDS = [
  'behance/typography',
  'weandthecolor/typography',
  'creativemarket/magazine-templates',
  'weandthecolor/templates',
  'kittldesign/poster-design',
  'kittldesign/social-media-designs',
  'kittldesign/quote-typography-lettering-design',
  'latermedia/instagram-post-design',
  'canva/design-inspiration',
  'canva/canva-template-collections',
  'dribbble/design-inspiration',
  'adobe/whats-your-type',
] as const;

export const SPECIALIZED_STORIES_BOARDS = [
  'latermedia/instagram-stories',
  'latermedia/instagram-story-templates',
  'latermedia/instagram-story-tips',
  'latermedia/instagram-reels',
  'dribbble/uiux-inspiration',
  'behance/interaction-design',
  'weandthecolor/ui-screen-web-design',
  'adobe/web-mobile',
] as const;

export const SPECIALIZED_LINKEDIN_BOARDS = [
  'hubspot/marketing-infographics',
  'hubspot/inbound-hub-marketing',
  'hubspot/templates-tools',
  'venngage/free-infographic-template',
  'venngage/infographic-design',
  'vismeapp/business-infographics',
  'vismeapp/charts-and-graphs-design-inspiration-education',
  'vismeapp/presentations',
  'piktochart/best-of-piktochart-infographics',
  'piktochart/business-innovation-technology-infographics',
  'piktochart/slide-templates',
  'latermedia/linkedin-strategies-tips',
  'canva/canva-cheatsheets',
  'adobe/data-creativity',
] as const;

export const SPECIALIZED_GENERAL_BOARDS = [
  'behance/graphic-design',
  'weandthecolor/graphic-design',
  'adobe/graphic-design',
  'behance/photography',
  'adobe/art-photography',
  'behance/illustration',
  'weandthecolor/illustration',
] as const;

export const EXPLORATION_FEED_BOARDS = [
  'canva/feed',
  'venngage/feed',
  'vismeapp/feed',
  'piktochart/feed',
  'creativemarket/feed',
  'weandthecolor/feed',
  'thedieline/feed',
  'dribbble/feed',
  '99designs/feed',
  'kittldesign/feed',
  'latermedia/feed',
  'adobe/feed',
  'hubspot/feed',
  'envato/feed',
  'behance/feed',
] as const;

export const CURATED_SOCIAL_POST_BOARDS = [
  'canva/templates-spotlight',
  'canva/design-trends-2026',
  'planoly/templates',
  'planoly/instagram-tips',
  'planoly/social-media-tips',
  'planoly/design-inspiration',
  'planoly/inspiring-quotes',
  'latermedia/instagram-tips-for-small-businesses',
  'latermedia/small-business-marketing-on-social-media',
  'latermedia/creators-influencers',
  'sproutsocial/creative-inspiration',
  'sproutsocial/brand-inspiration',
  'hootsuite/socially-inspired',
  'hubspot/how-to-use-instagram-for-marketing',
  'hubspot/all-things-social-media',
  'piktochart/social-media-infographics',
  'piktochart/advertising-infographics',
  'vismeapp/advertising-design-from-around-the-world-inspirati',
  'vismeapp/artistic-infographics-design-inspiration',
  'vistacreate/black-friday-designs',
  'vistacreate/beauty',
  'vistacreate/back-to-school-templates',
  'venngage/top-editable-flyer-templates',
  'venngage/poster-templates',
  'kittldesign/card-design',
  'kittldesign/retro-style-designs',
  'kittldesign/product-label-designs',
  'creativemarket/trends',
  'creativemarket/mockups',
  'thedieline/food-packaging',
  'thedieline/beauty-health-packaging',
  'thedieline/beverage-packaging',
  'thedieline/sustainable-packaging',
  'dribbble/branding-inspiration',
  'dribbble/poster-inspiration',
  'dribbble/illustration-inspiration',
  'behance/fashion-design',
  'behance/best-of-behance',
  'itsnicethat/photography',
  'itsnicethat/graphic-design',
  'itsnicethat/fashion',
  'abduzeedo/grid',
  'abduzeedo/minimalistical',
  'envato/color-psychology',
] as const;

export const CANONICAL_BOARD_SLUGS = [
  ...SPECIALIZED_ADS_BOARDS,
  ...SPECIALIZED_CAROUSEL_BOARDS,
  ...SPECIALIZED_STORIES_BOARDS,
  ...SPECIALIZED_LINKEDIN_BOARDS,
  ...SPECIALIZED_GENERAL_BOARDS,
  ...CURATED_SOCIAL_POST_BOARDS,
  ...EXPLORATION_FEED_BOARDS,
] as const;

export type BoardSlug = (typeof CANONICAL_BOARD_SLUGS)[number];

export const boardSlugSchema = z.enum(CANONICAL_BOARD_SLUGS);

export const COMPOSITIONAL_ROLES = [
  'hook_cover',
  'structural_grid',
  'ui_component',
  'conversion_cta',
  'wildcard_exploration',
] as const;

export type CompositionalRole = (typeof COMPOSITIONAL_ROLES)[number];

export const compositionalRoleSchema = z.enum(COMPOSITIONAL_ROLES);

export const ROLE_RECOMMENDED_BOARDS: Record<CompositionalRole, readonly BoardSlug[]> = {
  hook_cover: [
    'behance/typography',
    'weandthecolor/typography',
    'kittldesign/poster-design',
    'kittldesign/quote-typography-lettering-design',
    'behance/advertising',
    'adobe/whats-your-type',
  ],
  structural_grid: [
    'creativemarket/magazine-templates',
    'weandthecolor/templates',
    'hubspot/marketing-infographics',
    'venngage/infographic-design',
    'vismeapp/business-infographics',
    'piktochart/best-of-piktochart-infographics',
    'canva/canva-cheatsheets',
  ],
  ui_component: [
    'dribbble/design-inspiration',
    'dribbble/uiux-inspiration',
    'behance/interaction-design',
    'weandthecolor/ui-screen-web-design',
    'latermedia/instagram-stories',
    'adobe/web-mobile',
  ],
  conversion_cta: [
    'kittldesign/ads-designs',
    'creativemarket/social-media-templates',
    'thedieline/promotional-packaging',
    'behance/branding-packaging',
    'weandthecolor/packaging-design',
    '99designs/packaging-label-design',
  ],
  wildcard_exploration: EXPLORATION_FEED_BOARDS,
};

/**
 * Taxonomia de 4 Níveis (Semantic IDs / SIDs)
 */
export const SID_TAXONOMY = {
  level_1_format: [
    'ad_conversion_1:1',
    'ad_performance_4:5',
    'carousel_editorial_4:5',
    'story_interactive_9:16',
    'linkedin_framework_pdf',
    'linkedin_infographic',
  ],
  level_2_mechanic: [
    'swiss_grid',
    'bento_grid',
    'seamless_split',
    'glassmorphism_ui',
    'flowchart_comparison',
    'hero_product_d2c',
    'social_proof_card',
    'step_by_step_cheatsheet',
  ],
  level_3_hierarchy: [
    'bold_display_hook',
    'kinetic_retro_type',
    'high_density_data',
    'minimal_whitespace',
    'high_contrast_cta',
    'editorial_multicolumn',
  ],
  level_4_aesthetic: [
    'dark_tech_saas',
    'tactile_paper_texture',
    'vibrant_retail_promo',
    'executive_clean_b2b',
    'luxury_cosmetic_d2c',
    'neo_brutalist_bold',
  ],
} as const;

export type SidLevel1Format = (typeof SID_TAXONOMY.level_1_format)[number];
export type SidLevel2Mechanic = (typeof SID_TAXONOMY.level_2_mechanic)[number];
export type SidLevel3Hierarchy = (typeof SID_TAXONOMY.level_3_hierarchy)[number];
export type SidLevel4Aesthetic = (typeof SID_TAXONOMY.level_4_aesthetic)[number];

/** Missing evidence is not a visual category. These markers must not be used as diversity clusters. */
export const UNKNOWN_SID_LEVELS = ['sid_unknown_format', 'sid_unknown_mechanic', 'sid_unknown_hierarchy', 'sid_unknown_aesthetic'] as const;
export type EvidenceSid = [SidLevel1Format | typeof UNKNOWN_SID_LEVELS[0], SidLevel2Mechanic | typeof UNKNOWN_SID_LEVELS[1], SidLevel3Hierarchy | typeof UNKNOWN_SID_LEVELS[2], SidLevel4Aesthetic | typeof UNKNOWN_SID_LEVELS[3]];

/**
 * Extract only labels explicitly mentioned in text. The text can itself be
 * wrong or untrusted; these labels are claims, never visual verification.
 * Target format is used only for intent, never to classify a retrieved image.
 */
export function inferEvidenceBasedSid(params: { description: string; target_format?: string }): EvidenceSid {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const desc = normalize(params.description);
  const explicit = (phrase: string) => {
    const normalized = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${normalized}(?=$|[^a-z0-9])`, 'g');
    for (const match of desc.matchAll(re)) {
      const start = (match.index ?? 0) + match[1]!.length;
      const before = desc.slice(Math.max(0, start - 35), start);
      if (!/\b(?:sem|nao|evitar|evite|no|not|avoid)\s+(?:[a-z0-9]+\s+){0,3}$/.test(before)) return true;
    }
    return false;
  };
  const find = <T extends string>(values: readonly T[], aliases: Partial<Record<T, readonly string[]>>, unknown: string): T | string => {
    const hits = values.filter(value => [value, ...(aliases[value] ?? [])].some(explicit));
    // Contradictory or multiple categories cannot be collapsed to one choice.
    return hits.length === 1 ? hits[0]! : unknown;
  };
  const target = normalize(params.target_format ?? '');
  const fmt = target
    ? SID_TAXONOMY.level_1_format.find(value => normalize(value) === target) ?? UNKNOWN_SID_LEVELS[0]
    : find(SID_TAXONOMY.level_1_format, {}, UNKNOWN_SID_LEVELS[0]);
  const mechanic = find(SID_TAXONOMY.level_2_mechanic, { swiss_grid:['swiss grid','grid suico'], bento_grid:['bento grid'], seamless_split:['seamless split'], glassmorphism_ui:['glassmorphism'], flowchart_comparison:['flowchart comparison'], hero_product_d2c:['hero product d2c'], social_proof_card:['social proof card'], step_by_step_cheatsheet:['step by step cheatsheet'] }, UNKNOWN_SID_LEVELS[1]);
  const hierarchy = find(SID_TAXONOMY.level_3_hierarchy, { bold_display_hook:['bold display hook'], kinetic_retro_type:['kinetic retro type'], high_density_data:['high density data'], minimal_whitespace:['minimal whitespace'], high_contrast_cta:['high contrast cta'], editorial_multicolumn:['editorial multicolumn'] }, UNKNOWN_SID_LEVELS[2]);
  const aesthetic = find(SID_TAXONOMY.level_4_aesthetic, { dark_tech_saas:['dark tech saas'], tactile_paper_texture:['tactile paper texture'], vibrant_retail_promo:['vibrant retail promo'], executive_clean_b2b:['executive clean b2b'], luxury_cosmetic_d2c:['luxury cosmetic d2c'], neo_brutalist_bold:['neo brutalist bold'] }, UNKNOWN_SID_LEVELS[3]);
  return [fmt, mechanic, hierarchy, aesthetic] as EvidenceSid;
}

export function isExplorationFeedBoard(slug: string): boolean {
  return (EXPLORATION_FEED_BOARDS as readonly string[]).includes(slug) || slug.endsWith('/feed');
}

/**
 * Infere deterministicamente a tupla de 4 níveis de Semantic ID (SID) a partir do formato,
 * board de origem e texto descritivo quando o candidato bruto vem de RSS/HTTP externo.
 */
export function inferCandidateSid(params: {
  target_format: string;
  board: string;
  description: string;
  index?: number;
}): [SidLevel1Format, SidLevel2Mechanic, SidLevel3Hierarchy, SidLevel4Aesthetic] {
  const formatCtx = `${params.target_format} ${params.board} ${params.description}`.toLowerCase();
  const candidateMetaCtx = `${params.board} ${params.description}`.toLowerCase();
  const idx = params.index ?? 0;

  let l1: SidLevel1Format = 'carousel_editorial_4:5';
  if (
    (SID_TAXONOMY.level_1_format as readonly string[]).includes(
      params.target_format.trim().toLowerCase(),
    )
  ) {
    l1 = params.target_format.trim().toLowerCase() as SidLevel1Format;
  } else if (
    formatCtx.includes('linkedin') &&
    (formatCtx.includes('pdf') || formatCtx.includes('slide') || formatCtx.includes('present'))
  ) {
    l1 = 'linkedin_framework_pdf';
  } else if (
    formatCtx.includes('linkedin') ||
    formatCtx.includes('infographic') ||
    formatCtx.includes('infografico') ||
    formatCtx.includes('venngage') ||
    formatCtx.includes('hubspot') ||
    formatCtx.includes('piktochart')
  ) {
    l1 = 'linkedin_infographic';
  } else if (
    formatCtx.includes('story') ||
    formatCtx.includes('stories') ||
    formatCtx.includes('9:16') ||
    formatCtx.includes('reels')
  ) {
    l1 = 'story_interactive_9:16';
  } else if (
    /(?:^|[^a-z0-9])ads?(?=$|[^a-z0-9])/.test(formatCtx) ||
    formatCtx.includes('anuncio') ||
    formatCtx.includes('oferta') ||
    formatCtx.includes('packaging') ||
    formatCtx.includes('thedieline')
  ) {
    l1 = formatCtx.includes('1:1') ? 'ad_conversion_1:1' : 'ad_performance_4:5';
  }

  let l2: SidLevel2Mechanic =
    SID_TAXONOMY.level_2_mechanic[idx % SID_TAXONOMY.level_2_mechanic.length]!;
  if (
    candidateMetaCtx.includes('glass') ||
    candidateMetaCtx.includes('translucent') ||
    candidateMetaCtx.includes('uiux') ||
    candidateMetaCtx.includes('interaction')
  ) {
    l2 = 'glassmorphism_ui';
  } else if (candidateMetaCtx.includes('bento') || candidateMetaCtx.includes('dribbble')) {
    l2 = 'bento_grid';
  } else if (candidateMetaCtx.includes('seamless') || candidateMetaCtx.includes('split')) {
    l2 = 'seamless_split';
  } else if (
    candidateMetaCtx.includes('flow') ||
    candidateMetaCtx.includes('infographic') ||
    candidateMetaCtx.includes('charts')
  ) {
    l2 = 'flowchart_comparison';
  } else if (
    candidateMetaCtx.includes('packaging') ||
    candidateMetaCtx.includes('produto') ||
    candidateMetaCtx.includes('d2c')
  ) {
    l2 = 'hero_product_d2c';
  } else if (
    candidateMetaCtx.includes('social proof') ||
    candidateMetaCtx.includes('depoimento') ||
    candidateMetaCtx.includes('testimonial')
  ) {
    l2 = 'social_proof_card';
  } else if (candidateMetaCtx.includes('cheatsheet') || candidateMetaCtx.includes('passo')) {
    l2 = 'step_by_step_cheatsheet';
  } else if (
    candidateMetaCtx.includes('swiss') ||
    candidateMetaCtx.includes('magazine') ||
    candidateMetaCtx.includes('editorial') ||
    candidateMetaCtx.includes('colunas')
  ) {
    l2 = 'swiss_grid';
  }

  let l3: SidLevel3Hierarchy =
    SID_TAXONOMY.level_3_hierarchy[idx % SID_TAXONOMY.level_3_hierarchy.length]!;
  if (
    candidateMetaCtx.includes('retro') ||
    candidateMetaCtx.includes('poster') ||
    candidateMetaCtx.includes('kittl')
  ) {
    l3 = 'kinetic_retro_type';
  } else if (
    candidateMetaCtx.includes('typography') ||
    candidateMetaCtx.includes('hook') ||
    candidateMetaCtx.includes('bold')
  ) {
    l3 = 'bold_display_hook';
  } else if (
    candidateMetaCtx.includes('data') ||
    candidateMetaCtx.includes('chart') ||
    candidateMetaCtx.includes('infographic')
  ) {
    l3 = 'high_density_data';
  } else if (
    candidateMetaCtx.includes('minimal') ||
    candidateMetaCtx.includes('clean') ||
    candidateMetaCtx.includes('translucent')
  ) {
    l3 = 'minimal_whitespace';
  } else if (
    candidateMetaCtx.includes('cta') ||
    candidateMetaCtx.includes('ads') ||
    candidateMetaCtx.includes('promo')
  ) {
    l3 = 'high_contrast_cta';
  } else if (
    candidateMetaCtx.includes('magazine') ||
    candidateMetaCtx.includes('editorial') ||
    candidateMetaCtx.includes('colunas')
  ) {
    l3 = 'editorial_multicolumn';
  }

  let l4: SidLevel4Aesthetic =
    SID_TAXONOMY.level_4_aesthetic[idx % SID_TAXONOMY.level_4_aesthetic.length]!;
  if (
    candidateMetaCtx.includes('dark') ||
    candidateMetaCtx.includes('saas') ||
    candidateMetaCtx.includes('tech') ||
    candidateMetaCtx.includes('neon') ||
    candidateMetaCtx.includes('glass') ||
    candidateMetaCtx.includes('translucent') ||
    candidateMetaCtx.includes('uiux') ||
    candidateMetaCtx.includes('interaction')
  ) {
    l4 = 'dark_tech_saas';
  } else if (
    candidateMetaCtx.includes('paper') ||
    candidateMetaCtx.includes('textura') ||
    candidateMetaCtx.includes('editorial') ||
    candidateMetaCtx.includes('magazine')
  ) {
    l4 = 'tactile_paper_texture';
  } else if (
    candidateMetaCtx.includes('promo') ||
    candidateMetaCtx.includes('oferta') ||
    candidateMetaCtx.includes('varejo')
  ) {
    l4 = 'vibrant_retail_promo';
  } else if (
    candidateMetaCtx.includes('b2b') ||
    candidateMetaCtx.includes('linkedin') ||
    candidateMetaCtx.includes('hubspot') ||
    candidateMetaCtx.includes('executivo')
  ) {
    l4 = 'executive_clean_b2b';
  } else if (
    candidateMetaCtx.includes('luxury') ||
    candidateMetaCtx.includes('cosmetic') ||
    candidateMetaCtx.includes('packaging')
  ) {
    l4 = 'luxury_cosmetic_d2c';
  } else if (candidateMetaCtx.includes('brutalist') || candidateMetaCtx.includes('bold')) {
    l4 = 'neo_brutalist_bold';
  }

  return [l1, l2, l3, l4];
}

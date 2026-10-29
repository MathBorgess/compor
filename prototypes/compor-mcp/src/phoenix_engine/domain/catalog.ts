import { z } from 'zod';

/**
 * Catálogo Canônico Oficial de Boards do Compor (verificados contra endpoints públicos RSS/PWS do Pinterest
 * e governados em compor://catalog/sources), divididos entre Clusters Especializados (A, B, C, D)
 * e Pools de Exploração Out-of-Network (/feed).
 */
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

export const CANONICAL_BOARD_SLUGS = [
  ...SPECIALIZED_ADS_BOARDS,
  ...SPECIALIZED_CAROUSEL_BOARDS,
  ...SPECIALIZED_STORIES_BOARDS,
  ...SPECIALIZED_LINKEDIN_BOARDS,
  ...SPECIALIZED_GENERAL_BOARDS,
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
  const ctx = `${params.target_format} ${params.board} ${params.description}`.toLowerCase();
  const idx = params.index ?? 0;

  let l1: SidLevel1Format = 'carousel_editorial_4:5';
  if (ctx.includes('linkedin') && (ctx.includes('pdf') || ctx.includes('slide') || ctx.includes('present'))) {
    l1 = 'linkedin_framework_pdf';
  } else if (ctx.includes('linkedin') || ctx.includes('infographic') || ctx.includes('infografico') || ctx.includes('venngage') || ctx.includes('hubspot') || ctx.includes('piktochart')) {
    l1 = 'linkedin_infographic';
  } else if (ctx.includes('story') || ctx.includes('stories') || ctx.includes('9:16') || ctx.includes('reels')) {
    l1 = 'story_interactive_9:16';
  } else if (ctx.includes('ad') || ctx.includes('anuncio') || ctx.includes('oferta') || ctx.includes('packaging') || ctx.includes('thedieline')) {
    l1 = ctx.includes('1:1') ? 'ad_conversion_1:1' : 'ad_performance_4:5';
  }

  let l2: SidLevel2Mechanic = SID_TAXONOMY.level_2_mechanic[idx % SID_TAXONOMY.level_2_mechanic.length]!;
  if (ctx.includes('bento') || ctx.includes('dribbble')) {
    l2 = 'bento_grid';
  } else if (ctx.includes('swiss') || ctx.includes('magazine') || ctx.includes('editorial') || ctx.includes('colunas')) {
    l2 = 'swiss_grid';
  } else if (ctx.includes('seamless') || ctx.includes('split')) {
    l2 = 'seamless_split';
  } else if (ctx.includes('glass') || ctx.includes('uiux') || ctx.includes('interaction')) {
    l2 = 'glassmorphism_ui';
  } else if (ctx.includes('flow') || ctx.includes('infographic') || ctx.includes('charts')) {
    l2 = 'flowchart_comparison';
  } else if (ctx.includes('packaging') || ctx.includes('produto') || ctx.includes('d2c')) {
    l2 = 'hero_product_d2c';
  } else if (ctx.includes('cheatsheet') || ctx.includes('passo')) {
    l2 = 'step_by_step_cheatsheet';
  }

  let l3: SidLevel3Hierarchy = SID_TAXONOMY.level_3_hierarchy[idx % SID_TAXONOMY.level_3_hierarchy.length]!;
  if (ctx.includes('retro') || ctx.includes('poster') || ctx.includes('kittl')) {
    l3 = 'kinetic_retro_type';
  } else if (ctx.includes('typography') || ctx.includes('hook') || ctx.includes('bold')) {
    l3 = 'bold_display_hook';
  } else if (ctx.includes('data') || ctx.includes('chart') || ctx.includes('infographic')) {
    l3 = 'high_density_data';
  } else if (ctx.includes('minimal') || ctx.includes('clean')) {
    l3 = 'minimal_whitespace';
  } else if (ctx.includes('cta') || ctx.includes('ads') || ctx.includes('promo')) {
    l3 = 'high_contrast_cta';
  } else if (ctx.includes('magazine') || ctx.includes('editorial')) {
    l3 = 'editorial_multicolumn';
  }

  let l4: SidLevel4Aesthetic = SID_TAXONOMY.level_4_aesthetic[idx % SID_TAXONOMY.level_4_aesthetic.length]!;
  if (ctx.includes('dark') || ctx.includes('saas') || ctx.includes('tech')) {
    l4 = 'dark_tech_saas';
  } else if (ctx.includes('paper') || ctx.includes('textura') || ctx.includes('editorial')) {
    l4 = 'tactile_paper_texture';
  } else if (ctx.includes('promo') || ctx.includes('oferta') || ctx.includes('varejo')) {
    l4 = 'vibrant_retail_promo';
  } else if (ctx.includes('b2b') || ctx.includes('linkedin') || ctx.includes('hubspot') || ctx.includes('executivo')) {
    l4 = 'executive_clean_b2b';
  } else if (ctx.includes('luxury') || ctx.includes('cosmetic') || ctx.includes('packaging')) {
    l4 = 'luxury_cosmetic_d2c';
  } else if (ctx.includes('brutalist') || ctx.includes('bold')) {
    l4 = 'neo_brutalist_bold';
  }

  return [l1, l2, l3, l4];
}

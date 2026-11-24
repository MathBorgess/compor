import {
  buildAspectRationale,
  ProviderUnavailableError,
  resolvePreviewThumbnailInMemory,
  type ProviderSearchQuery,
  type RawProviderCandidate,
  type ReferenceSearchProvider,
} from './base_provider.js';

export type CuratedBoardCategory =
  | 'ads'
  | 'instagram_carousel'
  | 'instagram_stories'
  | 'linkedin'
  | 'general_design';

export interface CuratedPinterestBoard {
  slug: string; // "{user}/{board}" ou "{user}/feed"
  category: CuratedBoardCategory;
  intentKeywords: string[];
}

export interface DiscoveredPinterestBoard {
  slug: string;
  name: string;
  url: string;
  pin_count: number;
}

/**
 * Curated Pinterest boards and profile firehose feeds (`{user}/feed`) organized by creative format,
 * verified against Pinterest public RSS and BoardsResource endpoints.
 */
export const CURATED_PINTEREST_BOARDS: CuratedPinterestBoard[] = [
  // --- A. ADS & PERFORMANCE (Meta Ads, Key Visuals, D2C, Conversão) ---
  {
    slug: 'behance/advertising',
    category: 'ads',
    intentKeywords: ['ad', 'ads', 'anuncio', 'campanha', 'promo', 'oferta', 'conversao', 'meta ads', 'key visual', 'performance'],
  },
  {
    slug: 'kittldesign/ads-designs',
    category: 'ads',
    intentKeywords: ['ad', 'ads', 'anuncio', 'oferta', 'banner', 'promocional', 'cta', 'desconto', 'lancamento'],
  },
  {
    slug: 'creativemarket/social-media-templates',
    category: 'ads',
    intentKeywords: ['ad', 'social media', 'template', 'anuncio', 'feed', 'comercial', 'hierarquia'],
  },
  {
    slug: 'behance/branding-packaging',
    category: 'ads',
    intentKeywords: ['produto', 'embalagem', 'd2c', 'ecommerce', 'branding', 'marca', 'consumo'],
  },
  {
    slug: 'weandthecolor/packaging-design',
    category: 'ads',
    intentKeywords: ['produto', 'embalagem', 'packaging', 'cosmetico', 'bebida', 'd2c'],
  },
  {
    slug: 'thedieline/promotional-packaging',
    category: 'ads',
    intentKeywords: ['produto', 'embalagem', 'promo', 'edicao limitada', 'varejo', 'd2c'],
  },
  {
    slug: 'thedieline/feed',
    category: 'ads',
    intentKeywords: ['produto', 'embalagem', 'd2c', 'ecommerce', 'mockup', 'consumo'],
  },
  {
    slug: '99designs/packaging-label-design',
    category: 'ads',
    intentKeywords: ['pme', 'rotulo', 'embalagem', 'produto', 'comercial'],
  },
  {
    slug: '99designs/feed',
    category: 'ads',
    intentKeywords: ['ad', 'marketing', 'banner', 'promocional', 'venda', 'cta'],
  },
  {
    slug: 'weandthecolor/feed',
    category: 'ads',
    intentKeywords: ['campanha', 'branding', 'identidade', 'bold', 'direcao de arte'],
  },

  // --- B. CARROSSÉIS DE INSTAGRAM (4:5, Editorial, Tipografia, Seamless) ---
  {
    slug: 'behance/typography',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'carousel', 'capa', 'headline', 'tipografia', 'titulo', 'hook', 'serifa'],
  },
  {
    slug: 'weandthecolor/typography',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'carousel', 'tipografia', 'editorial', 'grid', 'expressivo', 'poster'],
  },
  {
    slug: 'creativemarket/magazine-templates',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'carousel', 'editorial', 'grid', 'diagramacao', 'slides', 'revista', 'colunas'],
  },
  {
    slug: 'weandthecolor/templates',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'carousel', 'template', 'layout', 'grid', 'modular', 'slides'],
  },
  {
    slug: 'kittldesign/poster-design',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'capa', 'poster', 'retro', 'textura', 'titulo', 'impacto'],
  },
  {
    slug: 'kittldesign/social-media-designs',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'carousel', 'social media', 'instagram', 'post', 'cards'],
  },
  {
    slug: 'kittldesign/quote-typography-lettering-design',
    category: 'instagram_carousel',
    intentKeywords: ['carrossel', 'frase', 'quote', 'tipografia', 'lettering', 'capa'],
  },
  {
    slug: 'latermedia/instagram-post-design',
    category: 'instagram_carousel',
    intentKeywords: ['instagram', 'post', 'carrossel', 'carousel', 'feed', 'criador', 'retencao'],
  },
  {
    slug: 'creativemarket/feed',
    category: 'instagram_carousel',
    intentKeywords: ['template', 'instagram', 'carrossel', 'social media', 'post', 'estetica'],
  },
  {
    slug: 'canva/design-inspiration',
    category: 'instagram_carousel',
    intentKeywords: ['post', 'instagram', 'carrossel', 'dicas', 'educativo', 'layout'],
  },
  {
    slug: 'canva/canva-template-collections',
    category: 'instagram_carousel',
    intentKeywords: ['template', 'colecao', 'carrossel', 'instagram', 'slides'],
  },
  {
    slug: 'dribbble/design-inspiration',
    category: 'instagram_carousel',
    intentKeywords: ['ui', 'card', 'bento grid', 'tech', 'saas', 'moderno', 'dark'],
  },
  {
    slug: 'dribbble/feed',
    category: 'instagram_carousel',
    intentKeywords: ['ui', 'card', 'bento grid', 'tech', 'saas', 'moderno', 'dark'],
  },
  {
    slug: 'adobe/whats-your-type',
    category: 'instagram_carousel',
    intentKeywords: ['tipografia', 'type', 'display', 'capa', 'editorial'],
  },

  // --- C. STORIES DE INSTAGRAM (9:16, Vertical, Mobile UI) ---
  {
    slug: 'latermedia/instagram-stories',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'story', 'vertical', '9:16', 'enquete', 'caixinha', 'lancamento', 'sequencia'],
  },
  {
    slug: 'latermedia/instagram-story-templates',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'story', 'template', 'vertical', '9:16', 'vendas', 'bastidores'],
  },
  {
    slug: 'latermedia/instagram-story-tips',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'story', 'engajamento', 'dicas', 'interativo', 'stickers'],
  },
  {
    slug: 'latermedia/instagram-reels',
    category: 'instagram_stories',
    intentKeywords: ['reels', 'vertical', '9:16', 'capa', 'mobile'],
  },
  {
    slug: 'latermedia/feed',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'story', 'reels', 'instagram', 'engajamento', 'creator'],
  },
  {
    slug: 'dribbble/uiux-inspiration',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'mobile', 'interface', 'widget', 'glassmorphism', 'app', 'ui'],
  },
  {
    slug: 'behance/interaction-design',
    category: 'instagram_stories',
    intentKeywords: ['stories', 'mobile', 'interativo', 'interface', 'app', 'card'],
  },
  {
    slug: 'weandthecolor/ui-screen-web-design',
    category: 'instagram_stories',
    intentKeywords: ['mobile', 'ui', 'screen', 'vertical', 'layout', 'widget'],
  },
  {
    slug: 'adobe/web-mobile',
    category: 'instagram_stories',
    intentKeywords: ['mobile', 'vertical', 'stories', 'interface', 'responsivo'],
  },

  // --- D. POSTS DE LINKEDIN (B2B, Infográficos, Frameworks, Carrosséis PDF) ---
  {
    slug: 'hubspot/marketing-infographics',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'b2b', 'framework', 'funil', 'marketing', 'dados'],
  },
  {
    slug: 'hubspot/inbound-hub-marketing',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'b2b', 'inbound', 'vendas', 'estrategia', 'corporativo'],
  },
  {
    slug: 'hubspot/templates-tools',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'template', 'framework', 'ferramenta', 'b2b', 'executivo'],
  },
  {
    slug: 'hubspot/feed',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'marketing', 'b2b', 'funil', 'vendas', 'estrategia'],
  },
  {
    slug: 'venngage/free-infographic-template',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'processo', 'fluxograma', 'lista', 'comparativo'],
  },
  {
    slug: 'venngage/infographic-design',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'dados', 'diagrama', 'corporativo', 'b2b'],
  },
  {
    slug: 'venngage/feed',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'b2b', 'framework', 'processo', 'dados', 'corporativo', 'lista'],
  },
  {
    slug: 'vismeapp/business-infographics',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'negocios', 'b2b', 'infografico', 'estatistica', 'relatorio'],
  },
  {
    slug: 'vismeapp/charts-and-graphs-design-inspiration-education',
    category: 'linkedin',
    intentKeywords: ['grafico', 'chart', 'dados', 'data viz', 'tabela', 'linkedin'],
  },
  {
    slug: 'vismeapp/presentations',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'apresentacao', 'slides', 'pdf', 'carrossel', 'executivo', 'pitch'],
  },
  {
    slug: 'vismeapp/feed',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'apresentacao', 'slides', 'grafico', 'estatistica', 'negocios'],
  },
  {
    slug: 'piktochart/best-of-piktochart-infographics',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'resumo', 'cheatsheet', 'comparativo', 'dados'],
  },
  {
    slug: 'piktochart/slide-templates',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'slides', 'apresentacao', 'pdf', 'deck', 'corporativo'],
  },
  {
    slug: 'piktochart/feed',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'infografico', 'resumo', 'cheatsheet', 'comparativo'],
  },
  {
    slug: 'latermedia/linkedin-strategies-tips',
    category: 'linkedin',
    intentKeywords: ['linkedin', 'b2b', 'carrossel', 'autoridade', 'post'],
  },
  {
    slug: 'canva/canva-cheatsheets',
    category: 'linkedin',
    intentKeywords: ['cheatsheet', 'guia', 'passo a passo', 'resumo', 'linkedin', 'educativo'],
  },
  {
    slug: 'adobe/data-creativity',
    category: 'linkedin',
    intentKeywords: ['dados', 'data viz', 'infografico', 'diagrama', 'mapa mental', 'chart'],
  },

  // --- E. BASE GERAL (Fallback / Apoio Visual / Fotografia / Ilustração) ---
  {
    slug: 'behance/graphic-design',
    category: 'general_design',
    intentKeywords: ['design', 'grafico', 'composicao', 'layout', 'editorial'],
  },
  {
    slug: 'weandthecolor/graphic-design',
    category: 'general_design',
    intentKeywords: ['design', 'grafico', 'composicao', 'grid', 'moderno'],
  },
  {
    slug: 'adobe/graphic-design',
    category: 'general_design',
    intentKeywords: ['criativo', 'arte', 'cor', 'contraste', 'colagem'],
  },
  {
    slug: 'behance/photography',
    category: 'general_design',
    intentKeywords: ['foto', 'fotografia', 'lifestyle', 'retrato', 'iluminacao', 'estudio'],
  },
  {
    slug: 'adobe/art-photography',
    category: 'general_design',
    intentKeywords: ['foto', 'fotografia', 'direcao de arte', 'conceitual', 'luz'],
  },
  {
    slug: 'behance/illustration',
    category: 'general_design',
    intentKeywords: ['ilustracao', 'vetor', 'arte digital', 'mascote', 'personagem'],
  },
  {
    slug: 'weandthecolor/illustration',
    category: 'general_design',
    intentKeywords: ['ilustracao', 'editorial', 'textura', 'cor', 'expressivo'],
  },

  // --- F. BASE AMPLIADA DE POSTS BEM-SUCEDIDOS, CRIADORES E COLEÇÕES (verificados HTTP 200 RSS) ---
  {
    slug: 'canva/templates-spotlight',
    category: 'instagram_carousel',
    intentKeywords: ['post', 'instagram', 'template', 'carrossel', 'promocao', 'lancamento', 'educativo'],
  },
  {
    slug: 'canva/design-trends-2026',
    category: 'instagram_carousel',
    intentKeywords: ['tendencia', 'moderno', 'editorial', 'bold', 'campanha', 'instagram'],
  },
  {
    slug: 'planoly/templates',
    category: 'instagram_carousel',
    intentKeywords: ['instagram', 'post', 'template', 'feed', 'carrossel', 'grade', 'minimalista'],
  },
  {
    slug: 'planoly/instagram-tips',
    category: 'instagram_carousel',
    intentKeywords: ['instagram', 'dicas', 'educativo', 'carrossel', 'passo a passo', 'guia'],
  },
  {
    slug: 'planoly/social-media-tips',
    category: 'instagram_carousel',
    intentKeywords: ['social', 'dicas', 'conteudo', 'carrossel', 'marketing', 'autoridade'],
  },
  {
    slug: 'planoly/design-inspiration',
    category: 'instagram_carousel',
    intentKeywords: ['instagram', 'feed', 'estetica', 'paleta', 'editorial', 'clean'],
  },
  {
    slug: 'planoly/inspiring-quotes',
    category: 'instagram_carousel',
    intentKeywords: ['frase', 'quote', 'citacao', 'manifesto', 'tipografia'],
  },
  {
    slug: 'latermedia/instagram-tips-for-small-businesses',
    category: 'ads',
    intentKeywords: ['negocio', 'pequeno', 'vendas', 'instagram', 'loja', 'servico', 'cliente'],
  },
  {
    slug: 'latermedia/small-business-marketing-on-social-media',
    category: 'ads',
    intentKeywords: ['marketing', 'negocio', 'vendas', 'oferta', 'promocao', 'pme'],
  },
  {
    slug: 'latermedia/creators-influencers',
    category: 'instagram_stories',
    intentKeywords: ['criador', 'bastidores', 'storytelling', 'comunidade', 'lifestyle'],
  },
  {
    slug: 'sproutsocial/creative-inspiration',
    category: 'instagram_carousel',
    intentKeywords: ['social', 'marca', 'campanha', 'criativo', 'engajamento', 'post'],
  },
  {
    slug: 'sproutsocial/brand-inspiration',
    category: 'general_design',
    intentKeywords: ['marca', 'branding', 'identidade', 'posicionamento', 'campanha'],
  },
  {
    slug: 'hootsuite/socially-inspired',
    category: 'instagram_carousel',
    intentKeywords: ['social', 'tendencia', 'campanha', 'post', 'marca'],
  },
  {
    slug: 'hubspot/how-to-use-instagram-for-marketing',
    category: 'ads',
    intentKeywords: ['instagram', 'marketing', 'funil', 'vendas', 'conversao'],
  },
  {
    slug: 'hubspot/all-things-social-media',
    category: 'linkedin',
    intentKeywords: ['social', 'redes', 'conteudo', 'marketing', 'digital'],
  },
  {
    slug: 'piktochart/social-media-infographics',
    category: 'linkedin',
    intentKeywords: ['infografico', 'dados', 'social', 'carrossel', 'educativo'],
  },
  {
    slug: 'piktochart/advertising-infographics',
    category: 'ads',
    intentKeywords: ['anuncio', 'comparativo', 'beneficios', 'dados', 'vendas'],
  },
  {
    slug: 'vismeapp/advertising-design-from-around-the-world-inspirati',
    category: 'ads',
    intentKeywords: ['anuncio', 'advertising', 'campanha', 'criativo', 'oferta'],
  },
  {
    slug: 'vismeapp/artistic-infographics-design-inspiration',
    category: 'linkedin',
    intentKeywords: ['infografico', 'ilustrado', 'editorial', 'carrossel', 'educativo'],
  },
  {
    slug: 'vistacreate/black-friday-designs',
    category: 'ads',
    intentKeywords: ['promocao', 'desconto', 'black friday', 'oferta', 'varejo'],
  },
  {
    slug: 'vistacreate/beauty',
    category: 'ads',
    intentKeywords: ['beleza', 'estetica', 'skincare', 'cosmetico', 'autocuidado'],
  },
  {
    slug: 'vistacreate/back-to-school-templates',
    category: 'instagram_carousel',
    intentKeywords: ['educacao', 'curso', 'aula', 'enem', 'mentoria', 'estudantes'],
  },
  {
    slug: 'venngage/top-editable-flyer-templates',
    category: 'ads',
    intentKeywords: ['flyer', 'evento', 'oficina', 'curso', 'promocao', 'local'],
  },
  {
    slug: 'venngage/poster-templates',
    category: 'instagram_carousel',
    intentKeywords: ['poster', 'evento', 'workshop', 'oficina', 'palestra', 'divulgacao'],
  },
  {
    slug: 'kittldesign/card-design',
    category: 'instagram_carousel',
    intentKeywords: ['convite', 'cartao', 'evento', 'workshop', 'oficina'],
  },
  {
    slug: 'kittldesign/retro-style-designs',
    category: 'instagram_carousel',
    intentKeywords: ['retro', 'vintage', 'artesanal', 'cafe', 'textura'],
  },
  {
    slug: 'kittldesign/product-label-designs',
    category: 'ads',
    intentKeywords: ['rotulo', 'produto', 'embalagem', 'artesanal', 'loja'],
  },
  {
    slug: 'creativemarket/trends',
    category: 'general_design',
    intentKeywords: ['tendencia', 'paleta', 'textura', 'estetica', 'campanha'],
  },
  {
    slug: 'creativemarket/mockups',
    category: 'general_design',
    intentKeywords: ['mockup', 'produto', 'catalogo', 'vitrine', 'estudio'],
  },
  {
    slug: 'thedieline/food-packaging',
    category: 'ads',
    intentKeywords: ['comida', 'gastronomia', 'food', 'confeitaria', 'restaurante', 'artesanal'],
  },
  {
    slug: 'thedieline/beauty-health-packaging',
    category: 'ads',
    intentKeywords: ['beleza', 'cosmetico', 'skincare', 'saude', 'natural'],
  },
  {
    slug: 'thedieline/beverage-packaging',
    category: 'ads',
    intentKeywords: ['bebida', 'cafe', 'cafeteria', 'cha', 'vinho', 'artesanal'],
  },
  {
    slug: 'thedieline/sustainable-packaging',
    category: 'general_design',
    intentKeywords: ['sustentavel', 'natural', 'organico', 'ceramica', 'artesanal'],
  },
  {
    slug: 'dribbble/branding-inspiration',
    category: 'general_design',
    intentKeywords: ['marca', 'branding', 'identidade', 'paleta', 'startup'],
  },
  {
    slug: 'dribbble/poster-inspiration',
    category: 'instagram_carousel',
    intentKeywords: ['poster', 'evento', 'cartaz', 'bold', 'capa'],
  },
  {
    slug: 'dribbble/illustration-inspiration',
    category: 'general_design',
    intentKeywords: ['ilustracao', 'desenho', 'personagem', 'editorial', 'criativo'],
  },
  {
    slug: 'behance/fashion-design',
    category: 'general_design',
    intentKeywords: ['moda', 'fashion', 'colecao', 'lookbook', 'editorial'],
  },
  {
    slug: 'behance/best-of-behance',
    category: 'general_design',
    intentKeywords: ['campanha', 'direcao de arte', 'editorial', 'design'],
  },
  {
    slug: 'itsnicethat/photography',
    category: 'general_design',
    intentKeywords: ['fotografia', 'foto', 'editorial', 'ensaio', 'retrato', 'colecao'],
  },
  {
    slug: 'itsnicethat/graphic-design',
    category: 'general_design',
    intentKeywords: ['design', 'grafico', 'editorial', 'cultura', 'identidade'],
  },
  {
    slug: 'itsnicethat/fashion',
    category: 'general_design',
    intentKeywords: ['moda', 'fashion', 'roupa', 'lookbook', 'colecao'],
  },
  {
    slug: 'abduzeedo/grid',
    category: 'instagram_carousel',
    intentKeywords: ['grid', 'swiss', 'modular', 'carrossel', 'colunas'],
  },
  {
    slug: 'abduzeedo/minimalistical',
    category: 'general_design',
    intentKeywords: ['minimalista', 'clean', 'respiro', 'sofisticado'],
  },
  {
    slug: 'envato/color-psychology',
    category: 'general_design',
    intentKeywords: ['cor', 'cores', 'paleta', 'psicologia', 'contraste'],
  },
];

export interface PinterestPinJsonItem {
  id?: string;
  ref_id?: string;
  title?: string;
  grid_title?: string;
  description?: string;
  closeup_unified_description?: string;
  alt_text?: string;
  auto_alt_text?: string;
  link?: string;
  origin_url?: string;
  preview_url?: string;
  media_url?: string;
  images?: {
    '236x'?: { url?: string };
    '474x'?: { url?: string };
    '736x'?: { url?: string };
    orig?: { url?: string };
  };
  aspect_rationale?: {
    typography?: string;
    composition?: string;
    color?: string;
    photography?: string;
  };
  thumbnail_base64?: string;
}

const DEFAULT_HTTP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parses a public Pinterest board or user firehose RSS feed (`https://www.pinterest.com/<slug>.rss`)
 * into normalized `PinterestPinJsonItem` records without any headless browser.
 */
export function parsePinterestBoardRss(rssXml: string): PinterestPinJsonItem[] {
  const items: PinterestPinJsonItem[] = [];
  const itemMatches = rssXml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const itemXml of itemMatches) {
    const titleRaw = itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const linkRaw =
      itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ??
      itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
      '';
    const descRaw = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '';

    const decodedTitle = decodeXmlEntities(titleRaw).trim();
    const decodedLink = decodeXmlEntities(linkRaw).trim();
    const decodedDescHtml = decodeXmlEntities(descRaw).trim();

    const pinIdMatch = decodedLink.match(/\/pin\/([^/?#]+)/i);
    const pinId = pinIdMatch?.[1] ?? `rss_${items.length + 1}`;
    const imgMatch = decodedDescHtml.match(/https:\/\/i\.pinimg\.com\/[^"'\s<>]+/i);
    const previewUrl = imgMatch?.[0];
    if (!previewUrl) continue;

    const mediaUrl = previewUrl.replace('/236x/', '/736x/');
    const plainDesc = decodedDescHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    items.push({
      id: pinId,
      title: decodedTitle || plainDesc.slice(0, 80) || `Pin ${pinId}`,
      description: plainDesc || decodedTitle,
      alt_text: plainDesc || decodedTitle,
      origin_url: decodedLink || `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`,
      preview_url: previewUrl,
      media_url: mediaUrl,
    });
  }

  return items;
}

/**
 * Parses embedded `__PWS_INITIAL_PROPS__` JSON from a public Pinterest board HTML page.
 */
export function parsePinterestPwsHtml(html: string): PinterestPinJsonItem[] {
  const match = html.match(
    /<script[^>]+id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as {
      initialReduxState?: { pins?: Record<string, PinterestPinJsonItem> };
    };
    const pinsObj = parsed.initialReduxState?.pins;
    if (!pinsObj || typeof pinsObj !== 'object') return [];
    return Object.values(pinsObj);
  } catch {
    return [];
  }
}

/**
 * Autodiscovers all public board slugs of a Pinterest reference account via `BoardsResource/get/`
 * (with `X-Pinterest-PWS-Handler: www/[username]/_saved.js`) and `__PWS_INITIAL_PROPS__` fallback.
 */
export async function discoverUserPublicBoards(
  username: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  timeoutMs = 5000,
): Promise<DiscoveredPinterestBoard[]> {
  const cleanUser = username.trim().replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(cleanUser)) {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Pinterest board discovery timeout')), timeoutMs);
  timer.unref?.();

  try {
    const params = new URLSearchParams({
      source_url: `/${cleanUser}/_saved/`,
      data: JSON.stringify({
        options: {
          username: cleanUser,
          field_set_key: 'profile_grid_item',
          page_size: 50,
        },
        context: {},
      }),
    });

    const apiEndpoint = `https://www.pinterest.com/resource/BoardsResource/get/?${params.toString()}`;
    const apiRes = await fetchFn(apiEndpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': DEFAULT_HTTP_USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
        'X-Pinterest-AppState': 'active',
        'X-Pinterest-Source-Url': `/${cleanUser}/_saved/`,
        'X-Pinterest-PWS-Handler': 'www/[username]/_saved.js',
        'Referrer-Policy': 'no-referrer',
      },
      signal: controller.signal,
    });

    if (apiRes.ok) {
      const json = (await apiRes.json()) as {
        resource_response?: {
          data?: Array<{ url?: string; name?: string; pin_count?: number }>;
        };
      };
      const rawBoards = json.resource_response?.data ?? [];
      const discovered = rawBoards
        .filter((b) => typeof b.url === 'string' && b.url.length > 2)
        .map((b) => {
          const slug = b.url!.replace(/^\/+|\/+$/g, '');
          return {
            slug,
            name: String(b.name ?? slug),
            url: `https://www.pinterest.com/${slug}/`,
            pin_count: typeof b.pin_count === 'number' ? b.pin_count : 0,
          };
        })
        .filter((b) => b.slug.toLowerCase().startsWith(`${cleanUser.toLowerCase()}/`));

      if (discovered.length > 0) {
        return discovered;
      }
    }

    // Fallback: inspect __PWS_INITIAL_PROPS__ on https://www.pinterest.com/{username}/_saved/
    const htmlRes = await fetchFn(`https://www.pinterest.com/${cleanUser}/_saved/`, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': DEFAULT_HTTP_USER_AGENT,
        'Referrer-Policy': 'no-referrer',
      },
      signal: controller.signal,
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const match = html.match(
        /<script[^>]+id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/i,
      );
      if (match?.[1]) {
        const parsed = JSON.parse(match[1]) as {
          initialReduxState?: {
            boards?: Record<string, { url?: string; name?: string; pin_count?: number }>;
          };
        };
        const boardsMap = parsed.initialReduxState?.boards ?? {};
        return Object.values(boardsMap)
          .filter((b) => typeof b.url === 'string' && b.url.length > 2)
          .map((b) => {
            const slug = b.url!.replace(/^\/+|\/+$/g, '');
            return {
              slug,
              name: String(b.name ?? slug),
              url: `https://www.pinterest.com/${slug}/`,
              pin_count: typeof b.pin_count === 'number' ? b.pin_count : 0,
            };
          });
      }
    }
  } catch {
    // Return empty list if offline or unreachable
  } finally {
    clearTimeout(timer);
  }

  return [];
}

function inferTargetCategory(targetFormat: string, briefingSummary: string): CuratedBoardCategory {
  const combined = normalizeText(`${targetFormat} ${briefingSummary}`);
  if (
    combined.includes('linkedin') ||
    combined.includes('infografico') ||
    combined.includes('infographic') ||
    combined.includes('b2b') ||
    combined.includes('framework') ||
    combined.includes('cheatsheet') ||
    combined.includes('data viz')
  ) {
    return 'linkedin';
  }
  if (
    combined.includes('story') ||
    combined.includes('stories') ||
    combined.includes('9:16') ||
    combined.includes('vertical') ||
    combined.includes('reels')
  ) {
    return 'instagram_stories';
  }
  if (
    combined.includes('carousel') ||
    combined.includes('carrossel') ||
    combined.includes('slides') ||
    combined.includes('lamina')
  ) {
    return 'instagram_carousel';
  }
  if (
    /\bads?\b/.test(combined) ||
    combined.includes('anuncio') ||
    combined.includes('campanha') ||
    combined.includes('single_feed') ||
    combined.includes('oferta') ||
    combined.includes('conversao') ||
    combined.includes('packaging') ||
    combined.includes('embalagem')
  ) {
    return 'ads';
  }
  return 'general_design';
}

export function selectCuratedBoardsForQuery(query: ProviderSearchQuery): string[] {
  const allowedList = query.source.allowed_boards_or_queries.filter(
    (b) => !b.startsWith('compor-curated/'),
  );
  if (allowedList.length === 0) {
    return [query.source.allowed_boards_or_queries[0] ?? 'behance/graphic-design'];
  }

  const allowedSet = new Set(allowedList.map((s) => s.toLowerCase()));
  const targetCategory = inferTargetCategory(query.target_format, query.briefing_summary);
  const normalizedContext = normalizeText(`${query.briefing_summary} ${query.target_format}`);
  const metadataBySlug = new Map<string, CuratedPinterestBoard>();
  for (const board of CURATED_PINTEREST_BOARDS) {
    metadataBySlug.set(board.slug.toLowerCase(), board);
  }

  return [...allowedList].sort((slugA, slugB) => {
    const score = (slug: string): number => {
      const lower = slug.toLowerCase();
      if (!allowedSet.has(lower)) return -1;
      const meta = metadataBySlug.get(lower);
      let s = 0;

      if (meta) {
        if (meta.category === targetCategory) s += 10;
        else if (meta.category === 'general_design') s += 2;

        for (const kw of meta.intentKeywords) {
          const normalizedKeyword = normalizeText(kw);
          const matches = normalizedKeyword === 'ad'
            ? /\bad\b/.test(normalizedContext)
            : normalizedKeyword === 'ads'
              ? /\bads\b/.test(normalizedContext)
              : normalizedContext.includes(normalizedKeyword);
          if (matches) {
            s += 4;
          }
        }
      }

      if (query.aspect_focus.includes('typography') && lower.includes('typograph')) {
        s += 5;
      }
      if (query.aspect_focus.includes('photography') && lower.includes('photograph')) {
        s += 6;
      }
      if (query.aspect_focus.includes('composition') && (lower.includes('editorial') || lower.includes('template') || lower.includes('poster'))) {
        s += 3;
      }
      // Prefer specific curated boards first, keeping {user}/feed firehose right behind as resilient fallback
      if (!lower.endsWith('/feed')) {
        s += 1;
      }
      return s;
    };

    return score(slugB) - score(slugA);
  });
}

function rankPinsByQuery(pins: PinterestPinJsonItem[], briefingSummary: string): PinterestPinJsonItem[] {
  const tokens = normalizeText(briefingSummary)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return pins;

  return [...pins].sort((a, b) => {
    const textA = normalizeText(`${a.title ?? ''} ${a.description ?? ''}`);
    const textB = normalizeText(`${b.title ?? ''} ${b.description ?? ''}`);
    const hitsA = tokens.reduce((acc, tk) => acc + (textA.includes(tk) ? 1 : 0), 0);
    const hitsB = tokens.reduce((acc, tk) => acc + (textB.includes(tk) ? 1 : 0), 0);
    return hitsB - hitsA;
  });
}

/**
 * Lightweight HTTP/GraphQL/RSS metadata-only extractor inspired by pinterest-dl / gallery-dl --dump-json.
 * Strictly prohibits Playwright/Puppeteer/Chromium and never writes media files to disk during search.
 */
export class CuratedPinterestProvider implements ReferenceSearchProvider {
  readonly sourceId: string;
  readonly accessMethod = 'curated_board_http' as const;
  readonly headlessBrowserUsed = false as const;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options: {
    sourceId?: string;
    fetchFn?: typeof globalThis.fetch;
  } = {}) {
    this.sourceId = options.sourceId ?? 'pinterest_curated_design';
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  }

  private async fetchRssCandidatesFromSlug(
    slug: string,
    timeoutMs: number,
  ): Promise<PinterestPinJsonItem[]> {
    const rssEndpoint = `https://www.pinterest.com/${slug}.rss`;
    const rssController = new AbortController();
    const rssTimer = setTimeout(
      () => rssController.abort(new Error('Pinterest RSS HTTP timeout')),
      timeoutMs,
    );
    rssTimer.unref?.();

    try {
      const rssResponse = await this.fetchFn(rssEndpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.8',
          'User-Agent': DEFAULT_HTTP_USER_AGENT,
          'Referrer-Policy': 'no-referrer',
        },
        signal: rssController.signal,
      });

      if (rssResponse.ok) {
        const rssBody = await rssResponse.text();
        const parsedRssPins = parsePinterestBoardRss(rssBody);
        if (parsedRssPins.length > 0) return parsedRssPins;
        return parsePinterestPwsHtml(rssBody);
      }
    } catch {
      // Ignore individual board failure and allow the next explicitly authorized board.
    } finally {
      clearTimeout(rssTimer);
    }

    return [];
  }

  async searchMetadataOnly(query: ProviderSearchQuery): Promise<RawProviderCandidate[]> {
    const boards = selectCuratedBoardsForQuery(query);
    const primaryBoard = boards[0] ?? 'behance/graphic-design';
    const timeoutMs = Math.min(5000, query.source.rate_limit.timeout_ms);
    const limit = query.limit ?? 5;

    let rawPins: PinterestPinJsonItem[] = [];
    let lastError: Error | null = null;

    // Step 1: Attempt Pinterest JSON BaseSearchResource endpoint (used by mock tests & authenticated sessions)
    const searchParams = new URLSearchParams({
      source_url: `/${primaryBoard}/`,
      data: JSON.stringify({
        options: {
          board_slug: primaryBoard,
          query: query.briefing_summary.slice(0, 120),
          target_format: query.target_format,
          aspect_focus: query.aspect_focus,
          page_size: limit,
        },
        context: {},
      }),
    });

    const endpoint = `https://www.pinterest.com/resource/BaseSearchResource/get/?${searchParams.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Pinterest HTTP timeout')), timeoutMs);
    timer.unref?.();

    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': DEFAULT_HTTP_USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Pinterest-AppState': 'active',
          'Referrer-Policy': 'no-referrer',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        rawPins = this.extractPinItems(payload);
      } else {
        lastError = new ProviderUnavailableError(
          query.source.source_id,
          `Pinterest HTTP endpoint returned status ${response.status}.`,
        );
      }
    } catch (error) {
      lastError =
        error instanceof ProviderUnavailableError
          ? error
          : new ProviderUnavailableError(
              query.source.source_id,
              error instanceof Error ? error.message : 'Pinterest HTTP request failed.',
            );
    } finally {
      clearTimeout(timer);
    }

    // Step 2: Query only boards in the source scope. An account-wide feed may be
    // used as fallback only if that exact feed is also authorized in this scope.
    // A feed is broader than a single board and cannot inherit its authorization.
    if (rawPins.length === 0) {
      const existingIds = new Set<string>();
      const triedSlugs = new Set<string>();
      const authorizedSlugs = new Set(query.source.allowed_boards_or_queries.map(slug => slug.toLowerCase()));

      for (const board of boards.slice(0, 3)) {
        if (triedSlugs.has(board)) continue;
        triedSlugs.add(board);

        let candidatePins = await this.fetchRssCandidatesFromSlug(board, timeoutMs);

        // A related feed is optional; it is never implied by the board's scope.
        if (candidatePins.length === 0 && !board.endsWith('/feed')) {
          const username = board.split('/')[0];
          const firehoseSlug = username ? `${username}/feed` : '';
          if (firehoseSlug && authorizedSlugs.has(firehoseSlug.toLowerCase()) && !triedSlugs.has(firehoseSlug)) {
            triedSlugs.add(firehoseSlug);
            candidatePins = await this.fetchRssCandidatesFromSlug(firehoseSlug, timeoutMs);
          }
        }

        for (const pin of candidatePins) {
          const key = pin.id ?? pin.origin_url;
          if (key && existingIds.has(key)) continue;
          if (key) existingIds.add(key);
          rawPins.push(pin);
        }

        if (rawPins.length >= limit) break;
      }
    }

    if (rawPins.length === 0 && lastError) {
      throw lastError;
    }

    const rankedPins = rankPinsByQuery(rawPins, query.briefing_summary);

    return Promise.all(
      rankedPins.slice(0, limit).map(async (pin, idx) => {
        const pinId = String(pin.id ?? pin.ref_id ?? `pin_${idx + 1}`);
        const previewUrl =
          pin.preview_url ??
          pin.images?.['236x']?.url ??
          `https://i.pinimg.com/236x/curated/${encodeURIComponent(pinId)}.jpg`;
        const mediaUrl =
          pin.media_url ??
          pin.images?.['736x']?.url ??
          pin.images?.orig?.url ??
          previewUrl;
        const originUrl =
          pin.origin_url ??
          pin.link ??
          `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;

        const resolvedThumbnail = await resolvePreviewThumbnailInMemory({
          providedThumbnailBase64: pin.thumbnail_base64,
          previewUrl,
          fetchFn: this.fetchFn,
          timeoutMs,
        });

        return {
          preferred_ref_id: pin.ref_id,
          source_id: query.source.source_id,
          origin_url: originUrl,
          preview_url: previewUrl,
          media_url: mediaUrl,
          raw_title: String(pin.title ?? pin.grid_title ?? `Referência Curada ${idx + 1}`),
          raw_caption: String(pin.description ?? pin.closeup_unified_description ?? ''),
          raw_alt_text: String(pin.alt_text ?? pin.auto_alt_text ?? pin.description ?? ''),
          raw_aspect_rationale: pin.aspect_rationale,
          aspect_rationale: buildAspectRationale(
            query.aspect_focus,
            query.target_format,
          ),
          thumbnail_base64: resolvedThumbnail?.thumbnail_base64 ?? null,
          thumbnail_mime_type: resolvedThumbnail?.thumbnail_mime_type ?? null,
        };
      }),
    );
  }

  private extractPinItems(payload: unknown): PinterestPinJsonItem[] {
    if (!payload || typeof payload !== 'object') return [];
    const obj = payload as Record<string, unknown>;

    if (Array.isArray(obj.items)) return obj.items as PinterestPinJsonItem[];
    if (Array.isArray(obj.pins)) return obj.pins as PinterestPinJsonItem[];
    if (Array.isArray(obj.results)) return obj.results as PinterestPinJsonItem[];

    const resourceResponse = obj.resource_response as Record<string, unknown> | undefined;
    if (resourceResponse && typeof resourceResponse.data === 'object' && resourceResponse.data !== null) {
      const data = resourceResponse.data as Record<string, unknown>;
      if (Array.isArray(data.results)) return data.results as PinterestPinJsonItem[];
      if (Array.isArray(data.pins)) return data.pins as PinterestPinJsonItem[];
    }
    return [];
  }
}

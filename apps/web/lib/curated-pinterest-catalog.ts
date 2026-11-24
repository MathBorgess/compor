import type { PostFormat } from './studio-domain.ts';
import type { BoardSlug } from './phoenix/catalog.ts';
import type { BoardAffinityEntry } from './phoenix/models.ts';

export type CuratedBoardArchetype =
  | 'social_post'
  | 'carousel_editorial'
  | 'story_vertical'
  | 'product_photo'
  | 'ad_conversion'
  | 'infographic_b2b'
  | 'typography_poster'
  | 'brand_identity';

export interface CuratedPinterestEntry {
  slug: BoardSlug;
  formats: readonly PostFormat[];
  archetype: CuratedBoardArchetype;
  /** Baseline curation weight favoring real, high-performing social post layouts. */
  priority: number;
  keywords: readonly string[];
}

/**
 * Server-only curated Pinterest board catalog (HTTP 200 RSS verified).
 * Never imported by client components; keeps keyword tables out of the browser bundle.
 */
export const CURATED_PINTEREST_CATALOG: readonly CuratedPinterestEntry[] = [
  // --- A. Posts de Instagram, Feed & Criadores (Single + Carrossel) ---
  {
    slug: 'latermedia/instagram-post-design',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 10,
    keywords: ['instagram', 'post', 'feed', 'carrossel', 'carousel', 'criador', 'creator', 'retencao', 'social', 'engajamento', 'marca', 'dicas'],
  },
  {
    slug: 'planoly/templates',
    formats: ['single', 'carousel', 'story'],
    archetype: 'social_post',
    priority: 10,
    keywords: ['instagram', 'post', 'template', 'feed', 'carrossel', 'layout', 'grade', 'organizado', 'minimalista', 'criador', 'loja', 'negocio'],
  },
  {
    slug: 'canva/templates-spotlight',
    formats: ['single', 'carousel', 'story'],
    archetype: 'social_post',
    priority: 10,
    keywords: ['post', 'instagram', 'template', 'carrossel', 'promocao', 'oferta', 'evento', 'lancamento', 'educativo', 'moderno', 'redes'],
  },
  {
    slug: 'sproutsocial/creative-inspiration',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['social', 'marca', 'campanha', 'criativo', 'instagram', 'post', 'engajamento', 'autoridade', 'conteudo', 'comunicacao'],
  },
  {
    slug: 'latermedia/instagram-tips-for-small-businesses',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['negocio', 'pequeno', 'empreendedor', 'vendas', 'cliente', 'instagram', 'servico', 'loja', 'atendimento', 'local', 'oficina', 'agenda'],
  },
  {
    slug: 'latermedia/small-business-marketing-on-social-media',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['marketing', 'negocio', 'vendas', 'divulgacao', 'oferta', 'promocao', 'clientes', 'empreendedor', 'pme', 'comercio'],
  },
  {
    slug: 'planoly/design-inspiration',
    formats: ['single', 'carousel', 'collection'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['instagram', 'feed', 'estetica', 'paleta', 'editorial', 'clean', 'acolhedor', 'lifestyle', 'minimalista', 'identidade'],
  },
  {
    slug: 'planoly/instagram-tips',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 8,
    keywords: ['dicas', 'educativo', 'passo', 'guia', 'carrossel', 'checklist', 'ensinar', 'aula', 'mentoria', 'instagram'],
  },
  {
    slug: 'planoly/social-media-tips',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 8,
    keywords: ['dicas', 'social', 'conteudo', 'carrossel', 'estrategia', 'educativo', 'marketing', 'autoridade'],
  },
  {
    slug: 'planoly/inspiring-quotes',
    formats: ['single', 'carousel', 'story'],
    archetype: 'typography_poster',
    priority: 8,
    keywords: ['frase', 'quote', 'citacao', 'manifesto', 'opiniao', 'reflexao', 'texto', 'tipografia', 'bem-estar', 'motivacao'],
  },
  {
    slug: 'latermedia/creators-influencers',
    formats: ['single', 'carousel', 'story'],
    archetype: 'social_post',
    priority: 8,
    keywords: ['criador', 'bastidores', 'pessoal', 'autoral', 'influencer', 'comunidade', 'rotina', 'lifestyle', 'storytelling'],
  },
  {
    slug: 'hootsuite/socially-inspired',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 8,
    keywords: ['social', 'tendencia', 'campanha', 'viral', 'criativo', 'post', 'marca', 'redes'],
  },
  {
    slug: 'sproutsocial/brand-inspiration',
    formats: ['single', 'carousel', 'collection'],
    archetype: 'brand_identity',
    priority: 8,
    keywords: ['marca', 'branding', 'identidade', 'posicionamento', 'campanha', 'voz', 'visual', 'empresa'],
  },
  {
    slug: 'hubspot/how-to-use-instagram-for-marketing',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 7,
    keywords: ['instagram', 'marketing', 'funil', 'vendas', 'conversao', 'negocio', 'estrategia'],
  },
  {
    slug: 'hubspot/all-things-social-media',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 7,
    keywords: ['social', 'redes', 'conteudo', 'calendario', 'marketing', 'digital'],
  },
  {
    slug: 'canva/design-inspiration',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 8,
    keywords: ['post', 'instagram', 'carrossel', 'dicas', 'educativo', 'layout', 'curso', 'aula', 'mentoria'],
  },
  {
    slug: 'canva/design-trends-2026',
    formats: ['single', 'carousel', 'story'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['tendencia', 'moderno', 'atual', 'editorial', 'bold', 'criativo', 'lancamento', 'campanha'],
  },
  {
    slug: 'canva/canva-template-collections',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 8,
    keywords: ['colecao', 'template', 'carrossel', 'slides', 'serie', 'kit', 'padrao', 'instagram'],
  },
  {
    slug: 'kittldesign/social-media-designs',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['post', 'social', 'instagram', 'carrossel', 'card', 'impacto', 'bold', 'chamativo'],
  },
  {
    slug: 'creativemarket/social-media-templates',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 9,
    keywords: ['social', 'template', 'instagram', 'feed', 'carrossel', 'anuncio', 'comercial', 'hierarquia', 'elegante'],
  },

  // --- B. Carrosséis Editoriais, Grids & Tipografia de Alto Impacto ---
  {
    slug: 'creativemarket/magazine-templates',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 8,
    keywords: ['carrossel', 'carousel', 'editorial', 'revista', 'grid', 'colunas', 'slides', 'diagramacao', 'leitura'],
  },
  {
    slug: 'weandthecolor/templates',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 8,
    keywords: ['carrossel', 'template', 'grid', 'modular', 'slides', 'apresentacao', 'layout'],
  },
  {
    slug: 'abduzeedo/grid',
    formats: ['carousel', 'single'],
    archetype: 'carousel_editorial',
    priority: 7,
    keywords: ['grid', 'suico', 'swiss', 'modular', 'arquitetura', 'estruturado', 'carrossel', 'colunas'],
  },
  {
    slug: 'abduzeedo/minimalistical',
    formats: ['single', 'carousel', 'collection'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['minimalista', 'minimal', 'clean', 'limpo', 'respiro', 'sofisticado', 'silencioso', 'elegante'],
  },
  {
    slug: 'behance/typography',
    formats: ['carousel', 'single'],
    archetype: 'typography_poster',
    priority: 6,
    keywords: ['tipografia', 'typography', 'headline', 'titulo', 'capa', 'hook', 'serifa', 'letras', 'cartaz'],
  },
  {
    slug: 'weandthecolor/typography',
    formats: ['carousel', 'single'],
    archetype: 'typography_poster',
    priority: 6,
    keywords: ['tipografia', 'typography', 'expressivo', 'editorial', 'capa', 'titulo', 'poster'],
  },
  {
    slug: 'adobe/whats-your-type',
    formats: ['single', 'carousel'],
    archetype: 'typography_poster',
    priority: 6,
    keywords: ['tipografia', 'type', 'display', 'capa', 'editorial', 'fonte'],
  },
  {
    slug: 'kittldesign/quote-typography-lettering-design',
    formats: ['single', 'carousel'],
    archetype: 'typography_poster',
    priority: 7,
    keywords: ['frase', 'quote', 'lettering', 'tipografia', 'capa', 'destaque', 'mensagem'],
  },
  {
    slug: 'kittldesign/poster-design',
    formats: ['single', 'carousel'],
    archetype: 'typography_poster',
    priority: 7,
    keywords: ['poster', 'cartaz', 'evento', 'show', 'oficina', 'workshop', 'retro', 'textura', 'impacto'],
  },
  {
    slug: 'kittldesign/retro-style-designs',
    formats: ['single', 'carousel'],
    archetype: 'typography_poster',
    priority: 7,
    keywords: ['retro', 'vintage', 'nostalgico', 'artesanal', 'cafe', 'papel', 'textura', 'ilustrado'],
  },
  {
    slug: 'kittldesign/card-design',
    formats: ['single', 'carousel'],
    archetype: 'social_post',
    priority: 7,
    keywords: ['convite', 'cartao', 'card', 'evento', 'workshop', 'oficina', 'aula', 'data', 'programacao'],
  },
  {
    slug: 'dribbble/poster-inspiration',
    formats: ['single', 'carousel'],
    archetype: 'typography_poster',
    priority: 7,
    keywords: ['poster', 'evento', 'cartaz', 'palestra', 'lancamento', 'bold', 'capa'],
  },
  {
    slug: 'venngage/poster-templates',
    formats: ['single', 'story'],
    archetype: 'typography_poster',
    priority: 8,
    keywords: ['poster', 'evento', 'workshop', 'oficina', 'curso', 'palestra', 'divulgacao', 'aviso', 'data'],
  },

  // --- C. Stories 9:16, Reels & Interação Mobile ---
  {
    slug: 'latermedia/instagram-stories',
    formats: ['story'],
    archetype: 'story_vertical',
    priority: 10,
    keywords: ['story', 'stories', 'vertical', '9:16', 'enquete', 'caixinha', 'sequencia', 'lancamento', 'interativo', 'mobile'],
  },
  {
    slug: 'latermedia/instagram-story-templates',
    formats: ['story'],
    archetype: 'story_vertical',
    priority: 10,
    keywords: ['story', 'stories', 'template', 'vertical', '9:16', 'vendas', 'bastidores', 'oferta', 'link', 'cta'],
  },
  {
    slug: 'latermedia/instagram-story-tips',
    formats: ['story'],
    archetype: 'story_vertical',
    priority: 9,
    keywords: ['story', 'stories', 'dicas', 'engajamento', 'stickers', 'interacao', 'enquete', 'perguntas'],
  },
  {
    slug: 'latermedia/instagram-reels',
    formats: ['story'],
    archetype: 'story_vertical',
    priority: 9,
    keywords: ['reels', 'capa', 'vertical', '9:16', 'video', 'hook', 'mobile', 'story'],
  },
  {
    slug: 'dribbble/uiux-inspiration',
    formats: ['story', 'carousel'],
    archetype: 'story_vertical',
    priority: 7,
    keywords: ['story', 'mobile', 'app', 'interface', 'ui', 'widget', 'tech', 'saas', 'dark', 'glassmorphism'],
  },
  {
    slug: 'behance/interaction-design',
    formats: ['story', 'single'],
    archetype: 'story_vertical',
    priority: 6,
    keywords: ['mobile', 'interativo', 'app', 'produto', 'digital', 'saas', 'tech'],
  },
  {
    slug: 'weandthecolor/ui-screen-web-design',
    formats: ['story', 'carousel'],
    archetype: 'story_vertical',
    priority: 6,
    keywords: ['mobile', 'ui', 'tela', 'app', 'software', 'saas', 'vertical'],
  },
  {
    slug: 'adobe/web-mobile',
    formats: ['story'],
    archetype: 'story_vertical',
    priority: 6,
    keywords: ['mobile', 'vertical', 'stories', 'digital', 'interface'],
  },

  // --- D. Anúncios, Ofertas, Promoções, Flyers & Conversão ---
  {
    slug: 'kittldesign/ads-designs',
    formats: ['single', 'story'],
    archetype: 'ad_conversion',
    priority: 10,
    keywords: ['anuncio', 'ad', 'ads', 'oferta', 'promocao', 'desconto', 'preco', 'cta', 'conversao', 'lancamento', 'vagas', 'vendas'],
  },
  {
    slug: 'behance/advertising',
    formats: ['single', 'collection'],
    archetype: 'ad_conversion',
    priority: 9,
    keywords: ['anuncio', 'advertising', 'campanha', 'publicidade', 'oferta', 'key visual', 'produto', 'marca', 'impacto'],
  },
  {
    slug: 'vismeapp/advertising-design-from-around-the-world-inspirati',
    formats: ['single'],
    archetype: 'ad_conversion',
    priority: 9,
    keywords: ['anuncio', 'advertising', 'campanha', 'criativo', 'oferta', 'vendas', 'conversao', 'comercial'],
  },
  {
    slug: 'vistacreate/black-friday-designs',
    formats: ['single', 'story', 'carousel'],
    archetype: 'ad_conversion',
    priority: 8,
    keywords: ['promocao', 'desconto', 'black friday', 'liquidacao', 'oferta', 'cupom', 'urgencia', 'ultimas vagas', 'preco', 'varejo'],
  },
  {
    slug: 'venngage/top-editable-flyer-templates',
    formats: ['single', 'story'],
    archetype: 'ad_conversion',
    priority: 8,
    keywords: ['flyer', 'panfleto', 'evento', 'oficina', 'curso', 'inauguracao', 'local', 'promocao', 'servico', 'agenda'],
  },
  {
    slug: 'piktochart/advertising-infographics',
    formats: ['single', 'carousel'],
    archetype: 'ad_conversion',
    priority: 7,
    keywords: ['anuncio', 'comparativo', 'beneficios', 'antes e depois', 'dados', 'prova', 'vendas'],
  },
  {
    slug: 'vistacreate/back-to-school-templates',
    formats: ['single', 'carousel', 'story'],
    archetype: 'social_post',
    priority: 8,
    keywords: ['educacao', 'escola', 'curso', 'aula', 'enem', 'vestibular', 'mentoria', 'estudantes', 'estudo', 'matematica', 'turma', 'matriculas'],
  },
  {
    slug: 'vistacreate/beauty',
    formats: ['single', 'collection', 'story'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['beleza', 'beauty', 'estetica', 'skincare', 'cosmetico', 'salao', 'maquiagem', 'autocuidado', 'bem-estar', 'spa', 'clinica'],
  },

  // --- E. Coleções Editoriais, Fotografia, Produto, Gastronomia & Moda ---
  {
    slug: 'itsnicethat/photography',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 9,
    keywords: ['fotografia', 'foto', 'editorial', 'colecao', 'ensaio', 'retrato', 'luz', 'natural', 'documental', 'autentico', 'bastidores'],
  },
  {
    slug: 'behance/photography',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['fotografia', 'foto', 'retrato', 'produto', 'colecao', 'ensaio', 'iluminacao', 'estudio'],
  },
  {
    slug: 'adobe/art-photography',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['fotografia', 'arte', 'cor', 'composicao', 'colecao', 'editorial', 'textura'],
  },
  {
    slug: 'thedieline/food-packaging',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 9,
    keywords: ['comida', 'gastronomia', 'food', 'doce', 'padaria', 'confeitaria', 'restaurante', 'artesanal', 'receita', 'alimento', 'cardapio'],
  },
  {
    slug: 'thedieline/beverage-packaging',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['bebida', 'cafe', 'cafeteria', 'cha', 'vinho', 'cerveja', 'drink', 'suco', 'bar', 'artesanal'],
  },
  {
    slug: 'thedieline/beauty-health-packaging',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 9,
    keywords: ['beleza', 'cosmetico', 'skincare', 'saude', 'suplemento', 'natural', 'organico', 'clinica', 'bem-estar', 'perfume'],
  },
  {
    slug: 'thedieline/sustainable-packaging',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['sustentavel', 'natural', 'organico', 'ecologico', 'artesanal', 'ceramica', 'terra', 'papel', 'feito a mao'],
  },
  {
    slug: 'behance/branding-packaging',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['produto', 'embalagem', 'd2c', 'ecommerce', 'branding', 'marca', 'loja', 'colecao'],
  },
  {
    slug: 'weandthecolor/packaging-design',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['produto', 'embalagem', 'cosmetico', 'bebida', 'd2c', 'design'],
  },
  {
    slug: 'thedieline/promotional-packaging',
    formats: ['single', 'collection'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['produto', 'edicao limitada', 'kit', 'presente', 'lancamento', 'varejo'],
  },
  {
    slug: '99designs/packaging-label-design',
    formats: ['single', 'collection'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['rotulo', 'embalagem', 'produto', 'pme', 'artesanal', 'comercial'],
  },
  {
    slug: 'kittldesign/product-label-designs',
    formats: ['single', 'collection'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['rotulo', 'produto', 'embalagem', 'cafe', 'cosmetico', 'artesanal', 'loja'],
  },
  {
    slug: 'creativemarket/mockups',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['mockup', 'produto', 'apresentacao', 'estudio', 'colecao', 'catalogo', 'vitrine'],
  },
  {
    slug: 'itsnicethat/fashion',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 8,
    keywords: ['moda', 'fashion', 'roupa', 'lookbook', 'colecao', 'estilo', 'editorial', 'acessorio', 'marca'],
  },
  {
    slug: 'behance/fashion-design',
    formats: ['collection', 'single'],
    archetype: 'product_photo',
    priority: 7,
    keywords: ['moda', 'fashion', 'colecao', 'lookbook', 'editorial', 'vestuario', 'campanha'],
  },

  // --- F. Infográficos, B2B, Consultoria & Conteúdo Educacional ---
  {
    slug: 'canva/canva-cheatsheets',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 9,
    keywords: ['cheatsheet', 'resumo', 'passo a passo', 'guia', 'checklist', 'mapa', 'estudo', 'enem', 'matematica', 'dicas', 'educativo', 'carrossel'],
  },
  {
    slug: 'piktochart/social-media-infographics',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 9,
    keywords: ['infografico', 'dados', 'estatistica', 'social', 'carrossel', 'educativo', 'comparativo', 'grafico', 'explicacao'],
  },
  {
    slug: 'hubspot/marketing-infographics',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 8,
    keywords: ['linkedin', 'b2b', 'infografico', 'funil', 'marketing', 'vendas', 'consultoria', 'framework', 'processo', 'estrategia'],
  },
  {
    slug: 'venngage/infographic-design',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 8,
    keywords: ['infografico', 'diagrama', 'fluxograma', 'processo', 'etapas', 'educativo', 'comparativo', 'b2b', 'consultoria'],
  },
  {
    slug: 'venngage/free-infographic-template',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['infografico', 'template', 'timeline', 'linha do tempo', 'lista', 'checklist', 'educacao'],
  },
  {
    slug: 'vismeapp/business-infographics',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 8,
    keywords: ['negocios', 'b2b', 'consultoria', 'gestao', 'financeiro', 'executivo', 'empresa', 'metricas', 'relatorio'],
  },
  {
    slug: 'vismeapp/artistic-infographics-design-inspiration',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 8,
    keywords: ['infografico', 'visual', 'ilustrado', 'editorial', 'explicativo', 'carrossel', 'educativo'],
  },
  {
    slug: 'vismeapp/charts-and-graphs-design-inspiration-education',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['grafico', 'dados', 'educacao', 'matematica', 'estatistica', 'comparacao', 'estudo'],
  },
  {
    slug: 'vismeapp/presentations',
    formats: ['carousel'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['slides', 'apresentacao', 'carrossel', 'deck', 'consultoria', 'b2b', 'palestra', 'aula'],
  },
  {
    slug: 'hubspot/inbound-hub-marketing',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['b2b', 'vendas', 'inbound', 'consultoria', 'comercial', 'marketing', 'linkedin'],
  },
  {
    slug: 'hubspot/templates-tools',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 6,
    keywords: ['framework', 'ferramenta', 'planilha', 'template', 'b2b', 'produtividade'],
  },
  {
    slug: 'latermedia/linkedin-strategies-tips',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['linkedin', 'b2b', 'carreira', 'autoridade', 'consultoria', 'profissional', 'lideranca'],
  },
  {
    slug: 'piktochart/best-of-piktochart-infographics',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 6,
    keywords: ['infografico', 'dados', 'resumo', 'visual', 'explicativo'],
  },
  {
    slug: 'piktochart/business-innovation-technology-infographics',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['tecnologia', 'inovacao', 'ia', 'saas', 'startup', 'digital', 'tech', 'b2b'],
  },
  {
    slug: 'piktochart/slide-templates',
    formats: ['carousel'],
    archetype: 'infographic_b2b',
    priority: 7,
    keywords: ['slides', 'carrossel', 'apresentacao', 'b2b', 'framework', 'aula'],
  },
  {
    slug: 'adobe/data-creativity',
    formats: ['carousel', 'single'],
    archetype: 'infographic_b2b',
    priority: 6,
    keywords: ['dados', 'visualizacao', 'criatividade', 'grafico', 'editorial'],
  },

  // --- G. Identidade Visual, Ilustração, Cores & Direção de Arte ---
  {
    slug: 'dribbble/branding-inspiration',
    formats: ['single', 'carousel', 'collection'],
    archetype: 'brand_identity',
    priority: 9,
    keywords: ['marca', 'branding', 'identidade', 'logo', 'paleta', 'sistema visual', 'campanha', 'startup', 'negocio'],
  },
  {
    slug: 'dribbble/design-inspiration',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['ui', 'card', 'bento', 'tech', 'saas', 'app', 'digital', 'moderno', 'dark'],
  },
  {
    slug: 'creativemarket/trends',
    formats: ['single', 'carousel', 'collection'],
    archetype: 'brand_identity',
    priority: 8,
    keywords: ['tendencia', 'visual', 'paleta', 'textura', 'estetica', 'atual', 'campanha'],
  },
  {
    slug: 'envato/color-psychology',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['cor', 'cores', 'paleta', 'psicologia', 'contraste', 'emocao', 'marca', 'harmonia'],
  },
  {
    slug: 'itsnicethat/graphic-design',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 8,
    keywords: ['design', 'grafico', 'editorial', 'identidade', 'cultura', 'arte', 'exposicao', 'livro', 'criativo'],
  },
  {
    slug: 'behance/best-of-behance',
    formats: ['single', 'collection', 'carousel'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['campanha', 'direcao de arte', 'editorial', 'design', 'criativo', 'inspiracao'],
  },
  {
    slug: 'behance/graphic-design',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 6,
    keywords: ['design', 'grafico', 'cartaz', 'editorial', 'identidade'],
  },
  {
    slug: 'weandthecolor/graphic-design',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 6,
    keywords: ['design', 'grafico', 'cor', 'editorial', 'layout'],
  },
  {
    slug: 'adobe/graphic-design',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 6,
    keywords: ['design', 'grafico', 'composicao', 'editorial'],
  },
  {
    slug: 'dribbble/illustration-inspiration',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 8,
    keywords: ['ilustracao', 'ilustrado', 'desenho', 'personagem', 'editorial', 'infantil', 'criativo', 'ludico'],
  },
  {
    slug: 'behance/illustration',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['ilustracao', 'desenho', 'arte', 'editorial', 'narrativa', 'artesanal'],
  },
  {
    slug: 'weandthecolor/illustration',
    formats: ['single', 'carousel'],
    archetype: 'brand_identity',
    priority: 7,
    keywords: ['ilustracao', 'desenho', 'cor', 'editorial', 'estilo'],
  },
];

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function tokenizeQuery(query: string): { text: string; words: Set<string> } {
  const text = normalizeText(query);
  const words = new Set((text.match(/[a-z0-9:]+/g) ?? []).filter(word => word.length >= 2));
  return { text, words };
}

function inferQueryFormats(text: string): PostFormat[] {
  const inferred: PostFormat[] = [];
  if (/\b(?:stor(?:y|ies)|reels?|9:16|vertical|enquete|caixinha)\b/.test(text)) inferred.push('story');
  if (/\b(?:carrossel|carrosseis|carousel|slides?|laminas?|passo a passo|guia|checklist|infografico)\b/.test(text)) inferred.push('carousel');
  if (/\b(?:colecao|colecoes|collection|ensaio|lookbook|galeria|fotografia|fotos|produto|embalagem)\b/.test(text)) inferred.push('collection');
  if (/\b(?:post unico|feed|anuncio|oferta|promocao|flyer|poster|cartaz)\b/.test(text)) inferred.push('single');
  return inferred;
}

/**
 * Selects a diverse set of live-verified curated Pinterest boards tailored to the active
 * post format, Portuguese/English intent terms, and Phoenix project affinities.
 */
export function selectCuratedPinterestBoards({
  query,
  postFormat,
  phoenixBoards = [],
  affinities = [],
  limit = 5,
}: {
  query: string;
  postFormat?: PostFormat;
  phoenixBoards?: readonly string[];
  affinities?: readonly BoardAffinityEntry[];
  limit?: number;
}): BoardSlug[] {
  const { text, words } = tokenizeQuery(query);
  const queryFormats = inferQueryFormats(text);
  const affinityByBoard = new Map(affinities.map(entry => [entry.board, entry.affinity_score]));
  const phoenixSet = new Set(phoenixBoards);

  const scored = CURATED_PINTEREST_CATALOG.map((entry, index) => {
    let score = entry.priority * 0.4;

    if (postFormat) {
      if (entry.formats[0] === postFormat) score += 5.0;
      else if (entry.formats.includes(postFormat)) score += 3.0;
      else score -= 1.5;
    }

    for (const fmt of queryFormats) {
      if (entry.formats[0] === fmt) score += 3.5;
      else if (entry.formats.includes(fmt)) score += 2.0;
    }

    let keywordHits = 0;
    for (const kw of entry.keywords) {
      const normKw = normalizeText(kw);
      const matched = normKw.includes(' ')
        ? text.includes(normKw)
        : words.has(normKw) || (normKw.length >= 4 && [...words].some(word => word.startsWith(normKw) || normKw.startsWith(word)));
      if (matched) keywordHits++;
    }
    score += Math.min(keywordHits, 5) * 2.6;

    const affinity = affinityByBoard.get(entry.slug);
    if (affinity !== undefined) {
      score += (affinity - 0.5) * 10;
    }

    if (phoenixSet.has(entry.slug)) {
      score += 1.2;
    }

    return { entry, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: BoardSlug[] = [];
  const usedAccounts = new Set<string>();
  const usedArchetypes = new Set<CuratedBoardArchetype>();

  // Pass 1: maximize account & archetype diversity among top-scoring boards
  for (const { entry } of scored) {
    if (selected.length >= limit) break;
    const account = entry.slug.split('/')[0] ?? entry.slug;
    if (usedAccounts.has(account)) continue;
    if (selected.length < 3 && usedArchetypes.has(entry.archetype) && !postFormat) continue;
    selected.push(entry.slug);
    usedAccounts.add(account);
    usedArchetypes.add(entry.archetype);
  }

  // Pass 2: fill any remaining slots by pure score if account diversity constrained the list
  for (const { entry } of scored) {
    if (selected.length >= limit) break;
    if (!selected.includes(entry.slug)) selected.push(entry.slug);
  }

  return selected;
}

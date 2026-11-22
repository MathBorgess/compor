export const POST_COLLECTION_SKILL = Object.freeze({
  id: 'colecao-editorial.v1',
  version: '2.0.0',
  format: 'collection',
  chat: [
    'Skill colecao-editorial.v1 (Coleção Editorial · 2 a 10 fotos · 4:5 Instagram):',
    '1. Distinção essencial: uma Coleção NÃO é um carrossel didático cheio de texto. É uma série visual/fotográfica coesa (2 a 10 imagens, padrão 3) que compartilha atmosfera, direção de luz, paleta/color grade, textura e universo/sujeito — como um ensaio editorial ou photo dump curado.',
    '2. Cadência deliberada de planos: use compor_definir_plano_laminas para mapear o papel visual de cada foto variando escala e ponto de vista (ex.: Foto 1 abertura/contexto ou gancho editorial → Foto 2 detalhe/textura ou produto em foco → Foto 3 uso humano/bastidor ou fechamento). Nunca repita o mesmo enquadramento.',
    '3. Texto comedido com evento inequívoco: na Foto 1, use título editorial curto apenas se servir ao objetivo; sempre que houver data, horário ou condição ligada ao objetivo, acompanhe-a de 1 a 3 palavras neutras que explicitem o que acontece naquele momento (preservando o tom calmo/editorial do perfil, sem linguagem promocional agressiva). Nas fotos internas (2..N), priorize fotografia pura com texto mínimo ou ausente, e use a legenda para aprofundar a atmosfera e fechar o objetivo/próximo passo com clareza.',
    '4. Fluxo Âncora → Série: valide o plano de cenas, gere a Foto 1 (frameIndex=1) como âncora estética (luz, paleta, granulação/grade e sujeito) e, após validação/pedido explícito, gere as Fotos 2..N ancoradas na Foto 1 para garantir unidade real de campanha.',
  ].join(' '),
  planner: [
    'Formato collection 4:5 (1024x1280): proponha três direções estéticas de abertura de série fotográfica/editorial (luz, color grade, sujeito/universo e enquadramento replicáveis em coleção de 2+ fotos, com texto mínimo e evento explícito quando houver data/horário).',
  ].join(' '),
});

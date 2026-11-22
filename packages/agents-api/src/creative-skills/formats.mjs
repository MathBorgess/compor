export const POST_FORMATS = Object.freeze(['single', 'carousel', 'collection', 'story']);

export const FORMAT_SPECS = Object.freeze({
  single: Object.freeze({
    id: 'single',
    label: 'Post único',
    aspectRatio: '4:5',
    imageSize: '1024x1280',
    minFrames: 1,
    maxFrames: 1,
    defaultFrames: 1,
    multiFrame: false,
    safeZonePrompt: 'Use formato retrato 4:5 (1024x1280). Mantenha título, sujeito principal e dados obrigatórios dentro da zona segura central 3:4 do grid do perfil, com topo (5%) e base (12%) livres.',
  }),
  carousel: Object.freeze({
    id: 'carousel',
    label: 'Carrossel',
    aspectRatio: '4:5',
    imageSize: '1024x1280',
    minFrames: 3,
    maxFrames: 10,
    defaultFrames: 5,
    multiFrame: true,
    safeZonePrompt: 'Use formato retrato 4:5 (1024x1280) para carrossel do Instagram. Preserve margens seguras amplas (laterais ~8%, topo ~8%, base ~12% livre para indicadores de páginas) e garanta leitura confortável a 360 px.',
  }),
  collection: Object.freeze({
    id: 'collection',
    label: 'Coleção',
    aspectRatio: '4:5',
    imageSize: '1024x1280',
    minFrames: 2,
    maxFrames: 10,
    defaultFrames: 3,
    multiFrame: true,
    safeZonePrompt: 'Use formato retrato 4:5 (1024x1280) para coleção editorial de fotos do Instagram. Enquadre o sujeito com respiro nas bordas (zona central 3:4 protegida) e mantenha a mesma luz, paleta e textura entre todas as fotos da série.',
  }),
  story: Object.freeze({
    id: 'story',
    label: 'Story',
    aspectRatio: '9:16',
    imageSize: '864x1536',
    minFrames: 1,
    maxFrames: 1,
    defaultFrames: 1,
    multiFrame: false,
    safeZonePrompt: 'Use formato vertical 9:16 (864x1536) para Instagram Stories / vertical TikTok. Mantenha os 15% superiores, os 25% inferiores e a faixa lateral direita livres de texto crítico ou logotipos. Deixe espaço limpo para figurinhas ou link nativos sem desenhar botões clicáveis falsos.',
  }),
});

export function isPostFormat(value) {
  return typeof value === 'string' && POST_FORMATS.includes(value);
}

export function normalizePostFormat(value) {
  return isPostFormat(value) ? value : 'single';
}

export function formatSpec(value) {
  return FORMAT_SPECS[normalizePostFormat(value)];
}

export function formatImageSize(value) {
  return formatSpec(value).imageSize;
}

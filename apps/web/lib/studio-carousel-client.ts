import {sha256Hex} from './browser-bytes.ts';
import {carouselPlanJson} from './carousel-plan-json.ts';
import {versionImageIdForName} from './piece-version-image.ts';
import {carouselRenderSchema, type CarouselRender} from './studio-carousel-contract.ts';
import type {PieceContent} from './studio-domain.ts';

const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const profile = 'compor-carousel-jpeg-4x5.v1';
const record = (value:unknown):value is Record<string,unknown> =>
  value!==null && typeof value==='object' && !Array.isArray(value);

export function carouselPlanFor(content: PieceContent) {
  const {carouselPlan,frames,caption} = content;
  if (!carouselPlan || content.format !== 'carousel' || !frames || frames.length !== carouselPlan.slides.length) return null;
  const slides = [];
  for (const frame of [...frames].sort((a,b)=>a.position-b.position)) {
    const recipe = carouselPlan.slides.find(slide=>slide.frameId===frame.id);
    if (!recipe) return null;
    const {frameId:id,...visual}=recipe;
    slides.push({...visual,id,headline:frame.headline,...(frame.body?{body:frame.body}:{})});
  }
  return {...carouselPlan,slides,caption};
}

export function carouselPreviewId(frameId: string, sha256: string) {
  return versionImageIdForName('compor-carousel-preview/' + frameId + '/' + sha256);
}

// The storage kind separates source artwork and composed previews.
export const carouselArtId = carouselPreviewId;

export function carouselCopyForChat(content: PieceContent | undefined): PieceContent | null {
  const plan=content?.carouselPlan;
  if (!content || !plan) return content ?? null;
  return {...content,carouselPlan:{...plan,slides:plan.slides.map(({artSha256: _artSha256,...slide})=>slide)}};
}

export type ComposedCarousel = {
  receipt: CarouselRender;
  images: {frameId:string;file:Blob;sha256:string}[];
};

class CarouselQualityError extends Error {}

function rejectionNotice(data: unknown, slideCount: number) {
  const fallback = 'Revise os textos e o plano das lâminas antes de compor novamente.';
  if (!record(data)) return fallback;
  if (data.error === 'archive_too_large') {
    return 'O carrossel composto ultrapassou o limite do ZIP. Simplifique a arte ou reduza o número de lâminas.';
  }
  if ((data.error !== 'invalid_plan' && data.error !== 'quality_held') || !Array.isArray(data.checks)) return fallback;
  for (const check of data.checks) {
    if (!record(check)) continue;
    if (check.id === 'CAPTION_BUDGET') return 'Encurte a legenda ou limite as hashtags a cinco antes de compor.';
    const {index} = check;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > slideCount) continue;
    const position = `Na lâmina ${index}, `;
    switch (check.id) {
      case 'HEADLINE': return position + 'preencha a manchete.';
      case 'HEADLINE_BUDGET': return position + (index === 1
        ? 'encurte a manchete para até 11 palavras e 65 caracteres.'
        : 'encurte a manchete para até 12 palavras.');
      case 'BODY_BUDGET': return position + 'reduza o corpo do texto a até 50 palavras e 480 caracteres.';
      case 'S2_DEPENDENT_OPEN': return position + 'dê contexto à manchete para ela funcionar sozinha.';
      case 'LAYOUT_OVERFLOW': case 'TEXT_COLLISION': case 'SAFE_ZONE': case 'TYPOGRAPHY':
        return position + 'encurte os textos ou escolha um layout com mais espaço.';
      case 'TEXT_CONTRAST': return position + 'troque a cor ou a imagem de fundo para dar mais contraste ao texto.';
      case 'ASSET_DECODE': return position + 'confira o arquivo da arte ou tente compor novamente.';
    }
  }
  return fallback;
}

export function carouselCompositionNotice(error: unknown) {
  if (error instanceof CarouselQualityError) return error.message;
  switch (error instanceof Error ? error.message : '') {
    case 'carousel_art_missing': return 'Anexe novamente a arte da lâmina no estúdio para compor neste navegador.';
    case 'carousel_art_too_large': return 'Reduza o tamanho dos arquivos de arte para compor.';
    case 'carousel_renderer_busy': return 'O compositor está ocupado. Tente novamente em instantes.';
    default: return 'Não foi possível concluir a composição. Confira o plano ou tente novamente.';
  }
}

export async function composeCarousel(
  projectId: string,
  plan: NonNullable<ReturnType<typeof carouselPlanFor>>,
  signal: AbortSignal,
  loadArt?: (frameId: string, sha256: string) => Promise<Blob | null>,
  fetchImpl = fetch,
) {
  const planSha256 = await sha256Hex(carouselPlanJson(plan));
  const json=JSON.stringify({projectId,plan});
  const form=plan.slides.some(slide=>slide.artSha256!==undefined)?new FormData():null;
  const headers: Record<string, string> = {accept:'multipart/form-data'};
  if (form) {
    form.set('request',json);
    let bytes=new TextEncoder().encode(json).byteLength;
    for (const {id,artSha256} of plan.slides) {
      if (artSha256===undefined) continue;
      const file=await loadArt?.(id,artSha256);
      signal.throwIfAborted();
      if (!file?.size) throw Error('carousel_art_missing');
      bytes+=file.size;
      if (bytes>=MAX_ARCHIVE_BYTES) throw Error('carousel_art_too_large');
      if (await sha256Hex(await file.arrayBuffer())!==artSha256) throw Error('carousel_art_missing');
      form.set('art:'+id,file,'art');
    }
  } else headers['content-type']='application/json';
  const response = await fetchImpl('/api/studio/carousel/render', {
    method:'POST', headers, body:form??json, signal, cache:'no-store',
  });
  if (response.status===413) throw Error('carousel_art_too_large');
  if (response.status===422) {
    const data: unknown = await response.json().catch(() => null);
    throw new CarouselQualityError(rejectionNotice(data, plan.slides.length));
  }
  if (response.status===429) throw Error('carousel_renderer_busy');
  if (!response.ok || !response.headers.get('content-type')?.startsWith('multipart/form-data;') ||
    Number(response.headers.get('content-length'))>MAX_ARCHIVE_BYTES) throw Error('carousel_unavailable');
  const parts=await response.formData();
  const manifest=parts.get('qa-manifest.json');
  if (!(manifest instanceof Blob) || manifest.size>100_000) throw Error('carousel_receipt_invalid');
  const data:unknown=JSON.parse(await manifest.text());
  if (!record(data) || data.profile!==profile || data.assessment!=='physical_only' || data.planSha256!==planSha256 ||
    !record(data.final) || !Array.isArray(data.final.slides) || data.final.slides.length!==plan.slides.length ||
    !data.final.slides.every(record)) throw Error('carousel_receipt_invalid');
  const panels:Record<string,unknown>[]=data.final.slides;
  const receipt = carouselRenderSchema.parse({
    planSha256, frames: plan.slides.map(({id,alt},index)=>({frameId:id,alt,sha256:panels[index].sha256})),
  });
  const images=await Promise.all(receipt.frames.map(async(frame,index)=>{
    const panel = panels[index];
    const requestedArt=plan.slides[index].artSha256;
    if (requestedArt&&(!record(panel.artSource)||panel.artSource.sha256!==requestedArt)) throw Error('carousel_receipt_invalid');
    const name='slide-'+String(index+1).padStart(2,'0')+'.jpg';
    const jpeg=parts.get(name);
    if (panel.id!==frame.frameId || panel.index!==index+1 || panel.file!==name || !(jpeg instanceof Blob) ||
      jpeg.type!=='image/jpeg' || !jpeg.size || jpeg.size!==panel.bytes || jpeg.size>MAX_ARCHIVE_BYTES ||
      await sha256Hex(await jpeg.arrayBuffer())!==frame.sha256) throw Error('carousel_receipt_invalid');
    return {frameId:frame.frameId,sha256:frame.sha256,file:jpeg};
  }));
  return {receipt,images} satisfies ComposedCarousel;
}

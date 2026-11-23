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

export type ComposedCarousel = {
  receipt: CarouselRender;
  images: {frameId:string;file:Blob;sha256:string}[];
};

export async function composeCarousel(projectId: string, plan: NonNullable<ReturnType<typeof carouselPlanFor>>, signal: AbortSignal) {
  const planSha256 = await sha256Hex(carouselPlanJson(plan));
  const response = await fetch('/api/studio/carousel/render', {
    method:'POST', headers:{'content-type':'application/json',accept:'multipart/form-data'}, body:JSON.stringify({projectId,plan}), signal, cache:'no-store',
  });
  if (response.status===422) throw Error('carousel_quality_held');
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
    const name='slide-'+String(index+1).padStart(2,'0')+'.jpg';
    const jpeg=parts.get(name);
    if (panel.id!==frame.frameId || panel.index!==index+1 || panel.file!==name || !(jpeg instanceof Blob) ||
      jpeg.type!=='image/jpeg' || !jpeg.size || jpeg.size!==panel.bytes || jpeg.size>MAX_ARCHIVE_BYTES ||
      await sha256Hex(await jpeg.arrayBuffer())!==frame.sha256) throw Error('carousel_receipt_invalid');
    return {frameId:frame.frameId,sha256:frame.sha256,file:jpeg};
  }));
  return {receipt,images} satisfies ComposedCarousel;
}

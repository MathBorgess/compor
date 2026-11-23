import * as z from './schema.ts';
import {isCarouselSlideComposition,isCarouselCompositionTokens,type CarouselSlideComposition,
  type CarouselCompositionTokens} from '@compor/agents-api/studio-chat-tools';

const uuid = z.string().check(z.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
const digest = z.string().check(z.regex(/^[a-f0-9]{64}$/));
const alt = z.string().check(z.maxLength(350),z.refine(value =>
  Boolean(value.trim())&&!/[\u0000-\u001f\u007f]|sk-[^\s]+/i.test(value)));

type Slide = CarouselSlideComposition & {frameId:string;artSha256?:string};
function isSlide(value:unknown):value is Slide {
  if (!value || typeof value!=='object' || Array.isArray(value) || !('frameId' in value))return false;
  const {frameId,...slots}=value;
  const {artSha256,...recipe}=slots as Record<string,unknown>;
  return uuid.safeParse(frameId).success&&isCarouselSlideComposition(recipe)&&
    (artSha256===undefined||(digest.safeParse(artSha256).success&&recipe.diagram===undefined&&recipe.layout!=='cta_closing'));
}
const slide = z.pipe(z.unknown().check(z.refine(isSlide)),z.transform(value=>value as Slide));
const tokens = z.pipe(z.unknown().check(z.refine(isCarouselCompositionTokens)),z.transform(value=>value as CarouselCompositionTokens));
export const carouselPlanSchema = z.strictObject({
  mode: z.enum(['editorial_art', 'native_serial']),
  tokens: z.optional(tokens),
  slides: z.array(slide).check(z.minLength(3),z.maxLength(10)),
});

export const carouselRenderSchema = z.strictObject({
  planSha256: digest,
  frames: z.array(z.strictObject({frameId:uuid,sha256:digest,alt})).check(z.minLength(3),z.maxLength(10)),
});
export type CarouselPlan = z.infer<typeof carouselPlanSchema>;
export type CarouselRender = z.infer<typeof carouselRenderSchema>;

export function carouselMatchesFrames(content: {
  format?: string;
  frames?: readonly {id:string;position:number;assetId:string|null}[];
  carouselPlan?: CarouselPlan;
  carouselRender?: CarouselRender;
}) {
  const {format,frames,carouselPlan,carouselRender}=content;
  if (!carouselPlan) return carouselRender === undefined;
  if (format !== 'carousel' || !frames || frames.length !== carouselPlan.slides.length) return false;
  const ids = new Set(frames.map(frame=>frame.id));
  if (new Set(carouselPlan.slides.map(slide=>slide.frameId)).size !== ids.size ||
      carouselPlan.slides.some(slide=>!ids.has(slide.frameId))) return false;
  if (!carouselRender) return frames.every(frame=>frame.assetId===null);
  return carouselRender.frames.length===frames.length && carouselRender.frames.every((render,index)=>{
    const slide = carouselPlan.slides.find(slide=>slide.frameId===render.frameId);
    return slide?.alt===render.alt && frames.some(frame=>frame.id===render.frameId&&frame.position===index+1);
  });
}

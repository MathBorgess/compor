import * as z from './schema.ts';
import { boardSlugSchema } from './phoenix/catalog.ts';

export const pinOriginSchema = z.string().check(z.maxLength(300)).check(z.refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.pinterest.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/pin\/[A-Za-z0-9_-]{1,160}\/$/.test(url.pathname); } catch { return false; }
}));
export const pinPreviewSchema = z.string().check(z.maxLength(1000)).check(z.refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'i.pinimg.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/[a-zA-Z0-9_./%-]+\.(?:jpe?g|png)$/i.test(url.pathname); } catch { return false; }
}));
export const exploredReferenceSchema = z.strictObject({ id: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,160}$/)), title: z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(300)), board: boardSlugSchema, originUrl: pinOriginSchema, previewUrl: pinPreviewSchema });
export type ExploredReference = z.infer<typeof exploredReferenceSchema>;
export const referenceSearchResponseSchema = z.strictObject({ status: z.enum(['ok','empty','unavailable']), references: z.array(exploredReferenceSchema).check(z.maxLength(12)) });
export const referenceHistoryEntrySchema = z.extend(exploredReferenceSchema,{approvedVersions:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(2147483647)),selectedAt:z.iso.datetime({offset:true})});
export type ReferenceHistoryEntry = z.infer<typeof referenceHistoryEntrySchema>;
export const referenceHistoryResponseSchema = z.strictObject({references:z.array(referenceHistoryEntrySchema).check(z.maxLength(100))});
const signalShape = {id:z.uuid(),projectId:z.uuid(),pieceId:z.optional(z.uuid()),originUrl:pinOriginSchema,board:boardSlugSchema,action:z.enum(['selected','rejected','comment']),comment:z.string().check(z.trim()).check(z.maxLength(1000)),supersedes:z.nullable(z.uuid()),reference:z.optional(exploredReferenceSchema)};
function validSignal(value:z.infer<z.ZodMiniObject<typeof signalShape>>,ctx:z.core.$RefinementCtx<z.infer<z.ZodMiniObject<typeof signalShape>>>) {
  if(value.action==='comment' && !value.comment)ctx.addIssue({code:'custom',message:'Comentário vazio'});
  if(value.reference && (value.action!=='selected'||value.reference.originUrl!==value.originUrl||value.reference.board!==value.board||value.reference.originUrl!==`https://www.pinterest.com/pin/${value.reference.id}/`))ctx.addIssue({code:'custom',message:'Referência não corresponde à seleção'});
}
export const referenceSignalInputSchema=z.strictObject(signalShape).check(z.superRefine(validSignal));
export const referenceSignalSchema=z.strictObject({...signalShape,createdAt:z.iso.datetime({offset:true})}).check(z.superRefine(validSignal));
export type ReferenceSignal = z.infer<typeof referenceSignalSchema>;
export const referenceSignalsResponseSchema = z.strictObject({ signals: z.array(referenceSignalSchema).check(z.maxLength(500)) });
export function currentReferenceFeedback(signals:ReferenceSignal[]) {
  const superseded=new Set(signals.map(item=>item.supersedes).filter(value=>value!==null));
  const seen=new Set<string>();
  return [...signals].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).filter(item=>{
    if(superseded.has(item.id))return false;
    if(item.action==='comment')return Boolean(item.comment);
    if(seen.has(item.originUrl))return false;
    seen.add(item.originUrl);return true;
  }).slice(0,4).map(item=>({action:item.action,comment:item.comment.replace(/\s+/g,' ').slice(0,200),composition:`Referência Pinterest: ${item.board}`.slice(0,80),contrast:''}));
}

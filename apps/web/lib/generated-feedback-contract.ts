import { z } from 'zod';
const safeText=z.string().trim().max(1000).refine(value=>!/[\u0000-\u0008\u000b-\u001f\u007f]|sk-[^\s]+/i.test(value));
export const explorationPlanSchema=z.strictObject({composition:safeText.min(1).max(300),contrast:safeText.min(1).max(300)});
export const generatedSignalInputSchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),imageId:z.uuid(),action:z.enum(['selected','rejected','comment']),comment:safeText,supersedes:z.uuid().nullable()}).superRefine((value,ctx)=>{if(value.action==='comment'&&!value.comment)ctx.addIssue({code:'custom',message:'Comentário vazio'});});
export const generatedSignalSchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),imageId:z.uuid(),action:z.enum(['selected','rejected','comment']),comment:safeText,supersedes:z.uuid().nullable(),createdAt:z.iso.datetime({offset:true}),plan:explorationPlanSchema.nullable()});
export const generatedSignalsSchema=z.strictObject({signals:z.array(generatedSignalSchema).max(500)});
export type GeneratedSignal=z.infer<typeof generatedSignalSchema>;
export type ExplorationPlan=z.infer<typeof explorationPlanSchema>;
export function currentGeneratedFeedback(signals:GeneratedSignal[]) {
  const superseded=new Set(signals.map(item=>item.supersedes).filter(value=>value!==null));
  const seen=new Set<string>();
  return [...signals].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).filter(item=>{
    if(superseded.has(item.id))return false;
    if(item.action==='comment')return true;
    if(seen.has(item.imageId))return false;
    seen.add(item.imageId);return true;
  }).slice(0,4).map(item=>({action:item.action,comment:item.comment.replace(/\s+/g,' ').slice(0,200),composition:item.plan?.composition.replace(/\s+/g,' ').slice(0,80)??'',contrast:item.plan?.contrast.replace(/\s+/g,' ').slice(0,80)??''}));
}

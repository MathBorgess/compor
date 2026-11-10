import { z } from 'zod';
import { pinOriginSchema } from './reference-exploration-contract.ts';
import { boardSlugSchema } from './phoenix/catalog.ts';

const id = z.string();
const creativeFieldText = (limit:number) => z.string().max(limit).refine(value => !/[\u0000-\u001f\u007f]/.test(value) && !/sk-[^\s]+/i.test(value));
export const creativeFieldSchema = z.strictObject({id:z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),label:creativeFieldText(80).refine(value=>value.trim().length>0),value:creativeFieldText(500),origin:z.enum(['user','agent'])});
export type CreativeField = z.infer<typeof creativeFieldSchema>;
export const pieceContentSchema = z.strictObject({headline:z.string(),price:z.string(),date:z.string(),caption:z.string(),captionOrigin:z.enum(['user','agent']),fields:z.array(creativeFieldSchema).max(20).refine(fields=>new Set(fields.map(field=>field.id.toLowerCase())).size===fields.length).optional()});
export type PieceContent = z.infer<typeof pieceContentSchema>;
export const approvalSchema = z.union([z.strictObject({status:z.literal('unapproved')}),z.strictObject({status:z.literal('approved'),kind:z.enum(['explicit','inherited']),sourceVersion:z.number(),at:z.string()})]);
export type Approval = z.infer<typeof approvalSchema>;
export const draftContextSchema = z.strictObject({pieceId:id,baseVersion:z.number(),expectedLatestVersion:z.number()});
export type DraftContext = z.infer<typeof draftContextSchema>;
export const draftSchema = draftContextSchema.extend({content:pieceContentSchema,dirty:z.boolean(),approval:approvalSchema});
export type StudioDraft = z.infer<typeof draftSchema>;
export type Draft = StudioDraft;
export const referenceSourceSchema = z.union([
  z.strictObject({originUrl:pinOriginSchema,board:boardSlugSchema,title:z.string().trim().min(1).max(300).optional()}),
  z.strictObject({kind:z.literal('generated'),projectId:z.string().uuid(),imageId:z.string().uuid(),ordinal:z.number().int().positive().optional()}),
]);
export const referenceSchema = z.strictObject({id,name:z.string(),mime:z.enum(['image/png','image/jpeg']),size:z.number(),width:z.number(),height:z.number(),source:referenceSourceSchema.optional()});
export type StudioReference = z.infer<typeof referenceSchema>;
export type Reference = StudioReference;
const markBase={id,pieceId:id,baseVersion:z.number(),note:z.string()};
export const markSchema=z.discriminatedUnion('kind',[z.strictObject({...markBase,kind:z.literal('area'),x:z.number(),y:z.number(),width:z.number(),height:z.number()}),z.strictObject({...markBase,kind:z.literal('element'),elementId:z.string()})]);
export type StudioMark=z.infer<typeof markSchema>;
export type Mark=StudioMark;
export const creativeExampleSchema=z.strictObject({description:z.string(),referenceId:id.nullable()});
export const criterionSchema=z.strictObject({id,viewpoint:z.enum(['creator','recipient']),dimension:z.enum(['visual','message']),statement:z.string(),example:creativeExampleSchema,counterexample:creativeExampleSchema,provenance:z.enum(['hypothesis','creator_report','buyer_report','public_source']),source:z.string(),tension:z.string()});
export type CreativeCriterion=z.infer<typeof criterionSchema>;
export const decisionSchema=z.strictObject({id,criterionId:id,choice:z.enum(['accept','reject','reopen']),reason:z.string(),at:z.string()});
export type CreativeDecision=z.infer<typeof decisionSchema>;
export const directionSchema=z.strictObject({criteria:z.array(criterionSchema),decisions:z.array(decisionSchema)});
export type CreativeDirection=z.infer<typeof directionSchema>;
export const personaSchema=z.strictObject({audience:z.string(),situation:z.string(),need:z.string(),culturalReferences:z.string(),claims:z.array(z.strictObject({id,text:z.string(),provenance:z.enum(['hypothesis','creator_report','buyer_report','public_source','unknown']),source:z.string()}))});
export type Persona=z.infer<typeof personaSchema>;
export const briefSchema=z.strictObject({offer:z.string(),audience:z.string(),action:z.string(),direction:z.string()});
export type Brief=z.infer<typeof briefSchema>;
export const requestStatusSchema=z.enum(['pending','in_progress','consent_required','completed','failed','unknown']);
export type RequestStatus=z.infer<typeof requestStatusSchema>;
export const messageSchema=z.strictObject({id,role:z.enum(['user','assistant','system']),text:z.string(),createdAt:z.string(),context:draftContextSchema.nullable(),status:requestStatusSchema});
export type StudioMessage=z.infer<typeof messageSchema>;
export const adjustmentContextSchema=draftContextSchema.extend({projectId:id,instruction:z.string(),marks:z.array(markSchema),references:z.array(referenceSchema),approval:approvalSchema,direction:directionSchema.optional()});
export type AdjustmentContext=z.infer<typeof adjustmentContextSchema>;
export const adjustmentResultSchema=z.strictObject({messageId:id.optional(),text:z.string().optional(),assetId:id.optional()});
export type AdjustmentResult=z.infer<typeof adjustmentResultSchema>;
export const adjustmentSchema=z.strictObject({id,messageId:id,createdAt:z.string(),status:requestStatusSchema,context:adjustmentContextSchema,result:adjustmentResultSchema.optional()});
export type Adjustment=z.infer<typeof adjustmentSchema>;
export const eventSchema=z.strictObject({id,type:z.enum(['context_frozen','operation_in_progress','action_required','operation_completed','operation_failed','outcome_unknown','version_saved','approval_explicit']),requestId:id.nullable(),sequence:z.number()});
export type StudioEvent=z.infer<typeof eventSchema>;
export const actionResultSchema=z.strictObject({status:z.enum(['completed','declined','unknown','pending_confirmation']),revision:z.number().optional(),projectId:id.optional(),pieceId:id.nullable().optional(),baseVersion:z.number().nullable().optional(),expectedLatestVersion:z.number().optional(),version:z.number().optional(),unsaved:z.boolean().optional(),local:z.boolean().optional(),title:z.string().optional(),feedbackStatus:z.enum(['recorded','ambiguous','quote_not_found','reference_unavailable']).optional()});
export type ActionResult=z.infer<typeof actionResultSchema>;
export const actionReceiptSchema=z.strictObject({requestId:id,fingerprint:z.string(),result:actionResultSchema});
export type ActionReceipt=z.infer<typeof actionReceiptSchema>;
export const studioStateSchema=z.strictObject({schemaVersion:z.literal(1),userId:id,projectId:id,revision:z.number(),projectTitleProvisional:z.boolean().default(false),brief:briefSchema,persona:personaSchema,selection:z.strictObject({pieceId:id,baseVersion:z.number()}).nullable(),drafts:z.array(draftSchema),messages:z.array(messageSchema),marks:z.array(markSchema),references:z.array(referenceSchema),adjustments:z.array(adjustmentSchema),events:z.array(eventSchema),actionReceipts:z.array(actionReceiptSchema).default([]),direction:directionSchema.default({criteria:[],decisions:[]})});
export type StudioState=z.infer<typeof studioStateSchema>;
export type StudioScope=Pick<StudioState,'userId'|'projectId'>;
export interface StoredImage {file:Blob;metadata?:unknown}

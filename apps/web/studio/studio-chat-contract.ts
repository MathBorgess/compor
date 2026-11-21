import * as z from '../lib/schema.ts';
import type { ImageProposal } from '@compor/agents-api/image-proposal';
import type { prepareArtworkInput, ArtworkConversion } from '../lib/studio-artwork-input';
import type {SelectedVisualInput} from '../lib/selected-visual-input';
type ArtworkInput=Awaited<ReturnType<typeof prepareArtworkInput>>;

const usageSchema=z.object({input_tokens:z.optional(z.nullable(z.number())),output_tokens:z.optional(z.nullable(z.number()))});
const traceSchema=z.object({functionCalls:z.optional(z.number()),outputs:z.optional(z.number()),omittedItems:z.optional(z.number()),items:z.optional(z.array(z.object({type:z.string(),schemaValid:z.optional(z.boolean()),errorClass:z.optional(z.string())})))});
const closureReasonSchema=z.enum(['provider_rejected_400','provider_rejected_429','result_unknown']);
const providerOutcomeSchema=z.enum(['failure','retryable','unconfirmed']);
const common=z.object({error:z.optional(z.string()),errorCode:z.optional(z.string()),failurePhase:z.optional(z.string()),requestId:z.optional(z.string()),usage:z.optional(z.nullable(usageSchema)),itemTrace:z.optional(traceSchema),assetId:z.optional(z.string()),closureReason:z.optional(closureReasonSchema),providerOutcome:z.optional(providerOutcomeSchema),retryAutomatically:z.optional(z.literal(false))});
const imageQualityReasonSchema=z.enum(['image_quality_rejected','image_quality_inconclusive']);
export const chatResponseSchema=z.discriminatedUnion('status',[
 // reply stays unknown here: lib/studio-quick-replies validates it and falls back to text.
 z.extend(common,{status:z.literal('completed'),text:z.optional(z.string()),reply:z.optional(z.unknown())}),
 z.extend(common,{status:z.literal('consent_required'),prompt:z.string(),proposal:z.optional(z.unknown()),attemptId:z.string(),imageActionId:z.optional(z.uuid()),actionBinding:z.string(),declineBinding:z.optional(z.string()),visualInputRequired:z.optional(z.literal(true))}),
 z.extend(common,{status:z.literal('action_required'),action:z.object({name:z.string(),args:z.unknown()}),actionBinding:z.string()}),
 z.extend(common,{status:z.literal('quality_held'),qualityReason:imageQualityReasonSchema,retryAutomatically:z.literal(false)}).check(z.refine(value=>value.assetId===undefined)),
 z.extend(common,{status:z.enum(['running','failed','unknown','accepted'])}),
]);
export const errorResponseSchema=z.extend(common,{status:z.optional(z.string())});
export const defaultCredentialNotSubmittedSchema=z.strictObject({status:z.literal('failed'),error:z.literal('default_credential_unavailable'),failurePhase:z.literal('before_submission'),requestId:z.string().check(z.uuid()),retryAutomatically:z.literal(false)});
export type ChatResponse=z.infer<typeof chatResponseSchema>;
export const pendingInspectionSchema=z.strictObject({status:z.enum(['running','action_required','completed','failed','unknown']),retryAutomatically:z.literal(false),error:z.optional(z.literal('provider_usage_limit'))}).check(z.refine(value=>value.error===undefined||value.status==='failed'));
export const closedImageResponseSchema=z.union([
 z.strictObject({status:z.literal('confirmed'),outcome:z.optional(z.enum(['failed_without_dispatch','failed_image_attempt']))}),
 z.strictObject({status:z.literal('confirmed'),outcome:z.literal('quality_held'),qualityReason:imageQualityReasonSchema}),
]);
export type PendingInspection=z.infer<typeof pendingInspectionSchema>;
export type Usage=z.infer<typeof usageSchema>;
export const imageContextSchema=z.object({pieceId:z.string(),baseVersion:z.number().check(z.int())});
export type ImageContext=z.infer<typeof imageContextSchema>;
export const receiptSchema=z.strictObject({userId:z.string(),projectId:z.string(),requestId:z.string(),pieceId:z.string(),version:z.number().check(z.int()),assetId:z.string()});
export type ImageReceipt=z.infer<typeof receiptSchema>;
export const chatMarkerSchema=z.object({requestId:z.nullable(z.string()),previousAttemptKey:z.optional(z.nullable(z.string())),credentialSource:z.optional(z.enum(['default','byok'])),imageContext:z.optional(z.nullable(imageContextSchema)),imageReceipt:z.optional(z.nullable(receiptSchema)),imageProtocolVersion:z.optional(z.literal([1,2]))});
export const preparedImageTargetSchema=z.strictObject({
  actionId:z.uuid(),
  pieceId:z.uuid(),
  sourceVersion:z.int().check(z.minimum(0),z.maximum(2147483647)),
  version:z.int().check(z.minimum(1),z.maximum(2147483647)),
  artworkDigest:z.string().check(z.regex(/^[a-f0-9]{64}$/)),
}).check(z.refine(value=>value.version>=value.sourceVersion));
export type PreparedImageTarget=z.infer<typeof preparedImageTargetSchema>;
export type ImageAction=Extract<ChatResponse,{status:'consent_required'}>&{proposal:ImageProposal;artworkInput:ArtworkInput|null;inputError:string;requestId:string;context:ImageContext&{headline:string};preparedTarget?:PreparedImageTarget;canPrepareTransport:boolean;conversions:readonly ArtworkConversion[];sourceFingerprint:string|null;visualSnapshot?:SelectedVisualInput};
export type Inspection={status:'completed'|'failed'|'running'|'action_required'|'consent_required'|'unknown'|'unavailable';authenticationRejected?:boolean;usage:{input_tokens:number|null;output_tokens:number|null}|null;technical:{functionCalls:number|null;outputs:number|null;omittedItems:number|null;validSchemas:number;invalidSchemas:number;errorClasses:string[]}|null};

import { z } from 'zod';
import type { ImageProposal } from '@compor/agents-api/image-proposal';
import type { prepareArtworkInput, ArtworkConversion } from '../lib/studio-artwork-input';
type ArtworkInput=Awaited<ReturnType<typeof prepareArtworkInput>>;

const usageSchema=z.object({input_tokens:z.number().nullable().optional(),output_tokens:z.number().nullable().optional()});
const traceSchema=z.object({functionCalls:z.number().optional(),outputs:z.number().optional(),omittedItems:z.number().optional(),items:z.array(z.object({type:z.string(),schemaValid:z.boolean().optional(),errorClass:z.string().optional()})).optional()});
const common=z.object({error:z.string().optional(),errorCode:z.string().optional(),failurePhase:z.string().optional(),requestId:z.string().optional(),usage:usageSchema.nullable().optional(),itemTrace:traceSchema.optional(),assetId:z.string().optional()});
export const chatResponseSchema=z.discriminatedUnion('status',[
 common.extend({status:z.literal('completed'),text:z.string().optional()}),
 common.extend({status:z.literal('consent_required'),prompt:z.string(),proposal:z.unknown().optional(),attemptId:z.string(),actionBinding:z.string(),declineBinding:z.string().optional()}),
 common.extend({status:z.literal('action_required'),action:z.object({name:z.string(),args:z.unknown()}),actionBinding:z.string()}),
 common.extend({status:z.enum(['running','failed','unknown','accepted'])}),
]);
export const errorResponseSchema=common.extend({status:z.string().optional()});
export type ChatResponse=z.infer<typeof chatResponseSchema>;
export type Usage=z.infer<typeof usageSchema>;
export const imageContextSchema=z.object({pieceId:z.string(),baseVersion:z.number().int()});
export type ImageContext=z.infer<typeof imageContextSchema>;
export const receiptSchema=z.strictObject({userId:z.string(),projectId:z.string(),requestId:z.string(),pieceId:z.string(),version:z.number().int(),assetId:z.string()});
export type ImageReceipt=z.infer<typeof receiptSchema>;
export const chatMarkerSchema=z.object({requestId:z.string().nullable(),previousAttemptKey:z.string().nullable().optional(),imageContext:imageContextSchema.nullable().optional(),imageReceipt:receiptSchema.nullable().optional(),imageProtocolVersion:z.literal(1).optional()});
export type ImageAction=Extract<ChatResponse,{status:'consent_required'}>&{proposal:ImageProposal;artworkInput:ArtworkInput|null;inputError:string;requestId:string;context:ImageContext&{headline:string};canPrepareTransport:boolean;conversions:readonly ArtworkConversion[];sourceFingerprint:string|null};
export type Inspection={status:'completed'|'failed'|'running'|'action_required'|'consent_required'|'unknown'|'unavailable';authenticationRejected?:boolean;usage:{input_tokens:number|null;output_tokens:number|null}|null;technical:{functionCalls:number|null;outputs:number|null;omittedItems:number|null;validSchemas:number;invalidSchemas:number;errorClasses:string[]}|null};

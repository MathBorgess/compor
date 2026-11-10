import {z} from 'zod';
import {pieceContentSchema} from './studio-domain.ts';
import {pinOriginSchema} from './reference-exploration-contract.ts';
import {boardSlugSchema} from './phoenix/catalog.ts';
export interface StoreOptions {url:string;anonKey:string;fetchImpl?:typeof fetch}
export interface StoreContext {actor:{userId:string};token:string}
export const projectSchema=z.object({id:z.string(),title:z.string(),created_at:z.string(),revision:z.number()});
export type WebProject=z.infer<typeof projectSchema>;
export const persistedApprovalSchema=z.strictObject({status:z.enum(['unapproved','approved']),kind:z.enum(['explicit','inherited']).nullable(),sourceVersion:z.number().nullable(),at:z.string().nullable()});
export const metadataSchema=z.strictObject({approval:persistedApprovalSchema,baseVersion:z.number().nullable(),revision:z.number()});
export const versionSchema=z.object({project_id:z.string(),piece_id:z.string(),version:z.number(),content:pieceContentSchema,created_at:z.string(),metadata:metadataSchema});
export type PersistedVersion=z.infer<typeof versionSchema>;
export interface SavePieceInput {projectId:string;pieceId:string;expectedVersion:number;baseVersion?:number;content:z.infer<typeof pieceContentSchema>}
export const approvedReferenceSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('pinterest'),originUrl:pinOriginSchema,board:boardSlugSchema}),
  z.strictObject({kind:z.literal('generated'),projectId:z.uuid(),imageId:z.uuid()}),
]);
export type ApprovedReference=z.infer<typeof approvedReferenceSchema>;
export interface ApprovePieceInput {projectId:string;pieceId:string;version:number;expectedRevision:number;references?:ApprovedReference[]}
export type PieceMutation = {status:'not_found'}|{status:'conflict';currentVersion?:number;currentRevision?:number}|{status:'saved'|'approved';version:PersistedVersion};
export type ProjectMutation={status:'not_found'}|{status:'conflict';currentRevision:number}|{status:'renamed';project:WebProject};
export const savePieceSchema=z.strictObject({projectId:z.string(),pieceId:z.string(),expectedVersion:z.number(),baseVersion:z.number().optional(),content:pieceContentSchema});
export const approvePieceSchema=z.strictObject({projectId:z.string(),pieceId:z.string(),version:z.number(),expectedRevision:z.number(),operation:z.literal('approve'),references:z.array(approvedReferenceSchema).max(100).optional()});
export const renameProjectSchema=z.strictObject({projectId:z.string(),title:z.string(),expectedRevision:z.number()});

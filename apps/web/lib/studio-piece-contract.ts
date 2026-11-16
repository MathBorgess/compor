import * as z from './schema.ts';
import {postRecordSchema} from './post-catalog';
import {pieceContentSchema, approvalSchema} from './studio-domain';

const persistedUnapprovedSchema=z.pipe(z.strictObject({status:z.literal('unapproved'),kind:z.null(),sourceVersion:z.null(),at:z.null()}),z.transform(()=>({status:'unapproved'} as const)));
export const versionSchema=z.object({project_id:z.string(),piece_id:z.string(),version:z.number().check(z.int()),content:pieceContentSchema,metadata:z.optional(z.object({revision:z.number(),baseVersion:z.optional(z.nullable(z.number())),approval:z.union([approvalSchema,persistedUnapprovedSchema]),changedDimension:z.optional(z.nullable(z.enum(['style','composition','hook']))),operation:z.optional(z.nullable(z.enum(['create','edit'])))})),created_at:z.optional(z.string())});
export const versionsSchema=z.object({versions:z.array(versionSchema),posts:z._default(z.array(postRecordSchema).check(z.maxLength(1000)),[])});
export const savedVersionSchema=z.discriminatedUnion('status',[z.object({status:z.literal('saved'),version:versionSchema}),z.object({status:z.literal('conflict')})]);
export type PieceVersion=z.infer<typeof versionSchema>;

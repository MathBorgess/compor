import * as z from './schema.ts';

export const postNameText=z.string().check(z.maxLength(200)).check(z.refine(value=>!/[\u0000-\u001f\u007f]|sk-[^\s]+/i.test(value)));
export const postNameSchema=z.pipe(z.pipe(postNameText,z.transform(value=>value.trim())),z.string().check(z.minLength(1)).check(z.maxLength(200)));
export const postRecordSchema=z.strictObject({projectId:z.uuid(),pieceId:z.uuid(),name:postNameText,deleted:z.boolean()});
export const postCreationSchema=z.strictObject({projectId:z.uuid(),pieceId:z.uuid(),name:postNameSchema});
export const postDeletionSchema=z.strictObject({projectId:z.uuid(),pieceId:z.uuid()});
export const postMutationSchema=z.discriminatedUnion('status',[
  z.strictObject({status:z.literal('created'),post:postRecordSchema}),
  z.strictObject({status:z.literal('deleted'),post:postRecordSchema}),
  z.strictObject({status:z.literal('conflict')}),
  z.strictObject({status:z.literal('pending')}),
  z.strictObject({status:z.literal('not_found')}),
]);
export type PostRecord=z.infer<typeof postRecordSchema>;

import * as z from './schema.ts';
import {pinOriginSchema} from './reference-exploration-contract.ts';

export const PROFILE_PROJECT_PAGE = 25;
export const PROFILE_SIGNAL_LIMIT = 500;
export const profileProjectSchema = z.strictObject({id:z.uuid(),title:z.string().check(z.minLength(1)).check(z.maxLength(200)),deletedAt:z.nullable(z.iso.datetime({offset:true}))});
const signalShape = {
  id:z.uuid(),projectId:z.uuid(),pieceId:z.nullable(z.uuid()),action:z.enum(['selected','rejected','comment']),
  comment:z.string().check(z.maxLength(1000)),supersedes:z.nullable(z.uuid()),createdAt:z.iso.datetime({offset:true}),
};
export const profileSignalSchema = z.discriminatedUnion('kind',[
  z.strictObject({...signalShape,kind:z.literal('reference'),originUrl:pinOriginSchema,title:z.string().check(z.maxLength(300))}),
  z.strictObject({...signalShape,kind:z.literal('generated'),imageId:z.uuid()}),
]);
export const profileResponseSchema = z.strictObject({
  userId:z.uuid(),projects:z.array(profileProjectSchema).check(z.maxLength(PROFILE_PROJECT_PAGE)),
  signals:z.array(profileSignalSchema).check(z.maxLength(PROFILE_SIGNAL_LIMIT*2)),
  nextOffset:z.nullable(z.number().check(z.int()).check(z.minimum(0))),
  limitedSources:z.array(z.enum(['reference','generated'])).check(z.maxLength(2)),
});
export type ProfileProject = z.infer<typeof profileProjectSchema>;
export type ProfileSignal = z.infer<typeof profileSignalSchema>;
export type ProfilePage = z.infer<typeof profileResponseSchema>;

export function supersededProfileSignals(signals:ProfileSignal[]):Set<string> {
  return new Set(signals.flatMap(signal=>signal.supersedes?[`${signal.kind}:${signal.projectId}:${signal.supersedes}`]:[]));
}

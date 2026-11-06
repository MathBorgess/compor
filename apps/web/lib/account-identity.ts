import { z } from 'zod';

const userSchema=z.object({
  id:z.string().min(1).max(128),
  email:z.string().max(320).nullable().optional(),
  is_anonymous:z.boolean().optional(),
  user_metadata:z.unknown().optional(),
});
const metadataSchema=z.object({full_name:z.unknown().optional(),name:z.unknown().optional()});
const label=(value:unknown) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120) : '';

/** Only call with a user returned by the identity provider's verified getUser. */
export function accountIdentity(input:unknown, localDevelopment:boolean) {
  const user=userSchema.parse(input);
  if(user.is_anonymous) return {userId:user.id,account:{label:localDevelopment?'Conta local':'Conta anônima',local:localDevelopment}};
  const metadata=metadataSchema.safeParse(user.user_metadata);
  const name=metadata.success ? label(metadata.data.full_name) || label(metadata.data.name) : '';
  return {userId:user.id,account:{label:name || label(user.email) || 'Conta conectada',local:false}};
}

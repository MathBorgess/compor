import type {StudioState} from './studio-domain.ts';

type Scope=Pick<StudioState,'userId'|'projectId'|'references'>&{referenceScope?:string};
export const referenceFingerprint=(state:Pick<StudioState,'references'>)=>JSON.stringify(state.references.map(item=>item.id).sort());
export const referenceRoundKey=(state:Scope)=>`compor-reference-selection:${state.userId}:${state.projectId}${state.referenceScope&&state.referenceScope!=='references'?`:${state.referenceScope}`:''}`;
export function readReferenceRound(state:Scope) {
  try {
    const raw=localStorage.getItem(referenceRoundKey(state));
    if(raw===null)return undefined;
    const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||!('fingerprint' in value)||!('epoch' in value)||typeof value.fingerprint!=='string'||typeof value.epoch!=='string'||!value.epoch)return null;
    return {fingerprint:value.fingerprint,epoch:value.epoch};
  } catch {return null;}
}
/** Called only after an explicit selection change is persisted. */
export function recordReferenceRound(state:Scope) {
  const key=referenceRoundKey(state);
  localStorage.setItem(key,JSON.stringify({fingerprint:referenceFingerprint(state),epoch:crypto.randomUUID()}));
  window.dispatchEvent(new CustomEvent('compor-reference-round-changed',{detail:key}));
}
/** A reload keeps the existing round, and never overwrites a newer tab's selection. */
export function ensureReferenceRound(state:Scope) {
  if(readReferenceRound(state)===undefined)localStorage.setItem(referenceRoundKey(state),JSON.stringify({fingerprint:referenceFingerprint(state),epoch:'initial'}));
}

export function canStartReferenceRound({record,round,fingerprint,context,failed}:{record:{status:unknown;fingerprint:string;context:string;epoch:string}|null|undefined;round:{fingerprint:string;epoch:string}|null|undefined;fingerprint:string;context:string;failed:boolean}) {
  if(record===null||!round||round.fingerprint!==fingerprint||record?.status==='submitted'||failed)return false;
  return !(record&&record.fingerprint===fingerprint&&record.context===context&&record.epoch===round.epoch);
}

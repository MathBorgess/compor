import type { BriefRecord } from './brief-interview.ts';
import type { StudioState, OfferFact } from './studio-domain.ts';

type AudienceState = Pick<StudioState,'brief'|'persona'>;
export type AudienceResolution = {status:'resolved';value:string}|{status:'conflict';brief:string;persona:string};

/** Old fields remain intact until the person resolves two different answers. */
export function audienceResolution(state: AudienceState): AudienceResolution {
  const brief=state.brief.audience.trim(),persona=state.persona.audience.trim();
  if(brief && persona && brief!==persona)return {status:'conflict',brief,persona};
  return {status:'resolved',value:brief || persona};
}

/** Interview provenance is explicit; no text is classified by guessing its meaning. */
export function offerFactsFromInterview(record: BriefRecord,newId:()=>string): OfferFact[] {
  return ([['fatos','Fato informado'],['preco','Preço'],['data','Data']] as const).flatMap(([key,label])=>{
    const entry=record[key];
    if(!entry || !entry.skipped && !entry.text.trim())return [];
    return [{id:newId(),label,value:entry.text.trim(),status:entry.skipped?'omitted' as const:entry.origin==='informado'?'confirmed' as const:'pending' as const}];
  });
}

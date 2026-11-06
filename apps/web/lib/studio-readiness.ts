import { generatedSignalsSchema, type GeneratedSignal } from './generated-feedback-contract.ts';
import { referenceSignalsResponseSchema, type ReferenceSignal } from './reference-exploration-contract.ts';
import type { StudioReference } from './studio-domain.ts';

type Feedback = {referenceId:string;text:string};
type Hint = Feedback & {projectId:string;scope:'other_project'};
type FeedbackResult = {referenceFeedback:Feedback[];accountHints:Hint[];availability:'available'|'partial'|'unavailable'};

function active<T extends {id:string;supersedes:string|null}>(signals:T[]) {
  const superseded=new Set(signals.map(item=>item.supersedes).filter(value=>value!==null));
  return signals.filter(item=>!superseded.has(item.id));
}
/** Match only explicit, unsuperseded comments to their selected source. */
export function matchReadinessFeedback(projectId:string,references:StudioReference[],generated:GeneratedSignal[],pins:ReferenceSignal[]) {
  const newest=<T extends {createdAt:string;id:string}>(items:T[])=>items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  const generatedActive=newest(active(generated.filter(item=>item.projectId===projectId)));
  const pinActive=newest(active(pins));
  const referenceFeedback:Feedback[]=[],accountHints:Hint[]=[];
  for(const reference of references) {
    const source=reference.source;
    if(!source)continue;
    if('kind' in source) {
      if(source.projectId!==projectId)continue;
      const signal=generatedActive.find(item=>item.imageId===source.imageId&&item.comment.trim());
      if(signal)referenceFeedback.push({referenceId:reference.id,text:signal.comment});
    } else {
      const matching=pinActive.filter(item=>item.originUrl===source.originUrl&&item.board===source.board&&item.comment.trim());
      const local=matching.find(item=>item.projectId===projectId);
      if(local)referenceFeedback.push({referenceId:reference.id,text:local.comment});
      const other=matching.find(item=>item.projectId!==projectId);
      if(other)accountHints.push({referenceId:reference.id,text:other.comment,projectId:other.projectId,scope:'other_project'});
    }
  }
  return {referenceFeedback:referenceFeedback.slice(0,20),accountHints:accountHints.slice(0,10)};
}
/** Failed reads never manufacture evidence; scopes are enforced by authenticated routes. */
export async function loadReadinessFeedback(projectId:string,references:StudioReference[],fetchApi:typeof fetch=fetch):Promise<FeedbackResult> {
  const read=async(path:string,scope:'project'|'account')=>{
    const response=await fetchApi(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,scope}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('feedback unavailable');
    return response.json();
  };
  const [generated,pins]=await Promise.allSettled([
    read('/api/studio/explorations/signals','project').then(value=>generatedSignalsSchema.parse(value).signals).then(values=>{if(values.some(item=>item.projectId!==projectId))throw Error('project mismatch');return values;}),
    read('/api/studio/references/signals','account').then(value=>referenceSignalsResponseSchema.parse(value).signals),
  ]);
  const values=matchReadinessFeedback(projectId,references,generated.status==='fulfilled'?generated.value:[],pins.status==='fulfilled'?pins.value:[]);
  const success=Number(generated.status==='fulfilled')+Number(pins.status==='fulfilled');
  return {...values,availability:success===2?'available':success===1?'partial':'unavailable'};
}

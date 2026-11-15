import type { ActionInputByName } from '@compor/agents-api/studio-chat-tools';
import type { ActionResult, StudioReference, StudioState } from './studio-domain.ts';
import { readShownExplorations } from './shown-explorations.ts';
import * as z from 'zod';

type Input=ActionInputByName['compor_registrar_feedback_visual'];
function explicitReference(reference:StudioReference,message:string) {
  const source=reference.source;
  if(message.includes(reference.id))return true;
  if(!source)return false;
  if('kind' in source) {
    return source.ordinal!==undefined && new RegExp(`\\b(?:imagem|refer[eê]ncia|proposta)\\s*#?${source.ordinal}\\b`,'i').test(message);
  }
  return Boolean(source.title && source.title.length>=4 && message.toLocaleLowerCase('pt-BR').includes(source.title.toLocaleLowerCase('pt-BR')));
}

/** Resolve only a numbered image actually shown in this browser and owned by this project. */
export async function recordGeneratedComment(state:StudioState,args:ActionInputByName['compor_comentar_imagem_gerada'],fetchApi:typeof fetch=fetch,signal?:AbortSignal,shown=readShownExplorations(state.projectId)):Promise<ActionResult> {
  const adjustment=[...state.adjustments].reverse().find(item=>['pending','in_progress'].includes(item.status));
  if(!adjustment||!state.messages.some(item=>item.id===adjustment.messageId&&item.role==='user')||adjustment.context.projectId!==args.projectId)return {status:'completed',feedbackStatus:'quote_not_found'};
  const message=adjustment.context.instruction,quote=args.quote.trim();
  if(!quote||!message.includes(quote))return {status:'completed',feedbackStatus:'quote_not_found'};
  const mentioned=[...message.matchAll(/\b(?:imagem|refer[eê]ncia|proposta)\s*#?(\d+)\b/gi)].map(match=>Number(match[1]));
  const allNumbers=[...message.matchAll(/\d+/g)].map(match=>Number(match[0]));
  if(mentioned.length!==1||allNumbers.length!==1||mentioned[0]!==args.ordinal)return {status:'completed',feedbackStatus:'ambiguous'};
  if(!quote.replace(/\b(?:imagem|refer[eê]ncia|proposta)\s*#?\d+\b/gi,' ').match(/[\p{L}]{3,}/u))return {status:'completed',feedbackStatus:'quote_not_found'};
  const matches=shown.filter(item=>item.ordinal===args.ordinal);
  if(matches.length!==1)return {status:'completed',feedbackStatus:'reference_unavailable'};
  try {
    const params=new URLSearchParams({projectId:args.projectId,...(args.ordinal<2147483647?{beforeOrdinal:String(args.ordinal+1)}:{})});
    const response=await fetchApi(`/api/studio/explorations?${params}`,{cache:'no-store',signal});
    if(!response.ok)return {status:'unknown'};
    const result=z.object({images:z.array(z.object({id:z.string().uuid(),project_id:z.string().uuid(),state:z.enum(['running','unknown','completed','rejected']),ordinal:z.number().int().positive()})).max(100)}).parse(await response.json());
    const found=result.images.filter(item=>item.ordinal===args.ordinal&&item.id===matches[0].id&&item.project_id===args.projectId&&item.state==='completed');
    if(found.length!==1)return {status:'completed',feedbackStatus:'reference_unavailable'};
    const saved=await fetchApi('/api/studio/explorations/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:args.requestId,projectId:args.projectId,...(adjustment.context.conversationId&&adjustment.context.conversationId!=='references'?{pieceId:adjustment.context.conversationId}:{}),imageId:found[0].id,action:'comment',comment:quote,supersedes:null}),signal});
    return saved.ok?{status:'completed',feedbackStatus:'recorded'}:{status:'unknown'};
  } catch {return {status:'unknown'};}
}

/** Binds only an exact quote from the current turn to a uniquely identified selected image. */
export async function recordVisualFeedback(state:StudioState,args:Input,fetchApi:typeof fetch=fetch,signal?:AbortSignal):Promise<ActionResult> {
  const adjustment=[...state.adjustments].reverse().find(item=>['pending','in_progress'].includes(item.status));
  if(!adjustment||!state.messages.some(item=>item.id===adjustment.messageId&&item.role==='user')||adjustment.context.projectId!==args.projectId)return {status:'completed',feedbackStatus:'quote_not_found'};
  const message=adjustment.context.instruction;
  const quote=args.quote.trim();
  if(!quote||!message.includes(quote))return {status:'completed',feedbackStatus:'quote_not_found'};
  const references=adjustment.context.references.filter(item=>Boolean(item.source));
  const reference=references.find(item=>item.id===args.referenceId);
  if(!reference?.source)return {status:'completed',feedbackStatus:'reference_unavailable'};
  if(references.length>1) {
    const identified=references.filter(item=>explicitReference(item,message));
    if(identified.length!==1||identified[0].id!==reference.id)return {status:'completed',feedbackStatus:'ambiguous'};
  }
  const common={id:args.requestId,projectId:args.projectId,...(adjustment.context.conversationId&&adjustment.context.conversationId!=='references'?{pieceId:adjustment.context.conversationId}:{}),action:args.action,comment:quote,supersedes:null};
  const source=reference.source;
  const generated='kind' in source;
  if(generated && source.projectId!==args.projectId)return {status:'completed',feedbackStatus:'reference_unavailable'};
  const body=generated ? {...common,imageId:source.imageId} : {...common,originUrl:source.originUrl,board:source.board};
  try {
    const response=await fetchApi(generated?'/api/studio/explorations/signals':'/api/studio/references/signals',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal,
    });
    if(!response.ok)return {status:'unknown'};
    return {status:'completed',feedbackStatus:'recorded'};
  } catch { return {status:'unknown'}; }
}

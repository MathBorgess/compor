import { createPhoenixHyperparams } from './phoenix/hyperparams.ts';
import { deterministicRouteBoards } from './phoenix/deterministic.ts';
import { exploredReferenceSchema, type ExploredReference, type ReferenceSignal, type ReferenceHistoryEntry } from './reference-exploration-contract.ts';
import type { BoardAffinityEntry, UserTasteProfile } from './phoenix/models.ts';

const MAX_FEED_BYTES = 1024 * 1024;
// Ranking stays on the server. Generic connective words are not evidence of a matching subject.
const queryStopwords = new Set(['aos','com','das','dos','ela','ele','essa','esse','esta','este','nas','nos','para','pela','pelo','por','que','sem','uma','uns']);
function contentTerms(value:string):Set<string> {
  const words=value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter(word=>word.length>=3 && !queryStopwords.has(word)));
}
function decode(value:string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|#39);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"})[entity] ?? entity);
}
function tag(item:string,name:string) { return decode(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1] ?? ''); }
export function parseReferenceFeed(xml:string, board:string):ExploredReference[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.slice(0,100).flatMap(item => {
    const link = tag(item,'link') || tag(item,'guid');
    const match = link.match(/^https:\/\/(?:www\.)?pinterest\.com\/pin\/([A-Za-z0-9_-]{1,160})\/?(?:[?#].*)?$/i);
    const description = tag(item,'description');
    const preview = description.match(/https:\/\/i\.pinimg\.com\/[a-zA-Z0-9_./%-]+\.(?:jpe?g|png|webp)/i)?.[0];
    if (!match || !preview) return [];
    const title = tag(item,'title').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,300) || 'Referência visual';
    const candidate = exploredReferenceSchema.safeParse({id:match[1],title,board,originUrl:`https://www.pinterest.com/pin/${match[1]}/`,previewUrl:preview});
    return candidate.success ? [candidate.data] : [];
  });
}
function currentSignals(signals:ReferenceSignal[]) {
  const superseded = new Set(signals.map(signal=>signal.supersedes).filter(value=>value!==null));
  return signals.filter(signal=>!superseded.has(signal.id));
}
export function boardAffinities(signals:ReferenceSignal[]):BoardAffinityEntry[] {
  const counts = new Map<string,{positive:number; total:number}>();
  const latest = new Set<string>();
  const ordered = [...currentSignals(signals)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  for (const signal of ordered) {
    if(signal.action==='comment'||latest.has(signal.originUrl))continue;
    latest.add(signal.originUrl);
    const count=counts.get(signal.board) ?? {positive:0,total:0};
    count.total++; if(signal.action==='selected')count.positive++;
    counts.set(signal.board,count);
  }
  return [...counts].map(([board,count])=>({board,positive_actions:count.positive,total_impressions:count.total,affinity_score:(count.positive+1)/(count.total+2)}));
}
async function readBounded(response:Response):Promise<string> {
  if (!response.body) throw Error('empty');
  const reader=response.body.getReader(), chunks:Uint8Array[]=[]; let size=0;
  try { for (;;) { const {value,done}=await reader.read(); if(done)break; size+=value.length; if(size>MAX_FEED_BYTES)throw Error('feed too large'); chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function searchReferences({projectId,query,signals,history=[],fetchApi=fetch}:{projectId:string;query:string;signals:ReferenceSignal[];history?:ReferenceHistoryEntry[];fetchApi?:typeof fetch}) {
  const projectSignals=signals.filter(signal=>signal.projectId===projectId);
  const taste:UserTasteProfile={user_id:'current',preferred_boards_by_goal:{},visual_dna_rules:[],negative_constraints:[],updated_at:new Date().toISOString()};
  const routed=deterministicRouteBoards(createPhoenixHyperparams(),{briefing:query,target_format:'single_feed',user_taste:taste,board_affinities:boardAffinities(projectSignals)});
  const boards=[...new Set(routed.board_allocations.map(item=>item.board).filter(board=>!board.endsWith('/feed')))];
  const responses=await Promise.all(boards.map(async board=>{
    try {
      const response=await fetchApi(`https://www.pinterest.com/${board}.rss`,{headers:{accept:'application/rss+xml, application/xml, text/xml'},redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('unavailable');
      return {ok:true,items:parseReferenceFeed(await readBounded(response),board)};
    } catch { return {ok:false,items:[]}; }
  }));
  const terms=[...contentTerms(query)];
  const seen=new Set<string>();
  const ranked=[...history].sort((a,b)=>b.approvedVersions-a.approvedVersions||b.selectedAt.localeCompare(a.selectedAt)||a.originUrl.localeCompare(b.originUrl));
  const historyOrder=new Map(ranked.map((item,index)=>[item.originUrl,index]));
  const choices=new Map<string,ReferenceSignal['action']>();
  for(const signal of currentSignals(projectSignals).toSorted((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))){
    if(signal.action!=='comment'&&!choices.has(signal.originUrl))choices.set(signal.originUrl,signal.action);
  }
  const references=[...ranked.map(item=>exploredReferenceSchema.parse({id:item.id,title:item.title,board:item.board,originUrl:item.originUrl,previewUrl:item.previewUrl})),...responses.flatMap(item=>item.items)].filter(item=>{if(choices.get(item.originUrl)==='rejected'||seen.has(item.originUrl))return false;seen.add(item.originUrl);return true;}).sort((a,b)=>{
    const historyRank=(historyOrder.get(a.originUrl)??Infinity)-(historyOrder.get(b.originUrl)??Infinity);
    if(historyRank)return historyRank;
    const score=(title:string)=>{const words=contentTerms(title);return terms.reduce((count,word)=>count+Number(words.has(word)),0);};
    return score(b.title)-score(a.title);
  }).slice(0,12);
  return {status:references.length?'ok':responses.some(response=>response.ok)?'empty':'unavailable',references};
}

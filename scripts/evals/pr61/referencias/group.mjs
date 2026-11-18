// apps/web$ node --import tsx ../../scripts/evals/pr61/referencias/group.mjs <empty-output-dir> [--count 3|4|5]
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {searchReferences} from '../../../../apps/web/lib/reference-exploration.ts';
import {standardBoard} from './cases.mjs';
import {scenarios} from './group-cases.mjs';
import {selectCases} from '../briefing/group-selection.mjs';
const selected = selectCases(scenarios,process.argv.slice(3));
const dest=resolve(process.argv[2]);await mkdir(dest,{recursive:false});
const projectId='00000000-0000-4000-8000-000000000001';
const origin=id=>'https://www.pinterest.com/pin/'+id+'/';
const preview=id=>'https://i.pinimg.com/236x/'+id+'.jpg';
function feed(entries){
  return '<rss><channel>'+entries.map(([id,title])=>'<item><title><![CDATA['+title+']]></title><link>'+origin(id)+'</link><description><![CDATA[<img src="'+preview(id)+'">]]></description></item>').join('')+'</channel></rss>';
}
const rows=[];
for(const {id,brief,need,history:previous=[],feeds,rejected} of selected){
  const blindId=randomUUID();
  const history=previous.map(({id,title,approvedVersions,day})=>({id,title,approvedVersions,board:standardBoard,originUrl:origin(id),previewUrl:preview(id),selectedAt:'2026-10-'+String(day).padStart(2,'0')+'T12:00:00Z'}));
  const signals=rejected?[{id:'00000000-0000-4000-8000-000000000012',action:'rejected',board:standardBoard,projectId,originUrl:origin(rejected),supersedes:null,createdAt:'2026-11-01T12:00:00Z',comment:''}]:[];
  const boards=[];
  const result=await searchReferences({projectId,query:brief,history,signals,discoveryOnly:true,fetchApi:async url=>{
    const {pathname,hostname}=new URL(url);assert.equal(hostname,'www.pinterest.com');assert(pathname.endsWith('.rss'));const board=pathname.slice(1,-4);boards.push(board);return new Response(feed(feeds[board]??[]));
  }});
  const known=new Set(history.map(item=>item.originUrl));
  const cards=result.references.filter(item=>!known.has(item.originUrl)).slice(0,4);
  assert.equal(new Set(result.references.map(item=>item.id)).size,result.references.length);
  assert(!cards.some(item=>item.id===rejected));
  const evidence={blindId,pedido:brief,intencao:need,cartoes:cards.map(({title,board})=>({titulo:title,fonte:board})),quantidade:cards.length};
  rows.push({id,blindId,boards,status:result.status,count:result.references.length,returnedIds:result.references.map(item=>item.id),visibleIds:cards.map(item=>item.id),evidence});
}
const packet={marco:'Coleta e classificação de referências',rubrica:'Para cada um dos quatro espaços visíveis, atribua 1 se o título oferece material diretamente pertinente ao pedido e 0 se ausente, ambíguo ou irrelevante. Justifique cada zero e uma possível correção. O mínimo é 3/4 e nenhuma escolha recusada ou repetida. Julgue metadados de títulos: a imagem não foi vista. Registre se o objetivo e o sujeito são reconhecíveis.',casos:rows.map(x=>x.evidence).sort((a,b)=>a.blindId.localeCompare(b.blindId))};
await writeFile(join(dest,'blind.json'),JSON.stringify(packet,null,2)+'\n');
await writeFile(join(dest,'private.json'),JSON.stringify({selectedIds:selected.map(item=>item.id),casesSha256:createHash('sha256').update(JSON.stringify(scenarios)).digest('hex'),rows:rows.map(({evidence,...row})=>row)},null,2)+'\n');

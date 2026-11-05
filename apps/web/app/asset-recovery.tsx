'use client';
import {useEffect,useState} from 'react';
import { uuid } from './studio-ui-types';
import { z } from 'zod';
const assetsSchema=z.object({assets:z.array(z.object({assetId:z.string(),origin:z.literal('unknown')})),nextCursor:z.string().nullable()});

// References are hints, not authorization or provenance. Each PNG is fetched separately.
export default function AssetRecovery({userId,projectId,pieceId,version,onSelect}: {userId:string;projectId:string;pieceId:string;version:number|string;onSelect:(assetId:string)=>void}) {
 const [request,setRequest]=useState<{after:string|null;serial:number}>({after:null,serial:0});
 const [page,setPage]=useState<{assets:string[];nextCursor:string|null;status:'loading'|'ready'|'unavailable'}>({assets:[],nextCursor:null,status:'loading'});
 const valid=uuid(projectId)&&uuid(pieceId)&&typeof version==='number'&&Number.isSafeInteger(version)&&version>0&&version<=2147483647;
 useEffect(()=>{
  if(!valid)return;
  const controller=new AbortController();let active=true;
  setPage(previous=>({...previous,status:'loading'}));
  const query=new URLSearchParams({projectId,pieceId,version:String(version)});if(request.after)query.set('after',request.after);
  fetch(`/api/image-assets?${query}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('unavailable');const data=assetsSchema.parse(await response.json());
   const ids=data?.assets?.map(item=>item?.assetId);
   if(!Array.isArray(data?.assets)||data.assets.length>50||!data.assets.every(item=>item?.origin==='unknown'&&uuid(item.assetId)&&item.assetId===item.assetId.toLowerCase())||ids.some((id,i)=>i>0&&id<=ids[i-1])||(request.after!==null&&ids.some(id=>request.after!==null&&id<=request.after))||!(data.nextCursor===null||(ids.length===50&&data.nextCursor===ids[49])))throw Error('invalid page');
   if(!active)return;
   setPage(previous=>({assets:request.after===null?ids:[...new Set([...previous.assets,...ids])],nextCursor:data.nextCursor,status:'ready'}));
  }).catch(()=>{if(active)setPage(previous=>({...previous,status:'unavailable'}));});
  return()=>{active=false;controller.abort();};
 },[userId,projectId,pieceId,version,valid,request]);
 if(!valid)return null;
 function refresh(){setPage({assets:[],nextCursor:null,status:'loading'});setRequest(old=>({after:null,serial:old.serial+1}));}
 return <section aria-label="Imagens recuperadas">
  <h5>Imagens desta versão</h5>
  <p>Origem desconhecida para as imagens recuperadas; confira antes de usar. Atualize a lista para procurar imagens adicionadas durante a consulta.</p>
  {page.assets.map((assetId,index)=><button key={assetId} type="button" onClick={()=>onSelect(assetId)}>Ver imagem recuperada {index+1}</button>)}
  {page.status==='loading'&&<p role="status">Consultando imagens…</p>}
  {page.status==='unavailable'&&<p role="alert">Não foi possível consultar as imagens. <button type="button" onClick={()=>setRequest(old=>({...old,serial:old.serial+1}))}>Tentar novamente</button></p>}
  {page.status==='ready'&&page.assets.length===0&&<p>Nenhuma imagem encontrada nesta versão.</p>}
  {page.status==='ready'&&page.nextCursor&&<button type="button" onClick={()=>setRequest(old=>({after:page.nextCursor,serial:old.serial+1}))}>Carregar mais imagens</button>}
  <button type="button" disabled={page.status==='loading'} onClick={refresh}>Atualizar imagens</button>
 </section>;
}

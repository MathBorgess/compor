"use client";

import { useState, type FormEvent } from 'react';
import { referenceSearchResponseSchema,type ExploredReference } from '../lib/reference-exploration-contract.ts';
import './reference-exploration.css';

type Props={projectId:string;selectedOrigins:string[];onUseReference:(reference:ExploredReference,file:File)=>Promise<void>};
type SearchState={status:'idle'|'loading'|'empty'|'unavailable';references:ExploredReference[]}|{status:'ok';references:ExploredReference[]};
export default function ReferenceExploration({projectId,selectedOrigins,onUseReference}:Props) {
  const [query,setQuery]=useState(''),[consent,setConsent]=useState(false);
  const [search,setSearch]=useState<SearchState>({status:'idle',references:[]});
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function searchNow(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!query.trim()||!consent||busy)return;
    setBusy(true);setNotice('');setSearch({status:'loading',references:[]});
    try {
      const response=await fetch('/api/studio/references/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,query:query.trim(),consentExternalSearch:true})});
      if(!response.ok)throw Error('unavailable');
      setSearch(referenceSearchResponseSchema.parse(await response.json()));
    } catch {setSearch({status:'unavailable',references:[]});}
    finally {setBusy(false);}
  }
  async function useReference(reference:ExploredReference) {
    setBusy(true);setNotice('');
    try {
      const response=await fetch('/api/studio/references/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,previewUrl:reference.previewUrl,consent:true})});
      if(!response.ok)throw Error('unavailable');
      const blob=await response.blob();
      if(!['image/png','image/jpeg'].includes(blob.type)||blob.size>2*1024*1024)throw Error('invalid');
      const file=new File([blob],`referencia-pinterest-${reference.id}.${blob.type==='image/png'?'png':'jpg'}`,{type:blob.type});
      await onUseReference(reference,file);
      setNotice('Referência adicionada à conversa e à Direção neste navegador.');
    } catch {setNotice('Não foi possível adicionar esta referência. Suas outras imagens foram preservadas.');}
    finally{setBusy(false);}
  }
  return <section className="reference-exploration" aria-label="Buscar referências visuais">
    <h2>Encontrar referências visuais</h2>
    <p>Busque imagens para conversar sobre o que aproxima ou afasta sua intenção.</p>
    <form onSubmit={searchNow}>
      <label>O que você quer explorar?<input value={query} onChange={event=>setQuery(event.target.value)} maxLength={1000} placeholder="Ex.: tipografia acolhedora para uma aula" /></label>
      <label className="reference-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} /> Autorizar consulta a boards do Pinterest e carregamento de prévias. O assunto ajuda a escolher os boards; o texto digitado não é enviado ao Pinterest.</label>
      <button type="submit" disabled={!query.trim()||!consent||busy}>Buscar referências</button>
    </form>
    {search.status==='loading'&&<p role="status">Buscando referências…</p>}
    {search.status==='empty'&&<p>Nenhuma referência encontrada. Você pode tentar outro assunto ou continuar conversando.</p>}
    {search.status==='unavailable'&&<p role="status">A busca está indisponível. Você pode continuar sem referências.</p>}
    {search.status==='ok'&&<div className="reference-results">{search.references.map(item=><article key={item.id}>
      <button type="button" className="reference-image-select" aria-label={`${selectedOrigins.includes(item.originUrl)?'Selecionada':'Selecionar'}: ${item.title}`} aria-pressed={selectedOrigins.includes(item.originUrl)} disabled={busy || selectedOrigins.includes(item.originUrl)} onClick={()=>useReference(item)}><img src={item.previewUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /><span>{selectedOrigins.includes(item.originUrl)?'Selecionada':'Usar na conversa'}</span></button>
      <a href={item.originUrl} target="_blank" rel="noopener noreferrer">Ver origem no Pinterest</a>
      <h3>{item.title}</h3><p>Board: {item.board}</p>
      <small>A imagem escolhida será enviada ao modelo nos próximos turnos da conversa.</small>
    </article>)}</div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

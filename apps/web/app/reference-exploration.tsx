"use client";

import { useEffect,useRef,useState,type FormEvent } from 'react';
import { referenceHistoryResponseSchema,referenceSearchResponseSchema,type ExploredReference,type ReferenceHistoryEntry } from '../lib/reference-exploration-contract.ts';
import { grantReferenceConsent,referenceConsentGranted,syncReferenceConsentAccount } from '../lib/reference-session-consent.ts';
import './reference-exploration.css';

type Props={userId:string;projectId:string;idea:string;selectedOrigins:string[];onUseReference:(reference:ExploredReference,file:File)=>Promise<void>;onContinue?:()=>void};
type SearchState={status:'idle'|'loading'|'empty'|'unavailable'|'ok';references:ExploredReference[]};
export default function ReferenceExploration({userId,projectId,idea,selectedOrigins,onUseReference,onContinue}:Props) {
  const [query,setQuery]=useState(''),[consentOwner,setConsentOwner]=useState<string|null>(null);
  const [search,setSearch]=useState<SearchState>({status:'idle',references:[]});
  const [history,setHistory]=useState<{scope:string;references:ReferenceHistoryEntry[]}|null>(null),[historyUnavailable,setHistoryUnavailable]=useState(false);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const currentScope=`${userId}:${projectId}`,scope=useRef(currentScope),selectionLock=useRef(false),searchRequest=useRef<AbortController|null>(null);
  scope.current=currentScope;
  // A selected card becomes inactive; move keyboard focus to its removal action in the selection tray.
  const pendingFocus=useRef<string|null>(null);
  const selectedKey=selectedOrigins.join('\n');
  useEffect(()=>{
    const pending=pendingFocus.current;if(!pending||!selectedOrigins.includes(pending))return;
    pendingFocus.current=null;
    const active=document.activeElement;
    if(active&&active!==document.body&&document.contains(active)&&!(active instanceof HTMLButtonElement&&active.disabled))return;
    document.getElementById('reference-selection-title')?.focus();
  },[selectedKey]);
  const consent=consentOwner===userId;
  const suggestedQuery=idea.trim().slice(0,1000);
  useEffect(()=>()=>{scope.current='';searchRequest.current?.abort();},[]);
  useEffect(()=>{
    try {syncReferenceConsentAccount(sessionStorage,userId);setConsentOwner(referenceConsentGranted(sessionStorage,userId)?userId:null);}
    catch {setConsentOwner(null);}
  },[userId]);
  useEffect(()=>{
    if(!consent){setHistory(null);return;}
    const cancel=new AbortController();setHistory(null);setHistoryUnavailable(false);
    void (async()=>{
      try {
        const response=await fetch('/api/studio/references/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId}),signal:cancel.signal});
        if(!response.ok)throw Error('unavailable');
        const data=referenceHistoryResponseSchema.parse(await response.json());
        if(!cancel.signal.aborted)setHistory({scope:currentScope,references:data.references});
      } catch {if(!cancel.signal.aborted)setHistoryUnavailable(true);}
    })();
    return()=>cancel.abort();
  },[consent,userId,projectId]);
  async function searchFor(value:string) {
    if(!consent||!value.trim())return;
    searchRequest.current?.abort();
    const cancel=new AbortController();searchRequest.current=cancel;
    const requestedScope=currentScope;
    setNotice('');setSearch({status:'loading',references:[]});
    try {
      const response=await fetch('/api/studio/references/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,query:value.trim(),consentExternalSearch:true}),signal:cancel.signal});
      if(!response.ok)throw Error('unavailable');
      const data=referenceSearchResponseSchema.parse(await response.json());
      if(!cancel.signal.aborted&&scope.current===requestedScope)setSearch(data);
    } catch {if(scope.current===requestedScope&&searchRequest.current===cancel)setSearch({status:cancel.signal.aborted?'idle':'unavailable',references:[]});}
    finally {if(searchRequest.current===cancel)searchRequest.current=null;}
  }
  useEffect(()=>{
    if(consent&&!query.trim()&&suggestedQuery)void searchFor(suggestedQuery);
    return()=>{searchRequest.current?.abort();};
  },[consent,userId,projectId,suggestedQuery,query]);
  function allowSession() {
    try {grantReferenceConsent(sessionStorage,userId);} catch { /* Explicit consent remains valid while this screen is open. */ }
    setConsentOwner(userId);
  }
  function searchNow(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!query.trim()||!consent||busy)return;
    void searchFor(query);
  }
  async function useReference(reference:ExploredReference) {
    if(!consent||selectionLock.current||selectedOrigins.includes(reference.originUrl))return;
    const {id,title,board,originUrl,previewUrl}=reference;
    reference={id,title,board,originUrl,previewUrl};
    selectionLock.current=true;setBusy(true);setNotice('');
    const requestedScope=currentScope;
    try {
      const response=await fetch('/api/studio/references/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,previewUrl:reference.previewUrl,consent:true})});
      if(!response.ok)throw Error('unavailable');
      const blob=await response.blob();
      if(!['image/png','image/jpeg'].includes(blob.type)||blob.size>2*1024*1024)throw Error('invalid');
      if(scope.current!==requestedScope)return;
      const file=new File([blob],`referencia-pinterest-${reference.id}.${blob.type==='image/png'?'png':'jpg'}`,{type:blob.type});
      pendingFocus.current=reference.originUrl;
      await onUseReference(reference,file);
      if(scope.current===requestedScope)setNotice('Referência adicionada à conversa e à Direção neste navegador.');
    } catch {if(scope.current===requestedScope)setNotice('Não foi possível adicionar esta referência. Suas outras imagens foram preservadas.');}
    finally{selectionLock.current=false;if(scope.current===requestedScope)setBusy(false);}
  }
  const ordered=(history?.scope===currentScope?[...history.references]:[]).sort((a,b)=>b.approvedVersions-a.approvedVersions||b.selectedAt.localeCompare(a.selectedAt));
  const knownOrigins=new Set(ordered.map(reference=>reference.originUrl));
  function cards(references:ExploredReference[]) {
    return <div className="reference-results">{references.map(item=>{
      const selected=selectedOrigins.includes(item.originUrl);
      return <article key={item.originUrl} data-reference-origin={item.originUrl} data-selected={selected?'true':undefined}>
        <button type="button" className="reference-image-select" aria-label={`${selected?'Selecionada':'Usar como referência'}: ${item.title}`} aria-pressed={selected} disabled={!consent||busy||selected} onClick={()=>useReference(item)}>
          {consent?<img src={item.previewUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />:<span className="reference-preview-placeholder">Prévia disponível após sua permissão</span>}
          <span>{selected?'✓ Selecionada':'Usar como referência'}</span>
        </button>
        <span className="reference-source" data-origin="pinterest">Pinterest · externa</span>
        <a href={item.originUrl} target="_blank" rel="noopener noreferrer">Ver origem no Pinterest</a>
        <h3>{item.title}</h3>
        <small>A imagem só vai ao modelo depois da sua escolha.</small>
      </article>;
    })}</div>;
  }
  const approved=ordered.filter(item=>item.approvedVersions>0),selected=ordered.filter(item=>item.approvedVersions===0);
  return <section className="reference-exploration" aria-label="Buscar referências visuais">
    {approved.length>0&&<section aria-label="Usadas em posts que você aprovou"><h2>Usadas em posts que você aprovou</h2>{cards(approved)}</section>}
    {selected.length>0&&<section aria-label="Suas referências"><h2>Suas referências</h2>{cards(selected)}</section>}
    <div><h2>Sugestões do Pinterest</h2>
      {!consent&&<div className="reference-session-consent"><p>O Compor pode consultar o Pinterest e carregar prévias para esta sessão. As imagens só guiam o post quando você as escolhe.</p><button type="button" className="studio-button-secondary" onClick={allowSession}>Permitir nesta sessão</button>{onContinue&&<button type="button" onClick={onContinue}>Continuar sem referências</button>}</div>}
      {consent&&<p>As sugestões partem da sua ideia. Você pode explorar outro assunto.</p>}
    </div>
    <form onSubmit={searchNow}>
      <label>O que você quer explorar?<input value={query} onChange={event=>setQuery(event.target.value)} maxLength={1000} placeholder="Ex.: tipografia acolhedora para uma aula" /></label>
      <button type="submit" disabled={!query.trim()||!consent||busy||search.status==='loading'}>Buscar referências</button>
    </form>
    {historyUnavailable&&<p role="status">Seu histórico de referências não está disponível. As sugestões continuam independentes dele.</p>}
    {search.status==='loading'&&<p role="status">Buscando referências…</p>}
    {search.status==='empty'&&<p>Nenhuma referência encontrada. Você pode tentar outro assunto ou continuar conversando.</p>}
    {search.status==='unavailable'&&<p role="status">A busca está indisponível. Você pode continuar sem referências.</p>}
    {consent&&search.status==='ok'&&cards(search.references.filter(item=>!knownOrigins.has(item.originUrl)))}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

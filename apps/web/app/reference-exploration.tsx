"use client";

import { useEffect,useRef,useState,type FormEvent,type ReactNode } from 'react';
import { referenceHistoryResponseSchema,referenceSearchResponseSchema,type ExploredReference,type ReferenceHistoryEntry } from '../lib/reference-exploration-contract.ts';
import { grantReferenceAuthorityConsent,readReferenceAuthorityConsent } from '../lib/reference-authority-consent.ts';
import { grantReferenceConsent,referenceConsentGranted,syncReferenceConsentAccount } from '../lib/reference-session-consent.ts';
import './reference-exploration.css';
import ReferencePreview from './reference-preview';

type Props={userId:string;projectId:string;idea:string;selectedOrigins:string[];onUseReference:(reference:ExploredReference,file:File)=>Promise<void>;onContinue?:()=>void;onRemoveReference?:(originUrl:string)=>Promise<void>;sourceControl?:ReactNode;authorityConsentRequired?:boolean};
type SearchState={status:'idle'|'loading'|'empty'|'unavailable'|'ok';references:ExploredReference[]};
export default function ReferenceExploration({userId,projectId,idea,selectedOrigins,onUseReference,onContinue,onRemoveReference,sourceControl,authorityConsentRequired=false}:Props) {
  const [query,setQuery]=useState(''),[consentOwner,setConsentOwner]=useState<string|null>(null);
  const [search,setSearch]=useState<SearchState>({status:'idle',references:[]});
  const [history,setHistory]=useState<{scope:string;references:ReferenceHistoryEntry[]}|null>(null),[historyUnavailable,setHistoryUnavailable]=useState(false);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[authorityOwner,setAuthorityOwner]=useState<string|null>(null),[authorityBusy,setAuthorityBusy]=useState(false);
  const currentScope=`${userId}:${projectId}`,scope=useRef(currentScope),selectionLock=useRef(false),searchRequest=useRef<AbortController|null>(null);
  scope.current=currentScope;
  const consent=consentOwner===userId;
  useEffect(()=>{setAuthorityOwner(readReferenceAuthorityConsent(userId)?userId:null);},[userId,authorityConsentRequired]);
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
  async function allowExternalForGeneration(){
    if(authorityBusy)return;setAuthorityBusy(true);setNotice('');const requestedScope=currentScope;
    try{await grantReferenceAuthorityConsent(userId);if(scope.current===requestedScope)setAuthorityOwner(userId);}
    catch{if(scope.current===requestedScope)setNotice('Não foi possível confirmar a permissão para usar referências externas na geração.');}
    finally{if(scope.current===requestedScope)setAuthorityBusy(false);}
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
      await onUseReference(reference,file);
      if(scope.current===requestedScope)setNotice('Referência adicionada à conversa e à Direção neste navegador.');
    } catch {if(scope.current===requestedScope)setNotice('Não foi possível adicionar esta referência. Suas outras imagens foram preservadas.');}
    finally{selectionLock.current=false;if(scope.current===requestedScope)setBusy(false);}
  }
  async function removeReference(originUrl:string) {
    if(!onRemoveReference||selectionLock.current)return;
    selectionLock.current=true;setBusy(true);setNotice('');
    const requestedScope=currentScope;
    try {await onRemoveReference(originUrl);if(scope.current===requestedScope)setNotice('Referência retirada da seleção.');}
    catch {if(scope.current===requestedScope)setNotice('Não foi possível confirmar a alteração da seleção.');}
    finally {selectionLock.current=false;if(scope.current===requestedScope)setBusy(false);}
  }
  const ordered=(history?.scope===currentScope?[...history.references]:[]).sort((a,b)=>b.approvedVersions-a.approvedVersions||b.selectedAt.localeCompare(a.selectedAt));
  const knownOrigins=new Set(ordered.map(reference=>reference.originUrl));
  function cards(references:ExploredReference[]) {
    return <div className="reference-results">{references.map(item=>{
      const selected=selectedOrigins.includes(item.originUrl);
      return <article key={item.originUrl} data-reference-origin={item.originUrl} data-selected={selected?'true':undefined}>
        {consent?<ReferencePreview src={item.previewUrl} title={item.title} external/>:<span className="reference-preview-placeholder">Prévia disponível após sua permissão</span>}
        <h3>{item.title}</h3>
        <div className="reference-card-actions"><label className="reference-choice"><input type="checkbox" aria-label={`Escolher referência: ${item.title}`} checked={selected} disabled={!consent||(selected&&!onRemoveReference)} aria-disabled={busy||undefined} onChange={()=>{if(selected)void removeReference(item.originUrl);else void useReference(item);}}/>{selected?'Escolhida':'Escolher'}</label><a href={item.originUrl} target="_blank" rel="noopener noreferrer">Ver origem</a></div>
        <span className="reference-source" data-origin="pinterest">Pinterest · externa</span>
        <small>A imagem só vai ao modelo depois da sua escolha.</small>
      </article>;
    })}</div>;
  }
  const approved=ordered.filter(item=>item.approvedVersions>0),selected=ordered.filter(item=>item.approvedVersions===0);
  return <section className="reference-exploration" aria-label="Buscar referências visuais">
    <div className="reference-search-heading"><h2>Sugestões do Pinterest</h2>
      {!consent&&<div className="reference-session-consent"><p>O Compor pode consultar o Pinterest e carregar prévias para esta sessão. As imagens só guiam o post quando você as escolhe.</p><button type="button" className="studio-button-secondary" onClick={allowSession}>Permitir nesta sessão</button>{onContinue&&<button type="button" onClick={onContinue}>Continuar sem referências</button>}</div>}
      {consent&&<p className="reference-consent-status">Pinterest permitido nesta sessão. Só as escolhidas entram na conversa.</p>}
      {consent&&authorityConsentRequired&&(authorityOwner===userId?<p className="reference-consent-status">Referências externas escolhidas podem orientar a geração nesta página.</p>:<div className="reference-session-consent"><p>Para orientar novas imagens, as referências externas escolhidas podem ser enviadas à OpenAI. Confirme o uso nesta página.</p><button type="button" className="studio-button-secondary" disabled={authorityBusy} onClick={()=>void allowExternalForGeneration()}>{authorityBusy?'Confirmando…':'Permitir uso na geração'}</button></div>)}
    </div>
    <form onSubmit={searchNow}>
      {sourceControl}
      <label>O que você quer explorar?<input value={query} onChange={event=>setQuery(event.target.value)} maxLength={1000} placeholder="Ex.: tipografia acolhedora para uma aula" /></label>
      <button type="submit" disabled={!query.trim()||!consent||busy||search.status==='loading'}>Buscar referências</button>
    </form>
    {historyUnavailable&&<p role="status">Seu histórico de referências não está disponível. As sugestões continuam independentes dele.</p>}
    {search.status==='loading'&&<p role="status">Buscando referências…</p>}
    {search.status==='empty'&&<p>Nenhuma referência encontrada. Você pode tentar outro assunto ou continuar conversando.</p>}
    {search.status==='unavailable'&&<p role="status">A busca está indisponível. Você pode continuar sem referências.</p>}
    <div className="reference-result-groups">
      {approved.length>0&&<section aria-label="Usadas em posts que você aprovou"><h2>Usadas em posts que você aprovou</h2>{cards(approved)}</section>}
      {selected.length>0&&<section aria-label="Suas referências"><h2>Suas referências</h2>{cards(selected)}</section>}
      {consent&&search.status==='ok'&&<section aria-label="Sugestões pela sua ideia">{cards(search.references.filter(item=>!knownOrigins.has(item.originUrl)))}</section>}
    </div>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

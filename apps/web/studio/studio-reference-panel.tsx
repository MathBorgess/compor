"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {ExplorationProgress} from './use-exploration-loop';
type Props={
  projectWide:boolean;onScope?:(projectWide:boolean)=>void;
  entry?:'preparation'|'project'|'post';projectTitle?:string;selectionCount?:number;selectionWaiting?:boolean;needsResponse?:boolean;
  selection:ReactNode;search:ReactNode|((sourceControl:ReactNode)=>ReactNode);proposals:ReactNode;conversation:ReactNode;
  onUpload:(files:File[])=>void;uploadDisabled?:boolean;uploadStatus?:string;
  onBack?:()=>void;onContinue?:()=>void;continueLabel?:string;continueDisabled?:boolean;
  onRequestProposals?:()=>void;proposalsDisabled?:boolean;proposalsRunning?:boolean;
  selectionStatus?:ReactNode;recovery?:ReactNode;proposalDisclosure?:string;proposalBlock?:{message:string;action?:{label:string;run:()=>void}};
  onPauseProposals?:()=>void;proposalStatus?:string;proposalPhase?:'idle'|'generating'|'waiting'|'blocked';
  proposalProgress?:ExplorationProgress|null;
};
type Source='search'|'upload'|'compor';
function ProposalProgress({progress}:{progress:ExplorationProgress}) {
  const elapsed=()=>Math.max(0,Math.floor((Date.now()-progress.startedAt)/1000));
  const [seconds,setSeconds]=useState(elapsed);
  useEffect(()=>{const timer=setInterval(()=>setSeconds(Math.max(0,Math.floor((Date.now()-progress.startedAt)/1000))),1000);return ()=>clearInterval(timer);},[progress.startedAt]);
  const duration=seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}min ${seconds%60}s`;
  return <div className="reference-proposal-progress">
    <p className="reference-workbench-status" role="status">Aguardando imagem {progress.position} de {progress.total}.</p>
    <p role="status">{seconds>=60?'A espera está longa. Ainda não recebemos o resultado; o pedido não foi repetido.':'Pedido enviado. Cada imagem aparece assim que o resultado é confirmado.'}</p>
    <p role="timer" aria-live="off" aria-label="Tempo de espera da imagem">Tempo de espera: {duration}</p>
  </div>;
}
export default function ReferencePanel({projectWide,onScope,entry='post',projectTitle,selectionCount=0,selectionWaiting=false,needsResponse=false,selection,search,proposals,conversation,onUpload,uploadDisabled=false,uploadStatus,onBack,onContinue,continueLabel,continueDisabled=false,onRequestProposals,proposalsDisabled=false,proposalsRunning=false,selectionStatus,recovery,proposalDisclosure,proposalBlock,onPauseProposals,proposalStatus,proposalPhase='idle',proposalProgress}:Props) {
  const [source,setSource]=useState<Source>('search'),[surface,setSurface]=useState<'gallery'|'conversation'>('gallery');
  const sourceId=useId(),conversationId=useId(),headingId=useId(),uploadHelpId=useId(),proposalHelpId=useId();
  const heading=useRef<HTMLHeadingElement>(null),conversationSection=useRef<HTMLElement>(null),conversationTrigger=useRef<HTMLButtonElement>(null),gallery=useRef<HTMLDivElement>(null);
  const filePicker=useRef<HTMLInputElement>(null);
  const galleryScroll=useRef(0),switching=useRef(false);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    if(!switching.current)return;
    if(surface==='conversation')conversationSection.current?.focus();
    else {window.scrollTo({top:galleryScroll.current});conversationTrigger.current?.focus({preventScroll:true});}
  },[surface]);
  function openConversation(){galleryScroll.current=window.scrollY;switching.current=true;setSurface('conversation');}
  function closeConversation(){switching.current=true;setSurface('gallery');}
  const sourceControl=<label className="reference-source-control">Fonte<select aria-label="Fonte" name="source" aria-controls={sourceId} value={source} onChange={event=>setSource(event.target.value as Source)}><option value="search">Pinterest</option><option value="upload">Seus envios</option><option value="compor">Propostas do Compor</option></select></label>;
  return <section className="reference-workbench reference-step" data-source={source} data-surface={surface} data-phase={proposalPhase} data-selection-phase={selectionWaiting?'stabilizing':'idle'} aria-busy={continueDisabled} aria-labelledby={headingId}>
    {entry==='preparation'&&<nav className="reference-preparation-steps" aria-label="Preparação do projeto"><ol><li>Contexto concluído</li><li>IA revisada</li><li aria-current="step">Referências opcionais</li><li>Pedido</li></ol></nav>}
    <header className="reference-workbench-heading">
      {projectTitle&&<p className="reference-project-name">{projectTitle}</p>}
      <h1 id={headingId} ref={heading} tabIndex={-1}>Escolha o que inspira este post</h1>
      <p>Referências são opcionais. Escolha imagens ou continue sem elas.</p>
    </header>
    {selectionWaiting&&<p className="reference-workbench-status" role="status">Aguardando 5 segundos sem alterações ou digitação para verificar esta seleção.</p>}
    {(proposalStatus||proposalsRunning)&&<div className="reference-exploration-status">{proposalPhase==='generating'&&proposalProgress?<ProposalProgress key={proposalProgress.requestId} progress={proposalProgress}/>:proposalStatus&&<p className="reference-workbench-status" role={proposalPhase==='waiting'?'timer':'status'} aria-live={proposalPhase==='waiting'?'off':'polite'}>{proposalStatus}</p>}{proposalsRunning&&onPauseProposals&&<button type="button" className="studio-button-secondary" onClick={onPauseProposals}>Pausar exploração</button>}</div>}
    <div ref={gallery} className="reference-gallery-surface" hidden={surface!=='gallery'}>
      <section className="reference-workbench-explore" aria-label="Explorar caminhos visuais">
        <div className="reference-workbench-actions">
          <button type="button" className="studio-button-secondary" disabled={uploadDisabled} aria-describedby={uploadHelpId} onClick={()=>filePicker.current?.click()}>Enviar imagem</button>
          <button type="button" className="studio-button-secondary" disabled={proposalsDisabled} aria-describedby={proposalBlock||proposalDisclosure?proposalHelpId:undefined} onClick={()=>{setSource('compor');onRequestProposals?.();}}>Pedir 3 propostas</button>
          <input ref={filePicker} type="file" accept="image/png,image/jpeg" multiple hidden disabled={uploadDisabled} aria-label="Escolher arquivos de referência" onChange={event=>{
            const files=Array.from(event.currentTarget.files??[]);
            event.currentTarget.value='';
            if(files.length){setSource('upload');onUpload(files);}
          }}/>
        </div>
        <p id={uploadHelpId} className="reference-upload-help">PNG ou JPEG, até 8 MB por arquivo e 20 imagens por projeto.</p>
        {selectionStatus}
        {proposalBlock&&<div className="reference-workbench-block"><p id={proposalHelpId} role="status">{proposalBlock.message}</p>{proposalBlock.action&&<button type="button" className="studio-button-secondary" onClick={proposalBlock.action.run}>{proposalBlock.action.label}</button>}</div>}
        {!proposalBlock&&proposalDisclosure&&<p id={proposalHelpId} className="reference-upload-help">{proposalDisclosure}</p>}
        {uploadStatus&&<p role="status" className="reference-upload-feedback">{uploadStatus}</p>}
        {recovery}
        <div className="guided-reference-source reference-workbench-source" id={sourceId}>
          <div hidden={source!=='search'}>{typeof search==='function'?search(sourceControl):<>{sourceControl}{search}</>}</div>
          <div hidden={source!=='upload'}>{sourceControl}<p>As imagens enviadas aparecem em “Revisar seleção e alcance”.</p></div>
          <div hidden={source!=='compor'} aria-busy={proposalPhase==='generating'}>
            {sourceControl}
            {proposals}
          </div>
        </div>
      </section>
      {needsResponse&&<p className="reference-pending-question">Há uma pergunta sobre suas referências. <button type="button" className="studio-button-quiet" onClick={openConversation}>Responder</button></p>}
      <footer className="reference-step-actions">
        <div className="reference-selection-summary"><div><p role="status" aria-atomic="true">{selectionCount} {selectionCount===1?'referência escolhida':'referências escolhidas'}</p><p className="reference-scope-summary">{projectWide?'Referências do projeto':'Referências deste post'}</p></div><button ref={conversationTrigger} type="button" className="studio-button-quiet" aria-controls={conversationId} onClick={openConversation}>Comentar seleção</button></div>
        <div className="reference-workbench-return">{onBack&&<button type="button" className="studio-button-secondary" disabled={continueDisabled} onClick={onBack}>Voltar</button>}{onContinue&&<div><button type="button" className="studio-button" disabled={continueDisabled} onClick={onContinue}>{continueLabel}</button>{entry==='preparation'&&<p>Você revisa o pedido antes de gerar.</p>}</div>}</div>
      </footer>
      <details className="reference-workbench-selection"><summary>Revisar seleção e alcance</summary>{onScope&&<label className="guided-reference-scope">Aplicar referências a<select value={projectWide?'project':'post'} disabled={continueDisabled} onChange={event=>onScope(event.target.value==='project')}><option value="post">Só neste post</option><option value="project">Todo o projeto</option></select></label>}{selection}</details>
    </div>
    <section ref={conversationSection} id={conversationId} tabIndex={-1} className="reference-workbench-conversation" aria-label="Conversa sobre estas referências" hidden={surface!=='conversation'}>
      <button type="button" className="studio-button-secondary reference-back-to-images" onClick={closeConversation}>Voltar às imagens</button>
      {conversation}
    </section>
  </section>;
}

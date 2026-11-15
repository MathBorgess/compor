"use client";
import {useId,useState,type ReactNode} from 'react';
import './reference-workbench.css';
type Props={
  projectWide:boolean;onScope?:(projectWide:boolean)=>void;
  selection:ReactNode;search:ReactNode;upload:ReactNode;proposals:ReactNode;conversation:ReactNode;
  onBack?:()=>void;onContinue:()=>void;continueLabel:string;continueDisabled?:boolean;
  onRequestProposals?:()=>void;proposalsDisabled?:boolean;proposalsRunning?:boolean;
  onPauseProposals?:()=>void;proposalStatus?:string;
};
export default function ReferencePanel({projectWide,onScope,selection,search,upload,proposals,conversation,onBack,onContinue,continueLabel,continueDisabled=false,onRequestProposals,proposalsDisabled=false,proposalsRunning=false,onPauseProposals,proposalStatus}:Props) {
  const [source,setSource]=useState<'search'|'upload'|'compor'>('search');
  const sourceId=useId();
  return <div className="guided-references reference-workbench" data-source={source}>
    <header className="reference-workbench-heading">
      <div><h2>Referências {projectWide?'do projeto':'deste post'}</h2><p>{projectWide?'Compartilhadas com todos os posts.':'Combine referências do projeto e deste post.'} Referências são opcionais.</p></div>
      {onScope&&<label className="guided-reference-scope">Aplicar referências a<select value={projectWide?'project':'post'} onChange={event=>onScope(event.target.value==='project')}><option value="post">Só neste post</option><option value="project">Todo o projeto</option></select></label>}
      <div className="reference-workbench-return">{onBack&&<button type="button" className="studio-button-secondary" onClick={onBack}>Voltar</button>}<button type="button" className="studio-button" disabled={continueDisabled} onClick={onContinue}>{continueLabel}</button></div>
    </header>
    <section className="reference-workbench-explore" aria-label="Explorar caminhos visuais">
      <div className="reference-workbench-toolbar">
        <div><h3>Compare caminhos visuais</h3><p>Escolha imagens e converse sobre o que aproveitar.</p></div>
        <nav className="guided-reference-tabs" aria-label="Como adicionar referências">
          <button type="button" className="studio-button-secondary" aria-pressed={source==='search'} aria-controls={sourceId} onClick={()=>setSource('search')}>Buscar referências</button>
          <button type="button" className="studio-button-secondary" aria-pressed={source==='upload'} aria-controls={sourceId} onClick={()=>setSource('upload')}>Enviar imagem</button>
          <button type="button" className="studio-button-quiet reference-workbench-browse" aria-label="Ver propostas anteriores" aria-controls={sourceId} onClick={()=>setSource('compor')}>Ver anteriores</button>
          <button type="button" className="studio-button" aria-pressed={source==='compor'} aria-controls={sourceId} disabled={proposalsDisabled&&source==='compor'} onClick={()=>{setSource('compor');if(!proposalsDisabled)onRequestProposals?.();}}>Pedir 3 propostas</button>
          {proposalsRunning&&onPauseProposals&&<button type="button" className="studio-button-secondary" onClick={onPauseProposals}>Pausar exploração</button>}
        </nav>
      </div>
      {proposalStatus&&<p className="reference-workbench-status" role="status">{proposalStatus}</p>}
      <div className="guided-reference-source reference-workbench-source" id={sourceId}>{source==='search'?search:source==='upload'?upload:proposals}</div>
    </section>
    <div className="reference-workbench-selection">{selection}</div>
    <section className="reference-workbench-conversation" aria-label="Conversa sobre estas referências">{conversation}</section>
  </div>;
}

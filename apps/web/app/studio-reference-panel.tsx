"use client";
import {useState,type ReactNode} from 'react';
export default function ReferencePanel({projectWide,onScope,selection,search,upload,proposals,conversation,onBack,onContinue,continueLabel}:{projectWide:boolean;onScope?:(projectWide:boolean)=>void;selection:ReactNode;search:ReactNode;upload:ReactNode;proposals:ReactNode;conversation:ReactNode;onBack?:()=>void;onContinue:()=>void;continueLabel:string}) {
  const [source,setSource]=useState<'search'|'upload'|'compor'>('search');
  return <div className="guided-references">
    <header><h2>Referências {projectWide?'do projeto':'deste post'}</h2><p>{projectWide?'Compartilhe imagens com todos os posts.':'Combine imagens do projeto e deste post.'} Referências são opcionais.</p>
      {onScope&&<label className="guided-reference-scope">Aplicar referências a<select value={projectWide?'project':'post'} onChange={event=>onScope(event.target.value==='project')}><option value="post">Só neste post</option><option value="project">Todo o projeto</option></select></label>}
    </header>
    <div className="guided-reference-content">{selection}
    <section className="guided-reference-source"><h3>Adicionar referências</h3><nav className="guided-reference-tabs" aria-label="Como adicionar referências">{([['search','Buscar imagens'],['upload','Enviar imagens'],['compor','Propostas do Compor']] as const).map(([id,label])=><button type="button" className="studio-button-secondary" key={id} aria-pressed={source===id} onClick={()=>setSource(id)}>{label}</button>)}</nav>
      {source==='search'?search:source==='upload'?upload:proposals}
    </section>
    {conversation}</div>
    <footer className="guided-actions">{onBack&&<button type="button" className="studio-button-secondary" onClick={onBack}>Voltar</button>}<button type="button" className="studio-button" onClick={onContinue}>{continueLabel}</button></footer>
  </div>;
}

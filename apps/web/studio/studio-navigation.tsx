"use client";

import {useEffect,useId,useRef,useState} from 'react';
import {useProjectNameDisclosure} from './project-name-tooltip';

type Action = {
  id:'posts'|'project'|'post'|'review'|'save'|'delete';
  label:string;
  onClick:()=>void;
  disabled?:boolean;
  current?:boolean;
};
const paths={
  posts:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  project:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  post:'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6',
  review:'M9 3h6v3H9z M9 5H5v16h14V5h-4 M8 14l3 3 5-6',
  save:'M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8',
  rename:'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  delete:'M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6',

};
export default function StudioNavigation({actions,projectTitle='',onRenameProject}:{actions:Action[];projectTitle?:string;onRenameProject?:(title:string)=>boolean|void|Promise<boolean|void>}) {
  const [expanded,setExpanded]=useState(false);
  const [editing,setEditing]=useState(false),[draftTitle,setDraftTitle]=useState(projectTitle);
  const renameId=useId();
  useEffect(()=>{if(!expanded)setEditing(false);},[expanded]);
  const id=useId(),root=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
  const projectName=useProjectNameDisclosure(projectTitle,{escapeHandledByParent:expanded});
  useEffect(()=>{
    const compact=window.matchMedia('(max-width:800px)');
    const collapse=()=>{if(compact.matches)setExpanded(false);};
    compact.addEventListener('change',collapse);
    return()=>compact.removeEventListener('change',collapse);
  },[]);
  useEffect(()=>{
    if(!expanded)return;
    function outside(event:Event){if(window.matchMedia('(max-width:800px)').matches&&!root.current?.contains(event.target as Node))setExpanded(false);}
    document.addEventListener('pointerdown',outside);
    document.addEventListener('focusin',outside);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
  },[expanded]);
  const renderAction=(action:Action)=><button key={action.id} type="button" aria-label={action.label} title={action.label} aria-current={action.current?'page':undefined} disabled={action.disabled} className={action.id==='save'?'studio-navigation-save':undefined} onClick={()=>{action.onClick();if(window.matchMedia('(max-width:800px)').matches)setExpanded(false);}}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[action.id]}/></svg><span>{action.label}</span>
  </button>;
  return <aside className="studio-navigation-shell" data-expanded={expanded}>
    <nav ref={root} className="studio-navigation" aria-label="Menu do projeto" onKeyDown={event=>{if(event.key==='Escape'&&expanded){event.preventDefault();setExpanded(false);toggle.current?.focus();}}}>
      <button ref={toggle} type="button" className="studio-navigation-toggle" aria-label={expanded?'Recolher menu':'Expandir menu'} title={expanded?'Recolher menu':'Expandir menu'} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16"/></svg><span>Menu do projeto</span>
      </button>
      {/* Linha fixa do projeto: o lápis fica na coluna de ícones nos dois estados; aberto, mostra o nome ao lado. */}
      {projectTitle ? editing&&expanded&&onRenameProject ? <form className="studio-navigation-project" onSubmit={event=>{event.preventDefault();const title=draftTitle.trim();if(!title)return;void Promise.resolve(onRenameProject(title)).then(saved=>{if(saved!==false)setEditing(false);});}}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths.rename}/></svg>
          <label htmlFor={renameId} className="studio-visually-hidden">Renomear</label>
          <input id={renameId} value={draftTitle} maxLength={200} autoFocus onChange={event=>setDraftTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setEditing(false);}}}/>
          <button type="submit" className="studio-rename-save" aria-label="Salvar nome" title="Salvar nome" disabled={!draftTitle.trim()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        </form> : <button {...projectName.handlers()} type="button" className="studio-navigation-project" aria-label={onRenameProject?`Renomear projeto ${projectTitle}`:projectTitle} title={projectTitle} disabled={!onRenameProject} onClick={()=>{setDraftTitle(projectTitle);setExpanded(true);setEditing(true);}}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths.rename}/></svg><span><small>Projeto</small><strong>{projectTitle}</strong></span>
        </button> : null}
      {projectName.tooltip}
      <div id={id} className="studio-navigation-actions">{actions.map(renderAction)}
      </div>
    </nav>
  </aside>;
}

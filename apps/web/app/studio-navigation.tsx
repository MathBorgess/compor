"use client";

import {useEffect,useId,useRef,useState} from 'react';
import './studio-navigation.css';

type Action = {
  id:'posts'|'project'|'post'|'review'|'save';
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

};
export default function StudioNavigation({actions}:{actions:Action[]}) {
  const [expanded,setExpanded]=useState(false);
  const id=useId(),root=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
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
      <div id={id} className="studio-navigation-actions">{actions.map(renderAction)}
      </div>
    </nav>
  </aside>;
}

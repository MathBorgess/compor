"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import './studio-settings-page.css';

export default function StudioSettingsPage({section,label,children}:{section:string;label:string;children:ReactNode}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[section]);
  return <section className="studio-settings-page" aria-label="Configurações do projeto">
    <header><p className="studio-eyebrow">Configurações do projeto</p><h2 tabIndex={-1} ref={heading}>{label}</h2><p>Escolha uma seção no menu lateral. Você pode rever estas informações quando precisar.</p></header>
    <div className="studio-panel studio-settings-content">{children}</div>
  </section>;
}

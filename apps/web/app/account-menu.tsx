"use client";
import { useState } from 'react';
import './account-menu.css';

export default function AccountMenu({label,local=false,onSignOut}:{label:string;local?:boolean;onSignOut?:()=>void|Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!onSignOut)return <div className="studio-account"><span>{label}</span></div>;
  async function exit() {
    if(busy)return;
    setBusy(true);setError('');
    try { await onSignOut?.(); }
    catch { setError('Não foi possível sair. Confira a conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <details className="studio-account-menu">
    <summary aria-label={`Conta: ${label}`}><span className="studio-account-label">{label}</span></summary>
    <div className="studio-account-popover">
      {local && <p>Ao sair desta conta local anônima, seus projetos locais não poderão ser retomados por esta conta na interface.</p>}
      <button type="button" onClick={exit} disabled={busy}>{busy?'Saindo…':'Sair'}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}

"use client";
import { useState } from 'react';

export default function AccountMenu({label,local=false,onSignOut,onOpenProfile}:{label:string;local?:boolean;onSignOut?:()=>void|Promise<void>;onOpenProfile?:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!onSignOut&&!onOpenProfile)return <div className="studio-account"><span>{label}</span></div>;
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
      {onOpenProfile&&<button type="button" onClick={event=>{const menu=event.currentTarget.closest('details');menu?.querySelector('summary')?.focus();menu?.removeAttribute('open');onOpenProfile();}}>Seu perfil</button>}
      {onSignOut&&<button type="button" onClick={exit} disabled={busy}>{busy?'Saindo…':'Sair'}</button>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}

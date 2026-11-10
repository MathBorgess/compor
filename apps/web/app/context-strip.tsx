"use client";

import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {briefRecordSchema} from '../lib/brief-interview.ts';
import {audienceResolution,offerFactsFromInterview} from '../lib/studio-context.ts';
import {offerFactSchema,type Brief,type OfferFact,type StudioState} from '../lib/studio-domain.ts';
import './context-strip.css';

const statuses={confirmed:'Confirmado',pending:'Pendente',omitted:'Omitido'} as const;
type Props={state:StudioState;onBrief:(patch:Partial<Brief>)=>void;onFacts:(facts:OfferFact[])=>void};

export default function ContextStrip({state,onBrief,onFacts}:Props){
  const id=useId(),audience=audienceResolution(state),facts=state.offerFacts??[];
  const factSummary=(Object.keys(statuses) as OfferFact['status'][]).flatMap(status=>{const group=facts.filter(fact=>fact.status===status);return group.length?[{fact:group[0],count:group.length}]:[];});
  const imported=useRef(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    const scope=`${state.userId}:${state.projectId}`;
    if(state.offerFacts!==undefined || imported.current===scope)return;
    imported.current=scope;
    try{
      const raw=sessionStorage.getItem(`compor-brief-interview:${scope}`);
      onFacts(offerFactsFromInterview(raw?briefRecordSchema.parse(JSON.parse(raw)):{},()=>crypto.randomUUID()));
    }catch{setNotice('O registro anterior de fatos continua preservado nesta aba. Não foi possível trazê-lo para esta faixa.');}
  },[state.userId,state.projectId,state.offerFacts,onFacts]);
  function saveFact(event:FormEvent<HTMLFormElement>,factId:string){
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    const parsed=offerFactSchema.safeParse({id:factId,label:values.get('label'),value:values.get('value'),status:values.get('status')});
    if(!parsed.success){setNotice('Confira o nome e o texto do fato. Não inclua chaves de API.');return;}
    onFacts(facts.map(fact=>fact.id===factId?parsed.data:fact));
    setNotice('Fato atualizado para as próximas propostas. A imagem já criada não foi alterada.');
  }
  return <section className="studio-context" aria-label="Contexto do projeto">
    <div className="studio-context-heading"><h2>Contexto do projeto</h2><span>Edite quando precisar</span></div>
    <div className="studio-context-fields">
      <details className="studio-context-field">
        <summary><span>Oferta</span><strong>{state.brief.offer||'O que vamos divulgar?'}</strong></summary>
        <div className="studio-context-edit">
          <div className="studio-context-control"><label htmlFor={`${id}-offer`}>Oferta</label><input id={`${id}-offer`} maxLength={4000} value={state.brief.offer} onChange={event=>onBrief({offer:event.target.value})}/></div>
          <div className="studio-context-control"><label htmlFor={`${id}-action`}>O que a pessoa deve fazer</label><input id={`${id}-action`} maxLength={4000} value={state.brief.action} onChange={event=>onBrief({action:event.target.value})}/></div>
        </div>
      </details>
      <details className="studio-context-field">
        <summary><span>Público</span><strong>{audience.status==='conflict'?'Escolha qual descrição usar':audience.value||'Quem você quer alcançar?'}</strong></summary>
        <div className="studio-context-edit">
          {audience.status==='conflict'?<div className="studio-audience-conflict" role="group" aria-label="Escolher o público do projeto">
            <p>Há duas descrições anteriores. Escolha o público deste projeto; nenhuma será escolhida por suposição.</p>
            <div><p>{audience.brief}</p><button type="button" onClick={()=>onBrief({audience:audience.brief})}>Usar público do briefing</button></div>
            <div><p>{audience.persona}</p><button type="button" onClick={()=>onBrief({audience:audience.persona})}>Usar público da persona</button></div>
          </div>:<div className="studio-context-control"><label htmlFor={`${id}-audience`}>Público do projeto</label><textarea id={`${id}-audience`} maxLength={4000} value={audience.value} onChange={event=>onBrief({audience:event.target.value})}/></div>}
        </div>
      </details>
      <details className="studio-context-field">
        <summary><span>Direção</span><strong>{state.brief.direction||'Como o post deve se apresentar?'}</strong></summary>
        <div className="studio-context-edit"><div className="studio-context-control"><label htmlFor={`${id}-direction`}>Direção criativa</label><textarea id={`${id}-direction`} maxLength={4000} value={state.brief.direction} onChange={event=>onBrief({direction:event.target.value})}/></div></div>
      </details>
      <details className="studio-context-field studio-context-facts">
        <summary><span>Fatos da oferta</span><span className="studio-context-fact-summary">{facts.length?factSummary.map(({fact,count})=><span className="studio-context-fact" data-status={fact.status} key={fact.status}>{fact.label}{fact.status==='omitted'?'':`: ${fact.value?fact.value.length>60?`${fact.value.slice(0,60)}…`:fact.value:'não informado'}`} <span>· {statuses[fact.status]}{count>1?` +${count-1}`:''}</span></span>):<strong>Nenhum fato informado</strong>}</span></summary>
        <div className="studio-context-edit">
          <p>Um fato confirmado é obrigatório nas próximas propostas. Pendente ainda precisa de revisão; omitido deve ficar de fora.</p>
          {facts.map((fact,index)=><form key={fact.id} onSubmit={event=>saveFact(event,fact.id)} aria-label={`Editar fato ${index+1}`}>
            <div className="studio-context-control"><label htmlFor={`${id}-${fact.id}-label`}>Nome do fato {index+1}</label><input id={`${id}-${fact.id}-label`} name="label" required maxLength={80} defaultValue={fact.label}/></div>
            <div className="studio-context-control"><label htmlFor={`${id}-${fact.id}-value`}>Texto do fato {index+1}</label><textarea id={`${id}-${fact.id}-value`} name="value" maxLength={4000} defaultValue={fact.value}/></div>
            <div className="studio-context-control"><label htmlFor={`${id}-${fact.id}-status`}>Estado do fato {index+1}</label><select id={`${id}-${fact.id}-status`} name="status" defaultValue={fact.status}>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
            <div className="studio-context-actions"><button type="submit">Salvar fato {index+1}</button><button type="button" onClick={()=>onFacts(facts.filter(item=>item.id!==fact.id))}>Remover fato {index+1}</button></div>
          </form>)}
          <button type="button" disabled={facts.length>=20} onClick={()=>onFacts([...facts,{id:crypto.randomUUID(),label:'Informação da oferta',value:'',status:'pending'}])}>Adicionar fato</button>
        </div>
      </details>
    </div>
    {audience.status==='conflict'&&<p className="studio-context-warning" role="status">Escolha o público na faixa para retomar as propostas de imagens.</p>}
    {notice&&<p className="studio-context-notice" role="status">{notice}</p>}
  </section>;
}

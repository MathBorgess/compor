"use client";

import { useId } from 'react';
import { personaSchema, type Persona } from '../lib/studio-domain';

const empty: Persona = { audience: '', situation: '', need: '', culturalReferences: '', claims: [] };
const origins = [
  ['hypothesis', 'Hipótese para revisar'],
  ['creator_report', 'Relato da pessoa criadora'],
  ['buyer_report', 'Relato de comprador'],
  ['public_source', 'Fonte pública'],
  ['unknown', 'Ainda não sei'],
];

export default function PersonaStep({ value, onChange, onContinue, onBack, disabled = false, showAudience = true }: { value?: Persona; onChange: (persona: Persona) => void; onContinue: (persona: Persona) => void; onBack?: () => void; disabled?: boolean;showAudience?:boolean }) {
  const id = useId();
  const persona = { ...empty, ...value, claims: value?.claims ?? [] };
  const edit = <K extends keyof Persona>(field: K, content: Persona[K]) => onChange({ ...persona, [field]: content });
  const editClaim = (claimId: string, field: 'text' | 'source' | 'provenance', content: string) => {
    if(field === 'provenance' && !['hypothesis','creator_report','buyer_report','public_source','unknown'].includes(content)) return;
    const claims = persona.claims.map(claim => claim.id === claimId ? { ...claim, [field]: content } : claim);
    onChange(personaSchema.parse({ ...persona, claims }));
  };
  const addClaim = () => edit('claims', [...persona.claims, { id: crypto.randomUUID(), text: '', provenance: 'hypothesis', source: '' }]);

  return <section className="persona-step" aria-labelledby={`${id}-title`}>
    <p className="eyebrow">Seu público</p>
    <h2 id={`${id}-title`}>Conhecendo quem vai comprar</h2>
    <p>Pense em quem pode comprar seu infoproduto. Você pode seguir mesmo sem saber tudo.</p>
    <fieldset className="persona-fields" disabled={disabled}>
      <legend className="sr-only">O que você conhece sobre a pessoa compradora</legend>
      {showAudience ? <><label htmlFor={`${id}-audience`}>Quem você quer alcançar?</label><textarea id={`${id}-audience`} value={persona.audience} maxLength={4000} onChange={event => edit('audience', event.target.value)} placeholder="Descreva o público que imagina alcançar." /></> : <p>O público é editado na faixa de contexto do projeto.</p>}
      <label htmlFor={`${id}-situation`}>Em que situação essa pessoa está?</label>
      <textarea id={`${id}-situation`} value={persona.situation} maxLength={2000} onChange={event => edit('situation', event.target.value)} placeholder="Conte um contexto ou episódio que você conhece." />
      <label htmlFor={`${id}-need`}>O que ela quer conseguir?</label>
      <textarea id={`${id}-need`} value={persona.need} maxLength={2000} onChange={event => edit('need', event.target.value)} placeholder="Qual necessidade sua oferta pode ajudar a atender?" />
      <p>Campos vazios ficam como desconhecidos. Uma hipótese ajuda a começar, mas ainda precisa ser confirmada.</p>

      <details className="persona-evidence">
        <summary>Adicionar referências e evidências (opcional)</summary>
        <label htmlFor={`${id}-culture`}>Referências culturais e linguagem</label>
        <textarea id={`${id}-culture`} value={persona.culturalReferences} maxLength={4000} onChange={event => edit('culturalReferences', event.target.value)} placeholder="Obras, expressões ou referências conhecidas, e o que deseja evitar." />
        <p>Encontrar uma referência pública não comprova que seu público a conheça. O chat poderá ajudar com sugestões e fontes para revisar.</p>
        <h3>Informações e hipóteses sobre o público</h3>
        {persona.claims.map((claim, index) => <fieldset className="persona-claim" key={claim.id}>
          <legend>Informação {index + 1}</legend>
          <label htmlFor={`${id}-claim-${claim.id}`}>Informação {index + 1}</label>
          <textarea id={`${id}-claim-${claim.id}`} value={claim.text} maxLength={2000} onChange={event => editClaim(claim.id, 'text', event.target.value)} />
          <label htmlFor={`${id}-origin-${claim.id}`}>Origem da informação {index + 1}</label>
          <select id={`${id}-origin-${claim.id}`} value={claim.provenance} onChange={event => editClaim(claim.id, 'provenance', event.target.value)}>
            {origins.map(([origin, label]) => <option key={origin} value={origin}>{label}</option>)}
          </select>
          <label htmlFor={`${id}-source-${claim.id}`}>Fonte ou referência {index + 1}</label>
          <input id={`${id}-source-${claim.id}`} value={claim.source} maxLength={2000} onChange={event => editClaim(claim.id, 'source', event.target.value)} placeholder="Link, conversa ou origem que você consegue identificar." />
          {claim.provenance === 'public_source' && claim.text.trim() && !claim.source.trim() && <p role="status">Identifique a fonte pública dessa informação para poder revisá-la depois.</p>}
          <button type="button" className="secondary" onClick={() => edit('claims', persona.claims.filter(item => item.id !== claim.id))}>Remover informação {index + 1}</button>
        </fieldset>)}
        <button type="button" className="secondary" disabled={persona.claims.length >= 100} onClick={addClaim}>Adicionar informação ou hipótese</button>
        {persona.claims.length >= 100 && <p role="status">Você pode revisar ou remover as informações já adicionadas.</p>}
      </details>
    </fieldset>
    <p>Estas informações descrevem quem compra sua oferta. Elas não definem suas próprias preferências como pessoa criadora.</p>
    <div className="persona-actions">
      {onBack && <button type="button" className="secondary" disabled={disabled} onClick={onBack}>Voltar</button>}
      <button type="button" disabled={disabled} onClick={() => onContinue(persona)}>Continuar com o que sei</button>
    </div>
  </section>;
}

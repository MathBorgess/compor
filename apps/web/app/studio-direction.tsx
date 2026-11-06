"use client";

import { useState, type FormEvent } from 'react';
import type { CreativeCriterion, CreativeDecision, CreativeDirection, StudioReference } from '../lib/studio-domain';
type VisualReference = StudioReference & {url?: string};
type CriterionDraft = {viewpoint: CreativeCriterion['viewpoint'];dimension: CreativeCriterion['dimension'];statement: string;example: string;counterexample: string;exampleReference: string;counterReference: string};
import { criterionChoice } from '../lib/studio-direction.ts';
import './studio-direction.css';

const viewpoints = { creator: 'Seu olhar', recipient: 'Quem recebe' };
const dimensions = { visual: 'Visual', message: 'Mensagem' };
const origins = { hypothesis: 'Hipótese', creator_report: 'Relato do criador', buyer_report: 'Relato do público', public_source: 'Fonte consultada' };
const choices = { accept: 'Adotado por você', reject: 'Deixado de lado', reopen: 'Em exploração' };
const empty: CriterionDraft = { viewpoint: 'creator', dimension: 'visual', statement: '', example: '', counterexample: '', exampleReference: '', counterReference: '' };

function Example({ value, references, label }: { value: CreativeCriterion["example"]; references: VisualReference[]; label: string }) {
  const reference = references.find(item => item.id === value.referenceId);
  return <div className="direction-example">
    <h4>{label}</h4>
    {reference?.url && <img src={reference.url} alt={reference.name} width="160" height="120" />}
    {reference?.source && ('originUrl' in reference.source ? <a href={reference.source.originUrl} target="_blank" rel="noopener noreferrer">Ver origem no Pinterest</a> : <small>Exploração gerada neste projeto.</small>)}
    <p>{value.description}</p>
    {value.referenceId && !reference && <small>Referência fora do moodboard atual. A descrição continua preservada.</small>}
  </div>;
}

export default function StudioDirection({ direction, references = [], onPropose, onDecide }: { direction: CreativeDirection; references?: VisualReference[]; onPropose: (criterion: CreativeCriterion) => void; onDecide: (decision: CreativeDecision) => void }) {
  const [draft, setDraft] = useState(empty);
  const [notice, setNotice] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onPropose({ id: crypto.randomUUID(), viewpoint: draft.viewpoint, dimension: draft.dimension, statement: draft.statement.trim(), example: { description: draft.example.trim(), referenceId: draft.exampleReference || null }, counterexample: { description: draft.counterexample.trim(), referenceId: draft.counterReference || null }, provenance: draft.viewpoint === 'creator' ? 'creator_report' : 'hypothesis', source: '', tension: '' });
      setDraft(empty);
      setNotice('Critério registrado. Você pode adotá-lo ou continuar explorando.');
    } catch { setNotice('Não foi possível registrar. Confira os campos e o limite da direção.'); }
  }
  function choose(criterionId: string, choice: CreativeDecision["choice"]) {
    try {
      onDecide({ id: crypto.randomUUID(), criterionId, choice, reason: '', at: new Date().toISOString() });
      setNotice(choice === 'reopen' ? 'Critério reaberto. A decisão anterior continua no histórico.' : 'Sua escolha foi registrada para a próxima conversa.');
    } catch { setNotice('Não foi possível registrar sua escolha. O critério anterior foi preservado.'); }
  }
  return <section className="studio-direction" aria-labelledby="direction-title">
    <header>
      <h2 id="direction-title">Uma direção com significado</h2>
      <p>Exemplos tornam a intenção concreta. Contraexemplos mostram o que fica de fora.</p>
      <p className="studio-hint">Seu gosto e a perspectiva de quem recebe podem divergir. A escolha é sua. Hipóteses sobre a persona não são respostas de público real.</p>
    </header>
    {direction.criteria.length === 0 && <div className="direction-empty">
      <h3>O que “simples” significa para este post?</h3>
      <p>Um exemplo pode ser “uma ideia central e uma frase curta”. O contraexemplo, “retirar o contexto até a oferta ficar vaga”. Estes são exemplos ilustrativos, não preferências atribuídas a você.</p>
      <p>Conte sua intenção na conversa. O Compor só pede uma comparação quando ela ajuda a resolver uma dúvida.</p>
    </div>}
    {Object.entries(viewpoints).map(([viewpoint, label]) => {
      const criteria = direction.criteria.filter(item => item.viewpoint === viewpoint);
      return criteria.length > 0 && <section key={viewpoint} className="direction-perspective" aria-label={label}>
        <h3>{label}</h3>
        {criteria.map(criterion => <article key={criterion.id} className="direction-criterion" data-choice={criterionChoice(direction, criterion.id)}>
          <p className="direction-meta">{dimensions[criterion.dimension]} · {origins[criterion.provenance]} · {choices[criterionChoice(direction, criterion.id)]}</p>
          <h4>{criterion.statement}</h4>
          <div className="direction-comparison">
            <Example label="Aproxima da intenção" value={criterion.example} references={references} />
            <Example label="Fica fora da intenção" value={criterion.counterexample} references={references} />
          </div>
          {criterion.tension && <p className="direction-tension"><strong>Uma tensão para decidir.</strong> {criterion.tension}</p>}
          {criterion.source && <p className="studio-hint">Origem informada. {criterion.source}</p>}
          <div className="direction-actions">
            <button type="button" aria-pressed={criterionChoice(direction, criterion.id) === 'accept'} onClick={() => choose(criterion.id, 'accept')}>Usar este critério</button>
            <button type="button" aria-pressed={criterionChoice(direction, criterion.id) === 'reject'} onClick={() => choose(criterion.id, 'reject')}>Deixar de lado</button>
            {criterionChoice(direction, criterion.id) !== 'reopen' && <button type="button" onClick={() => choose(criterion.id, 'reopen')}>Reabrir decisão</button>}
          </div>
        </article>)}
      </section>;
    })}
    <details className="direction-add">
      <summary>Adicionar um critério com minhas palavras</summary>
      <form onSubmit={submit}>
        <div className="direction-comparison">
          <label>Perspectiva<select value={draft.viewpoint} onChange={event => setDraft({ ...draft, viewpoint: event.target.value === "recipient" ? "recipient" : "creator" })}>{Object.entries(viewpoints).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Tipo de critério<select value={draft.dimension} onChange={event => setDraft({ ...draft, dimension: event.target.value === "message" ? "message" : "visual" })}>{Object.entries(dimensions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label>O que torna este post adequado?<input required maxLength={600} value={draft.statement} onChange={event => setDraft({ ...draft, statement: event.target.value })} /></label>
        {([['example', 'exampleReference', 'Um exemplo que aproxima'], ['counterexample', 'counterReference', 'Um contraexemplo que esclarece o limite']] satisfies [keyof CriterionDraft, keyof CriterionDraft, string][]).map(([field, referenceField, label]) => <div key={field}>
          <label>{label}<textarea required maxLength={500} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>
          <label>Referência visual para {field === 'example' ? 'o exemplo' : 'o contraexemplo'}<select value={draft[referenceField]} onChange={event => setDraft({ ...draft, [referenceField]: event.target.value })}><option value="">Somente a descrição</option>{references.map(reference => <option key={reference.id} value={reference.id}>{reference.name}</option>)}</select></label>
        </div>)}
        <button type="submit" className="studio-button">Registrar critério</button>
      </form>
    </details>
    {notice && <p role="status">{notice}</p>}
  </section>;
}

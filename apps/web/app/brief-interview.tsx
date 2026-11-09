"use client";

import { useId } from "react";
import {
  adjustmentQuestion,
  briefDecisions,
  previewImage,
  showsMarketProof,
  type BriefDecisionId,
  type BriefOption,
  type BriefPrompt,
  type BriefRecord,
} from "../lib/brief-interview";

type BriefReference = { id: string; description: string; board: string };
export type BriefCanvasProps = {
  prompt: BriefPrompt | null;
  record: BriefRecord;
  discarded?: Partial<Record<BriefDecisionId, readonly BriefOption[]>>;
  references?: readonly BriefReference[];
  calibrating?: boolean;
  onChoose: (option: BriefOption) => void;
  onStart?: () => void;
};
export type BriefChatProps = {
  prompt: BriefPrompt | null;
  calibrating?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onClose?: () => void;
};

export function BriefCanvas({
  prompt,
  record,
  discarded = {},
  references = [],
  calibrating = false,
  onChoose,
  onStart,
}: BriefCanvasProps) {
  const entries = Object.entries(record).filter(([, value]) => value && !value.skipped);
  const answered = briefDecisions.filter((item) => record[item.id] && !record[item.id]?.skipped);
  return (
    <div className="studio-brief">
      <section className="studio-brief-summary" aria-label="Brief">
        <h2>Brief</h2>
        {entries.length === 0 ? <p>Os campos aparecem aqui conforme a conversa.</p> : null}
        {answered.map((item) => (
          <article key={item.id} className="studio-decision-card">
            <h3>{item.id}</h3>
            <p>
              {record[item.id]?.direction ?? record[item.id]?.text} <span>{record[item.id]?.origin}</span>
            </p>
            {record[item.id]?.claims?.length ? (
              <ul>
                {record[item.id]?.claims?.map((claim) => (
                  <li key={claim.id}>
                    {claim.text} <span>{claim.origin}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {discarded[item.id]?.length ? (
              <details>
                <summary>Opções descartadas</summary>
                <ul>
                  {discarded[item.id]?.map((option) => (
                    <li key={option.id}>{option.title}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
        {!prompt && onStart ? (
          <button type="button" className="studio-button-secondary" onClick={onStart}>
            Explorar direção
          </button>
        ) : null}
      </section>
      {prompt?.kind === "decision" ? (
        <section aria-label={`Opções de ${prompt.id}`}>
          <h2>{prompt.question}</h2>
          <p>{prompt.limit}</p>
          <p>Estes esboços ajudam a escolher uma direção. A arte será gerada depois.</p>
          {calibrating ? <p role="status">calibrando…</p> : null}
          <div className="studio-brief-options">
            {prompt.options.map((option) => (
              <article key={option.id} className="studio-brief-option">
                <figure>
                  <img src={previewImage(option)} alt={`Esboço de exploração: ${option.title}`} />
                  <figcaption>exploração · esboço ilustrativo</figcaption>
                </figure>
                <h3>{option.title}</h3>
                <p>{option.text}</p>
                <ul className="studio-brief-refs">
                  {references
                    .slice(0, 2)
                    .filter((item) => item.board && !showsMarketProof(`${item.description} ${item.board}`))
                    .map((item) => (
                    <li key={item.id}>
                      {item.description}
                      <span>Fonte: catálogo de sugestões · {item.board}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="studio-button studio-button-yellow" onClick={() => onChoose(option)}>
                  Escolher {option.title}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function BriefChat({ prompt, calibrating = false, value, onChange, onSubmit, onSkip, onClose }: BriefChatProps) {
  const answerId = useId();
  if (!prompt) return null;
  return (
    <section className="studio-chat-panel" aria-label="Entrevista do brief">
      <header className="studio-chat-header">
        <div>
          <h2>Compor</h2>
          <p>{calibrating ? "calibrando…" : "Uma pergunta por vez."}</p>
        </div>
        {onClose ? (
          <button type="button" className="studio-button-secondary" onClick={onClose}>
            Voltar à conversa
          </button>
        ) : null}
      </header>
      <div className="studio-chat-messages">
        <div className="studio-message" data-role="assistant">
          <span className="studio-message-label">Compor</span>
          <p>{prompt.kind === "decision" ? adjustmentQuestion : prompt.question}</p>
        </div>
      </div>
      <form
        className="studio-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={answerId}>Resposta da entrevista</label>
        <textarea
          id={answerId}
          value={value}
          maxLength={prompt.id === "persona" ? 2000 : 4000}
          placeholder="Responda com suas palavras…"
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="studio-composer-actions">
          {prompt.required ? <span /> : (
            <button type="button" className="studio-button-secondary" onClick={onSkip}>
              {prompt.kind === "decision" ? "Seguir sem personalidade" : `Pular ${prompt.skip}`}
            </button>
          )}
          <button className="studio-button" type="submit" disabled={!value.trim()}>
            Enviar resposta
          </button>
        </div>
      </form>
    </section>
  );
}

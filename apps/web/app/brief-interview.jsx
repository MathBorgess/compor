"use client";

import { previewImage } from "../lib/brief-interview.mjs";

export function BriefCanvas({
  prompt,
  record,
  discarded = [],
  references = [],
  calibrating = false,
  calibrated = false,
  onChoose,
}) {
  const entries = Object.entries(record).filter(([, value]) => value && !value.skipped);
  return (
    <div className="studio-brief">
      <section className="studio-brief-summary" aria-label="Brief">
        <h2>Brief</h2>
        {entries.length === 0 ? <p>Os campos aparecem aqui conforme a conversa.</p> : null}
        <dl>
          {entries.map(([id, value]) => (
            <div key={id}>
              <dt>{id}</dt>
              <dd>
                {value.text || "Sem texto"} <span>{value.origin}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {prompt?.kind === "decision" ? (
        <section aria-label={`Opções de ${prompt.id}`}>
          <p>{prompt.limit}</p>
          <p role="status">{calibrating ? "Calibrando…" : calibrated ? "Phoenix calibrado para esta decisão." : "Calibração indisponível."}</p>
          <div className="studio-brief-options">
            {prompt.options.map((option) => (
              <article key={option.id} className="studio-brief-option">
                <img src={previewImage(option)} alt={`Prévia de ${option.title}`} />
                <h3>{option.title}</h3>
                <p>{option.text}</p>
                <ul className="studio-brief-refs">
                  {references.slice(0, 2).map((item) => (
                    <li key={item.id}>
                      {item.board}: {item.description}
                    </li>
                  ))}
                </ul>
                <button type="button" className="studio-button studio-button-yellow" onClick={() => onChoose(option)}>
                  Escolher {option.title}
                </button>
              </article>
            ))}
          </div>
          {discarded.length > 0 ? (
            <details>
              <summary>Opções descartadas</summary>
              <ul>
                {discarded.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function BriefChat({ prompt, calibrating, value, onChange, onSubmit, onSkip }) {
  if (!prompt) return null;
  return (
    <section className="studio-chat-panel" aria-label="Entrevista do brief">
      <header className="studio-chat-header">
        <div>
          <h2>Compor</h2>
          <p>{calibrating ? "Calibrando…" : "Uma pergunta por vez."}</p>
        </div>
      </header>
      <div className="studio-chat-messages">
        <div className="studio-message" data-role="assistant">
          <span className="studio-message-label">Compor</span>
          <p>{prompt.question}</p>
        </div>
      </div>
      <form
        className="studio-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="studio-brief-answer">Resposta da entrevista</label>
        <textarea
          id="studio-brief-answer"
          value={value}
          maxLength={4000}
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

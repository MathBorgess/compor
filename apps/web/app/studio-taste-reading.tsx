"use client";
import type { ReactNode } from "react";
import type { QuickReplyEntry, QuickReplyOption, QuickReplyStatus } from "../lib/studio-quick-replies.ts";
// Styles live in studio-shell.css with the rest of the conversation.

function optionDescription(entry: QuickReplyEntry, option: QuickReplyOption) {
  if (option.intent === "prefer") return option.description;
  if (option.intent === "agree") return entry.reply.synthesis ?? "Seguir a recomendação acima";
  return "Escreva o que mudar, com suas palavras";
}
function statusText(entry: QuickReplyEntry, status: QuickReplyStatus, disabled: boolean) {
  if (status.kind === "answered") {
    const chosen = entry.reply.options.find(option => option.id === status.optionId);
    return chosen ? `Você escolheu “${chosen.label}”. A resposta está na conversa.` : "Você respondeu na conversa.";
  }
  if (status.kind === "obsolete") return status.reason === "superseded"
    ? "Há uma leitura mais recente. Estas opções não estão mais ativas."
    : "A seleção ou o contexto mudou depois desta leitura. Estas opções não estão mais ativas.";
  if (disabled) return "As opções ficam disponíveis com a IA conectada e sem outra resposta em andamento.";
  return "Escolha uma opção ou responda com suas palavras. Escolher não gera imagem nem aprova a arte.";
}

/** A taste reading rendered from the validated contract. Buttons come from a
 * closed list; model text is shown as text only. */
export default function TasteReadingCard({ entry, status, disabled, renderText, onChoose }: { entry: QuickReplyEntry; status: QuickReplyStatus; disabled: boolean; renderText: (text: string) => ReactNode; onChoose: (option: QuickReplyOption) => void }) {
  const id = entry.messageId, questionId = `studio-quick-reply-question-${id}`, recommendationId = `studio-taste-recommendation-${id}`;
  const chosen = status.kind === "answered" ? status.optionId : null;
  const inactive = status.kind !== "active" || disabled;
  return <article className="studio-message studio-taste-card" data-role="assistant" data-kind="taste-reading" data-state={status.kind}>
    <span className="studio-message-label">Compor · leitura da sua seleção</span>
    <div className="studio-message-markdown">{renderText(entry.reply.reading)}</div>
    <section className="studio-taste-recommendation" aria-labelledby={recommendationId}>
      <h3 id={recommendationId}>Recomendação</h3>
      <div className="studio-message-markdown">{renderText(entry.reply.recommendation)}</div>
    </section>
    <p className="studio-taste-question" id={questionId}>{entry.reply.question}</p>
    <div className="studio-quick-replies" role="group" aria-labelledby={questionId}>
      {entry.reply.options.map(option => {
        const labelId = `studio-quick-reply-${id}-${option.id}`, descriptionId = `${labelId}-description`, isChosen = chosen === option.id;
        return <button key={option.id} type="button" className="studio-quick-reply" data-intent={option.intent} data-chosen={isChosen ? "true" : undefined} aria-labelledby={labelId} aria-describedby={descriptionId} disabled={inactive} onClick={() => onChoose(option)}>
          <span id={labelId} className="studio-quick-reply-label">{isChosen && <span aria-hidden="true">✓ </span>}{option.label}</span>
          <span id={descriptionId} className="studio-quick-reply-description">{optionDescription(entry, option)}</span>
        </button>;
      })}
    </div>
    <p id={`studio-quick-reply-status-${id}`} tabIndex={-1} className="studio-quick-reply-status">{statusText(entry, status, disabled)}</p>
  </article>;
}

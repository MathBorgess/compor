"use client";

import React, { useRef, useState } from "react";

export const imageAttemptCopy = {
  running: "Gerando a imagem. Isso pode levar até 2 minutos.",
  rejected429: "O serviço de imagem está ocupado agora. Seu post foi preservado.",
  rejected400: "O serviço de imagem recusou este pedido. Seu post foi preservado. Ajustar a descrição da imagem costuma resolver.",
  uncertain: "Não conseguimos confirmar se a imagem foi gerada. Seu post foi preservado.",
  continueEditing: "Continuar editando o texto",
  retry: "Tentar de novo",
  adjust: "Ajustar descrição",
  closeAndRetry: "Encerrar e tentar de novo",
  details: "Ver detalhes da tentativa",
  detailsBody: "A tentativa ficou sem uma imagem confirmada. O post continua salvo.",
  open: "Abrir",
} as const;

export type ImageAttemptReason = "running_with_lease" | "provider_rejected_429" | "provider_rejected_400" | "result_unknown";

export type ImageAttemptScreen = {
  reason: ImageAttemptReason;
  sameProject: boolean;
  requestId?: string;
  projectTitle?: string;
  openHref?: string;
};

export function elsewhereCopy(projectTitle: string) {
  return `Uma imagem do projeto ${projectTitle} ainda não terminou`;
}

export async function closeThenReserve(
  close: () => Promise<void>,
  reserve: (requestId: string) => Promise<void>,
  createId: () => string,
) {
  await close();
  const requestId = createId();
  await reserve(requestId);
  return requestId;
}

export async function runImageAttemptPrimary(
  reason: ImageAttemptReason,
  actions: { close: () => Promise<void>; reserve: (requestId: string) => Promise<void>; createId: () => string },
) {
  if (reason === "running_with_lease") return null;
  if (reason === "result_unknown") return closeThenReserve(actions.close, actions.reserve, actions.createId);
  return actions.reserve(actions.createId());
}

export default function ImageAttemptNotice({
  screen,
  developerMode = false,
  onContinueEditing,
  onAdjustDescription,
  onClose,
  onReserve,
  createId = () => crypto.randomUUID(),
}: {
  screen: ImageAttemptScreen;
  developerMode?: boolean;
  onContinueEditing: () => void;
  onAdjustDescription: () => void;
  onClose: () => Promise<void>;
  onReserve: (requestId: string) => Promise<void>;
  createId?: () => string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const inFlight = useRef(false);
  async function primary() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setRetryFailed(false);
    try {
      await runImageAttemptPrimary(screen.reason, { close: onClose, reserve: onReserve, createId });
    } catch {
      setRetryFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  if (!screen.sameProject && screen.projectTitle && screen.openHref) {
    return (
      <section className="image-attempt-notice" role="status" data-reason="elsewhere">
        <p>{elsewhereCopy(screen.projectTitle)}</p>
        <a className="studio-button-secondary" href={screen.openHref}>{imageAttemptCopy.open}</a>
      </section>
    );
  }
  const text = screen.reason === "running_with_lease" ? imageAttemptCopy.running
    : screen.reason === "provider_rejected_429" ? imageAttemptCopy.rejected429
    : screen.reason === "provider_rejected_400" ? imageAttemptCopy.rejected400
    : imageAttemptCopy.uncertain;
  const primaryLabel = screen.reason === "result_unknown" ? imageAttemptCopy.closeAndRetry
    : screen.reason === "running_with_lease" ? null
    : imageAttemptCopy.retry;
  return (
    <section className="image-attempt-notice" role="status" data-reason={screen.reason}>
      <p>{text}</p>
      {retryFailed && <p>Não foi possível confirmar o encerramento. Sua tentativa foi preservada.</p>}
      {screen.reason === "running_with_lease" && <div className="image-attempt-progress" role="progressbar" aria-label={imageAttemptCopy.running} />}
      <div className="image-attempt-actions">
        {primaryLabel && <button type="button" className="studio-button image-attempt-primary" disabled={pending} onClick={() => { void primary(); }}>{primaryLabel}</button>}
        {screen.reason === "running_with_lease" && <button type="button" className="studio-button-secondary" onClick={onContinueEditing}>{imageAttemptCopy.continueEditing}</button>}
        {screen.reason === "provider_rejected_400" && <button type="button" className="studio-button-secondary" onClick={onAdjustDescription}>{imageAttemptCopy.adjust}</button>}
        {screen.reason === "result_unknown" && <button type="button" className="studio-button-secondary" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>{imageAttemptCopy.details}</button>}
      </div>
      {screen.reason === "result_unknown" && detailsOpen && <div className="image-attempt-details">
        <p>{imageAttemptCopy.detailsBody}</p>
        {developerMode && <p className="image-attempt-dev">Motivo interno: {screen.reason}</p>}
      </div>}
    </section>
  );
}

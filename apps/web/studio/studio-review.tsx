"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PieceFrame, PostFormat, StudioDraft } from "../lib/studio-domain";
import { createStudioZip } from '../lib/studio-zip';
import { composeStudioPng } from "../lib/studio-compose";
import { postFormatOption } from "../lib/studio-post-formats";
import { errorMessage } from "./studio-ui-types";
import { useObjectUrl } from './use-object-url.ts';

const EMPTY_FRAMES: readonly PieceFrame[] = [];
const EMPTY_FRAME_BLOBS: Readonly<Record<string, Blob>> = {};

function sanitizeFileBase(title: string) {
  return title.trim().replace(/[\\/<>:"|?*\u0000-\u001f]/g, "-") || "post";
}

function frameFilename(fileBase: string, position: number, extension = 'png') {
  return `${fileBase}-${String(position).padStart(2, '0')}.${extension}`;
}

function FrameReviewCard({
  frame,
  blob,
  alt,
  busy,
  onDownload,
}: {
  frame: PieceFrame;
  blob: Blob | null;
  alt?: string;
  busy: boolean;
  onDownload: (frame: PieceFrame, blob: Blob) => void;
}) {
  const url = useObjectUrl(blob);
  return (
    <article className="studio-review-frame-card" aria-label={`Lâmina ${frame.position}`}>
      <header>
        <strong>{frame.position}. {frame.role || `Lâmina ${frame.position}`}</strong>
      </header>
      {url ? (
        <img
          src={url}
          className="studio-export-preview"
          alt={alt ?? `Prévia da lâmina ${frame.position}`}
        />
      ) : (
        <p className="studio-hint">Imagem desta lâmina ainda não disponível.</p>
      )}
      {frame.headline && <p className="studio-review-frame-copy">{frame.headline}</p>}
      <button
        type="button"
        className="studio-button-secondary"
        disabled={busy || !blob}
        onClick={() => { if (blob) onDownload(frame, blob); }}
      >
        Baixar lâmina {frame.position}
      </button>
    </article>
  );
}

export type ConfirmedFactItem = { id: string; label: string; value: string };
const EMPTY_FACTS: readonly ConfirmedFactItem[] = [];
const IG_CAPTION_LIMIT = 2200;

export default function StudioReview({
  title,
  downloadTitle = title,
  postUrl,
  confirmedFacts = EMPTY_FACTS,
  draft,
  base,
  format = 'single',
  frames = EMPTY_FRAMES,
  frameBlobs = EMPTY_FRAME_BLOBS,
  saving = false,
  composing = false,
  uploadingArt = false,
  hasLocalPreview = false,
  onCompose,
  onSave,
  onApprove,
}: {
  title: string;
  downloadTitle?: string;
  postUrl?: string;
  confirmedFacts?: readonly ConfirmedFactItem[];
  draft: StudioDraft | null;
  base: Blob | null;
  format?: PostFormat;
  frames?: readonly PieceFrame[];
  frameBlobs?: Readonly<Record<string, Blob>>;
  saving?: boolean;
  composing?: boolean;
  uploadingArt?: boolean;
  hasLocalPreview?: boolean;
  onCompose?: () => void;
  onSave?: () => void;
  onApprove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [postedLocal, setPostedLocal] = useState(false);
  const controlsBusy=busy||saving||composing||uploadingArt;
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const url = useObjectUrl(base);
  const availabilityId = useId();
  const orderedFrames = [...frames].sort((a, b) => a.position - b.position);
  const isCarousel = format === 'carousel' && orderedFrames.length > 0;
  const isMultiFrame = isCarousel || (format === 'collection' && orderedFrames.length > 0);
  const governed = isCarousel && draft?.content.carouselPlan !== undefined;
  const render = governed ? draft?.content.carouselRender : undefined;
  const extension = governed ? 'jpg' : 'png';
  const reviewFrames = orderedFrames.map(frame => ({
    frame,
    blob: governed ? render && frameBlobs[frame.id]?.type === 'image/jpeg' ? frameBlobs[frame.id] : null
      : frameBlobs[frame.id] ?? (frame.position === 1 ? base : null),
  }));
  const availableFrames = reviewFrames.filter((entry): entry is { frame: PieceFrame; blob: Blob } => entry.blob !== null);
  const missingPositions = reviewFrames.filter(({blob}) => !blob).map(({frame}) => frame.position);
  const completeCarousel = isCarousel && missingPositions.length === 0;
  const coverUrl = useObjectUrl(isCarousel ? reviewFrames.find(({frame}) => frame.position === 1)?.blob ?? null : null);
  const formatOption = postFormatOption(format);
  const caption = draft?.content.caption ?? '';
  const paragraphCount = caption ? caption.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).length : 0;
  const filenameTitle = isCarousel ? downloadTitle : title;
  const isSaved = Boolean(draft && !draft.dirty && !hasLocalPreview && draft.baseVersion >= 1);
  const isApproved = Boolean(isSaved && draft?.approval?.status === 'approved');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useLayoutEffect(() => {
    generation.current++;
    locked.current = false;
    setBusy(false);
    setDownloaded(false);
    setCopied(false);
    setLinkCopied(false);
    setNotice("");
    return () => { generation.current++; };
  }, [base, draft?.pieceId, draft?.baseVersion, filenameTitle, format, frames, frameBlobs, caption]);

  function triggerDownload(file: Blob, filename: string, current: number) {
    if (current !== generation.current) return false;
    const object = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = object;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(object), 1000);
    return true;
  }

  async function triggerPngDownload(blob: Blob, filename: string, current: number) {
    return triggerDownload(await composeStudioPng({ base: blob }), filename, current);
  }

  async function download() {
    if (!base || !draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (await triggerPngDownload(base, `${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}.png`, current)) {
        setDownloaded(true);
        setNotice("Arte baixada.");
      }
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function downloadFrame(frame: PieceFrame, blob: Blob) {
    if (!draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      const file = governed ? blob : await composeStudioPng({ base: blob });
      triggerDownload(file, frameFilename(`${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`, frame.position, extension), current);
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function downloadAllFrames() {
    if (!draft || !availableFrames.length || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      for (const { frame, blob } of availableFrames) {
        const ok = await triggerPngDownload(blob, frameFilename(`${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`, frame.position), current);
        if (!ok) return;
      }
      if (current === generation.current) {
        setDownloaded(true);
        setNotice(`${availableFrames.length} ${availableFrames.length === 1 ? 'lâmina preparada' : 'lâminas preparadas'} para download em ordem.`);
      }
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function downloadCarousel() {
    if (!draft || !completeCarousel || saving || locked.current) return;
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    const fileBase = `${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`;
    locked.current = true;
    setBusy(true);
    setNotice('Preparando ZIP…');
    try {
      const entries = [];
      for (const {frame, blob} of availableFrames) {
        if (!isCurrent()) return;
        entries.push({name: frameFilename(fileBase, frame.position, extension), file: governed ? blob : await composeStudioPng({base: blob})});
      }
      entries.push({name: 'legenda.txt', file: new Blob([caption], {type: 'text/plain;charset=utf-8'})});
      if (render) {
        const alt = render.frames.map(({alt},index)=>({index:index+1,alt}));
        entries.push({name:'alt-text.json',file:new Blob([JSON.stringify(alt,null,2)+'\n'],{type:'application/json'})});
      }
      const archive = await createStudioZip(entries, isCurrent);
      if (archive && triggerDownload(archive, `${fileBase}.zip`, current)) {
        setDownloaded(true);
        setNotice('Download do ZIP iniciado.');
      }
    } catch (error) {
      if (isCurrent()) setNotice(errorMessage(error));
    } finally {
      if (isCurrent()) { locked.current = false; setBusy(false); }
    }
  }

  async function copyCaption() {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(caption);
      if (current === generation.current) {
        setCopied(true);
        setNotice("Legenda copiada.");
      }
    } catch {
      if (current === generation.current) setNotice("Selecione e copie a legenda manualmente.");
    }
  }

  async function shareNative() {
    if (!base || !draft || !canNativeShare) return;
    try {
      const png = await composeStudioPng({ base });
      const file = new File([png], `${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: downloadTitle, text: caption });
        setDownloaded(true);
        if (caption) setCopied(true);
        setNotice("Arte compartilhada.");
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    await download();
  }

  const statusBadge = postedLocal
    ? 'Postado ✓'
    : isApproved
      ? `★ Pronto para postar · v${draft?.baseVersion}`
      : isSaved
        ? `Salvo · v${draft?.baseVersion}`
        : 'Em criação';

  return (
    <section className="studio-review-kit" aria-label="Arte e legenda do projeto">
      <div className="studio-review-head">
        <div>
          <h3>{title}</h3>
          <p className="studio-hint">
            {downloadTitle !== title ? `${downloadTitle} · ` : ''}
            {formatOption.label} · {formatOption.ratioLabel}
            {isMultiFrame ? ` · ${orderedFrames.length} lâminas` : ''}
          </p>
        </div>
        <span className="studio-badge" data-status={postedLocal ? 'posted' : isApproved ? 'approved' : isSaved ? 'saved' : 'draft'}>
          {statusBadge}
        </span>
      </div>
      <ol className="studio-review-checklist" aria-label="Passos do kit para postar">
        <li data-done={isSaved ? 'true' : 'false'}>{isSaved ? `1. Salvo na nuvem · v${draft?.baseVersion} ✓` : hasLocalPreview ? '1. Nova imagem local ainda não salva' : '1. Rascunho local'}</li>
        <li data-done={downloaded ? 'true' : 'false'}>{downloaded ? '2. Arte baixada ✓' : '2. Baixar arte'}</li>
        <li data-done={copied ? 'true' : 'false'}>{copied ? '3. Legenda copiada ✓' : '3. Copiar legenda'}</li>
      </ol>
      {hasLocalPreview && (
        <p className="studio-hint" role="status">
          Você trocou a imagem neste navegador. Salve como nova versão antes de marcar como pronto para postar.
        </p>
      )}
      {confirmedFacts.length > 0 && (
        <div className="studio-review-facts" role="group" aria-label="Conferência de fatos confirmados">
          <p className="studio-hint">Confira estes dados na arte antes de postar:</p>
          <ul className="studio-review-facts-list">
            {confirmedFacts.map(fact => (
              <li key={fact.id}>
                <label className="studio-review-fact-item">
                  <input type="checkbox" />
                  <span><strong>{fact.label}:</strong> {fact.value}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {governed && !render ? (
        <p id={availabilityId} className="studio-hint" role="status">
          {composing ? 'Compondo e verificando as lâminas…' : 'Componha as lâminas deste plano para revisar as imagens.'}
        </p>
      ) : isCarousel && !completeCarousel && (
        <p id={availabilityId} className="studio-hint" role="status">
          Carrossel incompleto. {availableFrames.length} de {orderedFrames.length} lâminas disponíveis. {missingPositions.length === 1 ? 'Falta' : 'Faltam'} {missingPositions.join(', ')}.
        </p>
      )}
      {coverUrl && (
        <details className="studio-carousel-profile">
          <summary>Prévia da capa no perfil</summary>
          <img src={coverUrl} alt="Capa do carrossel com recorte central de perfil em 3:4" />
        </details>
      )}
      {isMultiFrame ? (
        <div className="studio-review-frames-grid">
          {reviewFrames.map(({frame, blob}) => (
            <FrameReviewCard
              key={frame.id}
              frame={frame}
              blob={blob}
              alt={render?.frames.find(item=>item.frameId===frame.id)?.alt}
              busy={busy}
              onDownload={(target, blob) => { void downloadFrame(target, blob); }}
            />
          ))}
        </div>
      ) : url ? (
        <img
          src={url}
          className="studio-export-preview"
          data-format={format}
          alt="Prévia da arte integral, sem textos adicionados pelo aplicativo"
        />
      ) : (
        <p>A imagem deste post ainda não está disponível. Volte ao estúdio para escolher ou recuperar a arte.</p>
      )}
      {caption && (
        <div className="studio-review-caption-block">
          <p className="studio-hint">
            {paragraphCount} {paragraphCount === 1 ? 'parágrafo' : 'parágrafos'} · {caption.length} / {IG_CAPTION_LIMIT} caracteres
          </p>
          <p className="studio-review-caption">{caption}</p>
        </div>
      )}
      <div className="studio-review-actions">
        {governed && !completeCarousel && onCompose && (
          <button type="button" className="studio-button" disabled={controlsBusy} onClick={onCompose}>
            {composing ? 'Compondo…' : 'Compor lâminas'}
          </button>
        )}
        {(isCarousel || hasLocalPreview) && draft && onSave && (
          <button type="button" className="studio-button-secondary" disabled={controlsBusy || (governed && !completeCarousel)} onClick={onSave}>
            {saving ? "Salvando…" : "Salvar versão"}
          </button>
        )}
        {isCarousel ? (
          <button
            type="button"
            className="studio-button"
            data-downloaded={downloaded ? 'true' : undefined}
            disabled={controlsBusy || !completeCarousel || !draft}
            aria-describedby={completeCarousel ? undefined : availabilityId}
            onClick={() => { void downloadCarousel(); }}
          >
            Baixar carrossel em ZIP
          </button>
        ) : isMultiFrame ? (
          <button
            type="button"
            className="studio-button"
            data-downloaded={downloaded ? 'true' : undefined}
            disabled={busy || !availableFrames.length || !draft}
            onClick={() => { void downloadAllFrames(); }}
          >
            {busy ? "Preparando…" : `Baixar todas (${availableFrames.length} PNGs)`}
          </button>
        ) : (
          <button
            type="button"
            className="studio-button"
            data-downloaded={downloaded ? 'true' : undefined}
            disabled={busy || !base || !draft}
            onClick={download}
          >
            {busy ? "Preparando…" : "Baixar PNG"}
          </button>
        )}
        {canNativeShare && !isMultiFrame && base && (
          <button type="button" className="studio-button-secondary" disabled={busy || !base || !draft} onClick={() => { void shareNative(); }}>
            Compartilhar / Salvar nas Fotos
          </button>
        )}
        <button
          type="button"
          className="studio-button-secondary"
          data-copied={copied ? 'true' : undefined}
          disabled={!draft?.content.caption}
          onClick={copyCaption}
        >
          Copiar legenda
        </button>
        {onApprove && isSaved && !isApproved && (
          <button type="button" className="studio-button-secondary" disabled={controlsBusy} onClick={onApprove}>
            ★ Marcar como pronto para postar
          </button>
        )}
        {draft && (
          <button
            type="button"
            className="studio-button-quiet"
            aria-pressed={postedLocal}
            onClick={() => setPostedLocal(value => !value)}
          >
            {postedLocal ? 'Postado ✓' : 'Marcar como postado'}
          </button>
        )}
      </div>
      {!canNativeShare && postUrl && (
        <details className="studio-review-handoff">
          <summary>Vai postar pelo celular? Abra este post no telefone</summary>
          <div className="studio-review-handoff-body">
            <p className="studio-hint">Copie o link deste post e abra no celular para salvar a arte nas Fotos e colar a legenda no Instagram.</p>
            <button
              type="button"
              className="studio-button-secondary"
              onClick={() => {
                void navigator.clipboard.writeText(postUrl).then(() => {
                  setLinkCopied(true);
                  setNotice("Link do post copiado.");
                });
              }}
            >
              {linkCopied ? 'Link copiado ✓' : 'Copiar link deste post'}
            </button>
          </div>
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

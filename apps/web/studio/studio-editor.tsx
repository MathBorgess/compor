"use client";
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { creativeFieldSchema, type Brief, type StudioDraft, type StudioMark, type CreativeField, type PieceFrame, type PostFormat } from "../lib/studio-domain";
import { suggestedArtworkFields, type OptionalArtworkField } from "../lib/studio-editor-fields.ts";
import { postFormatOption } from "../lib/studio-post-formats.ts";
import { useObjectUrl } from './use-object-url.ts';

type Region = { x: number; y: number; width: number; height: number };
export type NewMark = Region & { kind: "area"; note: string; frameId?: string };
export type EditorPanel = { id: string; label: string; title: string; className?: string; content: ReactNode };
const elementLabels: Record<string, string> = { headline: "título", price: "preço", date: "data" };

function FrameThumb({
  frame,
  blob,
  active,
  onSelect,
}: {
  frame: PieceFrame;
  blob: Blob | null;
  active: boolean;
  onSelect: () => void;
}) {
  const thumbUrl = useObjectUrl(blob);
  return (
    <button
      type="button"
      className="studio-frame-chip"
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
    >
      <span className="studio-frame-chip-thumb" aria-hidden="true">
        {thumbUrl ? <img src={thumbUrl} alt="" /> : <span>{frame.position}</span>}
      </span>
      <span className="studio-frame-chip-meta">
        <strong>{frame.position}. {frame.role || `Lâmina ${frame.position}`}</strong>
        <span>{blob ? "Gerada" : "Planejada"}</span>
      </span>
    </button>
  );
}

function FrameGridCard({
  frame,
  index,
  total,
  minFrames,
  blob,
  active,
  onSelect,
  onMove,
  onRemove,
}: {
  frame: PieceFrame;
  index: number;
  total: number;
  minFrames: number;
  blob: Blob | null;
  active: boolean;
  onSelect: () => void;
  onMove?: (from: number, to: number) => void;
  onRemove?: () => void;
}) {
  const thumbUrl = useObjectUrl(blob);
  return (
    <article className="studio-frame-grid-card" data-active={active || undefined} aria-label={`Lâmina ${frame.position}`}>
      <button type="button" className="studio-frame-grid-preview" onClick={onSelect}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={`Arte da lâmina ${frame.position}`} />
        ) : (
          <div className="studio-frame-grid-placeholder">
            <strong>{frame.position}. {frame.role || `Lâmina ${frame.position}`}</strong>
            <p>{frame.headline || "Sem texto definido"}</p>
          </div>
        )}
      </button>
      <div className="studio-frame-grid-bar">
        <span>{frame.position}/{total} · {frame.role || "lâmina"}</span>
        <div className="studio-frame-grid-controls">
          {onMove && (
            <>
              <button type="button" className="studio-button-secondary" disabled={index === 0} aria-label={`Mover lâmina ${frame.position} para antes`} onClick={() => onMove(index, index - 1)}>←</button>
              <button type="button" className="studio-button-secondary" disabled={index === total - 1} aria-label={`Mover lâmina ${frame.position} para depois`} onClick={() => onMove(index, index + 1)}>→</button>
            </>
          )}
          {onRemove && total > minFrames && (
            <button type="button" className="studio-button-secondary" aria-label={`Remover lâmina ${frame.position}`} onClick={onRemove}>×</button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function StudioEditor({
  draft,
  brief,
  marks = [],
  base = null,
  format = 'single',
  frames = [],
  activeFrameId = null,
  frameBlobs = {},
  onSelectFrame,
  onUpdateFrame,
  onAddFrame,
  onRemoveFrame,
  onReorderFrame,
  onRefineCopy,
  onGenerateRemainingFrames,
  canTriggerAI = false,
  onEdit,
  onSetField,
  onRemoveField,
  onMark,
  onRemoveMark,
  onApprove,
  onViewArt,
  guided = false,
  panels = [],
  panelRequest = null,
}: {
  draft: StudioDraft | null;
  brief: Brief;
  marks?: StudioMark[];
  base?: Blob | null;
  format?: PostFormat;
  frames?: readonly PieceFrame[];
  activeFrameId?: string | null;
  frameBlobs?: Readonly<Record<string, Blob>>;
  onSelectFrame?: (frameId: string) => void;
  onUpdateFrame?: (frameId: string, patch: Partial<Pick<PieceFrame, 'role' | 'headline' | 'body' | 'visualCue'>>) => void;
  onAddFrame?: () => void;
  onRemoveFrame?: (frameId: string) => void;
  onReorderFrame?: (fromIndex: number, toIndex: number) => void;
  onRefineCopy?: () => void;
  onGenerateRemainingFrames?: () => void;
  canTriggerAI?: boolean;
  onEdit?: (field: "headline" | "price" | "date" | "caption", value: string) => void;
  onSetField?: (field: CreativeField) => void;
  onRemoveField?: (id: string) => void;
  onMark?: (mark: NewMark) => void;
  onRemoveMark?: (id: string) => void;
  onApprove?: () => void;
  onViewArt?: () => void;
  guided?: boolean;
  panels?: EditorPanel[];
  panelRequest?: { id: string; nonce: number } | null;
}) {
  const [mode, setMode] = useState("select"),
    [region, setRegion] = useState<Region | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [addedFields, setAddedFields] = useState<OptionalArtworkField[]>([]),
    [newFieldLabel, setNewFieldLabel] = useState(""),
    [openPanels, setOpenPanels] = useState<string[]>([]),
    [safeZones, setSafeZones] = useState(false),
    [gridView, setGridView] = useState(false);

  const orderedFrames = [...frames].sort((a, b) => a.position - b.position);
  const formatOption = postFormatOption(format);
  const isMultiFrame = formatOption.multiFrame && orderedFrames.length > 0;
  const activeFrame = isMultiFrame ? (orderedFrames.find(frame => frame.id === activeFrameId) ?? orderedFrames[0]) : null;
  const displayedBlob = activeFrame
    ? (frameBlobs[activeFrame.id] ?? (activeFrame.position === 1 ? base : null))
    : base;
  const url = useObjectUrl(displayedBlob);
  const frame = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const approvalHint = useId(), panelId = useId();
  const visibleMarks = activeFrame
    ? marks.filter(mark => !mark.frameId || mark.frameId === activeFrame.id)
    : marks;
  const anchorFrame = isMultiFrame ? orderedFrames[0] : null;
  const anchorBlob = anchorFrame ? (frameBlobs[anchorFrame.id] ?? base) : null;
  const remainingPendingCount = isMultiFrame
    ? orderedFrames.slice(1).filter(item => !frameBlobs[item.id]).length
    : 0;

  useEffect(() => {
    setRegion(null);
    setAddedFields([]);
    setNewFieldLabel("");
    setNote("");
    setError("");
    setGridView(false);
  }, [draft?.pieceId, draft?.baseVersion]);
  useEffect(() => {
    if (format !== 'story') setSafeZones(false);
  }, [format]);
  useEffect(() => {
    if (!panelRequest) return;
    setOpenPanels(open => open.includes(panelRequest.id) ? open : [...open, panelRequest.id]);
    requestAnimationFrame(() => document.getElementById(`${panelId}-${panelRequest.id}`)?.focus());
  }, [panelRequest, panelId]);
  useEffect(() => {
    if (guided && region) setOpenPanels(open => open.includes("texts") ? open : [...open, "texts"]);
  }, [guided, region]);

  if (!draft)
    return (
      <div className="studio-empty">
        <h2>Seu próximo post começa aqui</h2>
        <p>Crie um post ou abra uma versão no histórico.</p>
      </div>
    );
  const visibleFields = new Set([...suggestedArtworkFields(brief, draft.content), ...addedFields]);
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "area") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = point(event);
    setRegion({ ...start.current, width: 0, height: 0 });
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = point(event),
      s = start.current;
    setRegion({
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    move(event);
    start.current = null;
  }
  // ADR 0056: no estúdio guiado, a arte ocupa a altura disponível e os painéis abrem ao lado, sem rolar a criação.
  const allPanels: EditorPanel[] = [{ id: "texts", label: "Textos", title: "Editar textos, legenda e aprovação", className: "studio-post-inspector", content: null }, ...panels];
  function togglePanel(id: string) {
    setOpenPanels(open => open.includes(id) ? open.filter(item => item !== id) : [...open, id]);
  }
  function wrapFrame(frameView: ReactNode) {
    return guided ? <div className="studio-frame-stage">{frameView}</div> : frameView;
  }
  function wrapInspector(inspector: ReactNode) {
    if (!guided) return <details className="studio-post-inspector" open><summary>Editar textos, legenda e aprovação</summary>{inspector}</details>;
    return <aside className="studio-editor-side" aria-label="Painéis do post" hidden={!allPanels.some(panel => openPanels.includes(panel.id))}>
      {allPanels.map(panel => <section key={panel.id} id={`${panelId}-${panel.id}`} className={`studio-editor-panel ${panel.className ?? ""}`} aria-label={panel.title} tabIndex={-1} hidden={!openPanels.includes(panel.id)}>
        <div className="studio-editor-panel-heading"><h3>{panel.title}</h3><button type="button" aria-label={`Fechar ${panel.title}`} onClick={() => { document.getElementById(`${panelId}-${panel.id}-toggle`)?.focus(); togglePanel(panel.id); }}>×</button></div>
        {panel.id === "texts" ? inspector : panel.content}
      </section>)}
    </aside>;
  }
  return (
    <div className={guided ? "studio-editor is-guided" : "studio-editor"}>
      <div className="studio-canvas-tools">
        <button
          type="button"
          aria-pressed={mode === "select" && !gridView}
          onClick={() => {
            setMode("select");
            setGridView(false);
            setRegion(null);
            onViewArt?.();
          }}
        >
          Ver arte
        </button>
        <button
          type="button"
          disabled={!displayedBlob || gridView}
          aria-pressed={mode === "area"}
          onClick={() => {
            setMode("area");
            setRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
          }}
        >
          Marcar área
        </button>
        {format === 'story' && (
          <button
            type="button"
            aria-pressed={safeZones}
            onClick={() => setSafeZones(value => !value)}
          >
            Guia de áreas seguras
          </button>
        )}
        {isMultiFrame && (
          <button
            type="button"
            aria-pressed={gridView}
            onClick={() => {
              setMode("select");
              setRegion(null);
              setGridView(value => !value);
            }}
          >
            Ver grade ({orderedFrames.length})
          </button>
        )}
        {guided ? allPanels.map(panel => (
          <button
            key={panel.id}
            id={`${panelId}-${panel.id}-toggle`}
            type="button"
            className="studio-panel-toggle"
            aria-expanded={openPanels.includes(panel.id)}
            aria-controls={`${panelId}-${panel.id}`}
            title={panel.title}
            onClick={() => togglePanel(panel.id)}
          >
            {panel.label}
          </button>
        )) : <span>
          {draft.approval?.status === "approved" ? "Aprovado" : "Rascunho"}
        </span>}
      </div>
      {wrapFrame(
        <div className="studio-frame-column">
          {gridView && isMultiFrame ? (
            <section className="studio-frame-grid" aria-label="Grade de lâminas do post">
              {orderedFrames.map((item, index) => (
                <FrameGridCard
                  key={item.id}
                  frame={item}
                  index={index}
                  total={orderedFrames.length}
                  minFrames={formatOption.minFrames}
                  blob={frameBlobs[item.id] ?? (item.position === 1 ? base : null)}
                  active={item.id === activeFrame?.id}
                  onSelect={() => {
                    onSelectFrame?.(item.id);
                    setGridView(false);
                  }}
                  onMove={onReorderFrame}
                  onRemove={onRemoveFrame ? () => onRemoveFrame(item.id) : undefined}
                />
              ))}
            </section>
          ) : (
            <div
              ref={frame}
              data-format={format}
              className={`studio-post-frame ${mode === "area" ? "is-marking" : ""}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={() => {
                start.current = null;
              }}
              aria-label={activeFrame ? `Arte da lâmina ${activeFrame.position} de ${orderedFrames.length}` : "Arte integral do post"}
            >
              {url && (
                <img
                  className="studio-post-base"
                  src={url}
                  alt={activeFrame ? `Arte integral da lâmina ${activeFrame.position}` : "Arte integral da versão selecionada"}
                />
              )}
              {!url && (
                <div className="studio-art-empty">
                  <h2>{activeFrame ? `Lâmina ${activeFrame.position} · ${activeFrame.role || formatOption.label}` : "A sua ideia ganha forma aqui"}</h2>
                  <p>
                    {activeFrame
                      ? activeFrame.headline || "Defina o plano na conversa ou nos textos. Gere a Lâmina 1 primeiro como âncora visual."
                      : "Conte o que quer comunicar ou traga uma referência. Vamos criar a arte inteira, incluindo os textos."}
                  </p>
                </div>
              )}
              {format === 'story' && safeZones && (
                <div className="studio-safe-zones" aria-hidden="true">
                  <div className="studio-safe-zone-top"><span>Topo reservado (perfil e barra)</span></div>
                  <div className="studio-safe-zone-right"><span>Ícones</span></div>
                  <div className="studio-safe-zone-bottom"><span>Base reservada (resposta, legenda e áudio)</span></div>
                </div>
              )}
              {region && region.width > 0 && (
                <div
                  className="studio-area-mark"
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.width * 100}%`,
                    height: `${region.height * 100}%`,
                  }}
                />
              )}
              {visibleMarks.map(
                (mark) =>
                  mark.kind === "area" && (
                    <div
                      key={mark.id}
                      className="studio-area-mark saved"
                      style={{
                        left: `${mark.x * 100}%`,
                        top: `${mark.y * 100}%`,
                        width: `${mark.width * 100}%`,
                        height: `${mark.height * 100}%`,
                      }}
                      title={mark.note}
                    />
                  ),
              )}
            </div>
          )}
          {isMultiFrame && (
            <div className="studio-frame-strip" aria-label="Lâminas deste post">
              <div className="studio-frame-strip-list">
                {orderedFrames.map(item => (
                  <FrameThumb
                    key={item.id}
                    frame={item}
                    blob={frameBlobs[item.id] ?? (item.position === 1 ? base : null)}
                    active={item.id === activeFrame?.id}
                    onSelect={() => {
                      onSelectFrame?.(item.id);
                      setGridView(false);
                    }}
                  />
                ))}
                {onAddFrame && orderedFrames.length < formatOption.maxFrames && (
                  <button type="button" className="studio-button-secondary studio-frame-add" onClick={onAddFrame}>
                    + Lâmina
                  </button>
                )}
              </div>
              {draft.content.carouselPlan&&<p className="studio-hint">Ajuste a quantidade de lâminas no plano da conversa.</p>}
              {anchorBlob && remainingPendingCount > 0 && onGenerateRemainingFrames && (
                <button
                  type="button"
                  className="studio-button"
                  disabled={!canTriggerAI}
                  onClick={onGenerateRemainingFrames}
                >
                  Gerar demais lâminas ({remainingPendingCount})
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {wrapInspector(<>
        <div className="studio-copy-toolbar">
          <p className="studio-hint">Estes textos orientam a próxima geração. Alterá-los não modifica os pixels da arte atual.</p>
          {onRefineCopy && (
            <button
              type="button"
              className="studio-button-secondary"
              disabled={!canTriggerAI}
              onClick={onRefineCopy}
            >
              Refinar copy com IA
            </button>
          )}
        </div>
        {activeFrame && onUpdateFrame ? (
          <section className="studio-frame-copy-editor" aria-label={`Textos da lâmina ${activeFrame.position}`}>
            <h4>Lâmina {activeFrame.position} de {orderedFrames.length}</h4>
            <label>
              Papel na sequência
              <input
                value={activeFrame.role}
                maxLength={80}
                placeholder="Ex.: capa, problema, mecanismo, detalhe, cta"
                onChange={e => onUpdateFrame(activeFrame.id, { role: e.target.value })}
              />
            </label>
            <label>
              Manchete na imagem (gancho)
              <input
                value={activeFrame.headline}
                maxLength={500}
                onChange={e => onUpdateFrame(activeFrame.id, { headline: e.target.value })}
              />
            </label>
            <label>
              Texto de apoio / complemento
              <textarea
                value={activeFrame.body}
                maxLength={1000}
                rows={2}
                onChange={e => onUpdateFrame(activeFrame.id, { body: e.target.value })}
              />
            </label>
            <label>
              Pista visual da lâmina
              <input
                value={activeFrame.visualCue}
                maxLength={500}
                placeholder="Ex.: close do objeto, diagrama simples, cena de uso"
                onChange={e => onUpdateFrame(activeFrame.id, { visualCue: e.target.value })}
              />
            </label>
            {draft.content.visualInvariants && (
              <p className="studio-hint"><strong>Invariantes do conjunto:</strong> {draft.content.visualInvariants}</p>
            )}
          </section>
        ) : (
          <label>
            Título
            <input
              value={draft.content.headline}
              maxLength={500}
              onChange={(e) => onEdit?.("headline", e.target.value)}
            />
          </label>
        )}
        {visibleFields.size > 0 && <div className="studio-field-pair">
          {visibleFields.has("price") && <label>
            Preço
            <input
              value={draft.content.price}
              maxLength={100}
              onFocus={() => setAddedFields(fields => fields.includes("price") ? fields : [...fields, "price"])}
              onChange={(e) => onEdit?.("price", e.target.value)}
            />
          </label>}
          {visibleFields.has("date") && <label>
            Data
            <input
              value={draft.content.date}
              maxLength={100}
              onFocus={() => setAddedFields(fields => fields.includes("date") ? fields : [...fields, "date"])}
              onChange={(e) => onEdit?.("date", e.target.value)}
            />
          </label>}
        </div>}
        {visibleFields.size < 2 && <details className="studio-optional-fields">
          <summary>Adicionar outras informações</summary>
          <div className="studio-optional-actions">
            {!visibleFields.has("price") && <button type="button" className="studio-button-secondary" onClick={() => setAddedFields(fields => [...fields, "price"])}>Adicionar preço</button>}
            {!visibleFields.has("date") && <button type="button" className="studio-button-secondary" onClick={() => setAddedFields(fields => [...fields, "date"])}>Adicionar data</button>}
          </div>
        </details>}
        {(draft.content.fields ?? []).map(field => <div className="studio-custom-field" key={field.id}>
          <label>{field.label}
            <input value={field.value} maxLength={500} onChange={event => {
              const next = { ...field, value: event.target.value, origin: "user" as const };
              if (!creativeFieldSchema.safeParse(next).success) { setError("Não foi possível usar esse texto no campo."); return; }
              setError(""); onSetField?.(next);
            }} />
          </label>
          <button type="button" className="studio-button-secondary" aria-label={`Remover ${field.label}`} onClick={() => onRemoveField?.(field.id)}>Remover</button>
        </div>)}
        {(draft.content.fields?.length ?? 0) < 20 && <details className="studio-optional-fields">
          <summary>Adicionar outro campo</summary>
          <div className="studio-optional-actions">
            <label>Nome do campo<input value={newFieldLabel} maxLength={80} onChange={event => setNewFieldLabel(event.target.value)} /></label>
            <button type="button" className="studio-button-secondary" disabled={!newFieldLabel.trim()} onClick={() => {
              const label = newFieldLabel.trim();
              if (!label) return;
              const field = { id: crypto.randomUUID(), label, value: "", origin: "user" as const };
              if (!creativeFieldSchema.safeParse(field).success) { setError("Não foi possível usar esse nome de campo."); return; }
              setError(""); onSetField?.(field);
              setNewFieldLabel("");
            }}>Adicionar campo</button>
          </div>
        </details>}
        <label>
          Legenda
          <textarea
            value={draft.content.caption}
            maxLength={4000}
            rows={3}
            onChange={(e) => onEdit?.("caption", e.target.value)}
          />
        </label>
        {region && (
          <div className="studio-adjustment-note">
            <div className="studio-area-coordinates">
              {([
                ["x", "Posição horizontal"],
                ["y", "Posição vertical"],
                ["width", "Largura"],
                ["height", "Altura"],
              ] satisfies [keyof Region, string][]).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    type="range"
                    min={field === "x" || field === "y" ? 0 : 0.01}
                    max={
                      field === "x"
                        ? 1 - region.width
                        : field === "y"
                          ? 1 - region.height
                          : field === "width"
                            ? 1 - region.x
                            : 1 - region.y
                    }
                    step="0.01"
                    value={region[field]}
                    onChange={(event) =>
                      setRegion((value) => value ? ({
                        ...value,
                        [field]: Number(event.target.value),
                      }) : null)
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              O que deve mudar nesta área?
              <textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={
                !note.trim() ||
                region.width < 0.01 || region.height < 0.01
              }
              onClick={() => {
                onMark?.({
                  ...region,
                  kind: "area",
                  note,
                  ...(activeFrame ? { frameId: activeFrame.id } : {}),
                });
                setRegion(null);
                setNote("");
              }}
            >
              Adicionar ao pedido
            </button>
          </div>
        )}
        {visibleMarks.length > 0 && (
          <section className="studio-mark-list" aria-label="Marcações deste post">
            <h3>Marcações para o próximo pedido</h3>
            <ol>
              {visibleMarks.map((mark, index) => (
                <li key={mark.id}>
                  <strong>
                    {mark.kind === "element"
                      ? `Elemento ${elementLabels[mark.elementId] || mark.elementId}`
                      : `Área ${index + 1}`}
                  </strong>
                  <p>{mark.note}</p>
                  <button
                    type="button"
                    aria-label={`Remover marcação ${index + 1}`}
                    onClick={() => onRemoveMark?.(mark.id)}
                  >
                    Remover marcação
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="studio-editor-actions">
          <button
            type="button"
            disabled={draft.dirty || draft.baseVersion < 1}
            aria-describedby={draft.dirty || draft.baseVersion < 1 ? approvalHint : undefined}
            onClick={() => onApprove?.()}
          >
            Aprovar esta versão
          </button>
        </div>
        {draft.approval?.status === "approved" && draft.approval.kind === "inherited" && <p className="studio-hint">Aprovação herdada da versão {draft.approval.sourceVersion}. Esta herança não representa uma nova revisão humana.</p>}
        {(draft.dirty || draft.baseVersion < 1) && (
          <p id={approvalHint} className="studio-hint">Salve a versão para aprovar este post.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </>)}
    </div>
  );
}

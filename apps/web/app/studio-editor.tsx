"use client";
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import "./studio-editor-fields.css";

import { creativeFieldSchema, type Brief, type StudioDraft, type StudioMark, type CreativeField } from "../lib/studio-domain";
import { suggestedArtworkFields, type OptionalArtworkField } from "../lib/studio-editor-fields.ts";
type Region = {x: number;y: number;width: number;height: number};
export type NewMark = Region & {kind: "area"; note: string};
export type EditorPanel = {id: string; label: string; title: string; className?: string; content: ReactNode};
const elementLabels: Record<string, string> = { headline: "título", price: "preço", date: "data" };

export default function StudioEditor({
  draft,
  brief,
  marks = [],
  base = null,
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
}: {draft: StudioDraft | null;brief: Brief;marks?: StudioMark[];base?: Blob | null;onEdit?: (field: "headline"|"price"|"date"|"caption",value: string) => void;onSetField?: (field: CreativeField) => void;onRemoveField?: (id: string) => void;onMark?: (mark: NewMark) => void;onRemoveMark?: (id: string) => void;onApprove?: () => void;onViewArt?: () => void;guided?:boolean;panels?:EditorPanel[];panelRequest?:{id:string;nonce:number}|null}) {
  const [mode, setMode] = useState("select"),
    [region, setRegion] = useState<Region | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [addedFields, setAddedFields] = useState<OptionalArtworkField[]>([]),
    [newFieldLabel, setNewFieldLabel] = useState(""),
    [image, setImage] = useState<{blob:Blob;url:string} | null>(null),
    [openPanels, setOpenPanels] = useState<string[]>([]);
  const url = base && image?.blob === base ? image.url : null;
  const frame = useRef<HTMLDivElement>(null),
    start = useRef<{x:number;y:number} | null>(null);
  const approvalHint = useId(), panelId = useId();
  useEffect(() => {
    setRegion(null);
    setAddedFields([]);
    setNewFieldLabel("");
    setNote("");
    setError("");
  }, [draft?.pieceId, draft?.baseVersion]);
  useEffect(() => {
    if (!panelRequest) return;
    setOpenPanels(open => open.includes(panelRequest.id) ? open : [...open, panelRequest.id]);
    requestAnimationFrame(() => document.getElementById(`${panelId}-${panelRequest.id}`)?.focus());
  }, [panelRequest, panelId]);
  useEffect(() => {
    if (guided && region) setOpenPanels(open => open.includes("texts") ? open : [...open, "texts"]);
  }, [guided, region]);
  useEffect(() => {
    if (!base) {
      setImage(null);
      return;
    }
    const object = URL.createObjectURL(base);
    setImage({blob:base,url:object});
    return () => URL.revokeObjectURL(object);
  }, [base]);
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
  const allPanels: EditorPanel[] = [{id: "texts", label: "Textos", title: "Editar textos, legenda e aprovação", className: "studio-post-inspector", content: null}, ...panels];
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
        <div className="studio-editor-panel-heading"><h3>{panel.title}</h3><button type="button" aria-label={`Fechar ${panel.title}`} onClick={() => {document.getElementById(`${panelId}-${panel.id}-toggle`)?.focus();togglePanel(panel.id);}}>×</button></div>
        {panel.id === "texts" ? inspector : panel.content}
      </section>)}
    </aside>;
  }
  return (
    <div className={guided ? "studio-editor is-guided" : "studio-editor"}>
      <div className="studio-canvas-tools">
        <button
          type="button"
          aria-pressed={mode === "select"}
          onClick={() => {
            setMode("select");
            setRegion(null);
            onViewArt?.();
          }}
        >
          Ver arte
        </button>
        <button
          type="button"
          disabled={!base}
          aria-pressed={mode === "area"}
          onClick={() => {
            setMode("area");
            setRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
          }}
        >
          Marcar área
        </button>
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
      {wrapFrame(<div
        ref={frame}
        className={`studio-post-frame ${mode === "area" ? "is-marking" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          start.current = null;
        }}
        aria-label="Arte integral do post"
      >
        {url && (
          <img
            className="studio-post-base"
            src={url}
            alt="Arte integral da versão selecionada"
          />
        )}
        {!url && <div className="studio-art-empty"><h2>A sua ideia ganha forma aqui</h2><p>Conte o que quer comunicar ou traga uma referência. Vamos criar a arte inteira, incluindo os textos.</p></div>}
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
        {marks.map(
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
      </div>)}
      {wrapInspector(<>
        <p className="studio-hint">Estes textos orientam a próxima geração. Alterá-los não modifica os pixels da arte atual.</p>
        <label>
          Título
          <input
            value={draft.content.headline}
            maxLength={500}
            onChange={(e) => onEdit?.("headline", e.target.value)}
          />
        </label>
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
              const next={...field,value:event.target.value,origin:"user" as const};
              if (!creativeFieldSchema.safeParse(next).success) {setError("Não foi possível usar esse texto no campo.");return;}
              setError("");onSetField?.(next);
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
              const field={id:crypto.randomUUID(),label,value:"",origin:"user" as const};
              if (!creativeFieldSchema.safeParse(field).success) {setError("Não foi possível usar esse nome de campo.");return;}
              setError("");onSetField?.(field);
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
                });
                setRegion(null);
                setNote("");
              }}
            >
              Adicionar ao pedido
            </button>
          </div>
        )}
        {marks.length > 0 && (
          <section className="studio-mark-list" aria-label="Marcações deste post">
            <h3>Marcações para o próximo pedido</h3>
            <ol>
              {marks.map((mark, index) => (
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
        {draft.approval?.status==="approved"&&draft.approval.kind==="inherited"&&<p className="studio-hint">Aprovação herdada da versão {draft.approval.sourceVersion}. Esta herança não representa uma nova revisão humana.</p>}
        {(draft.dirty || draft.baseVersion < 1) && (
          <p id={approvalHint} className="studio-hint">Salve a versão para aprovar este post.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </>)}
    </div>
  );
}

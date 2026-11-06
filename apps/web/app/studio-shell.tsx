"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Project } from "./studio-ui-types";
import "./studio-shell.css";

const assets = "/studio/";
export type StudioTab = "post" | "moodboard" | "direction" | "facts" | "history";
export type StudioStage = "projects" | "brief" | "briefing" | "persona" | "connect" | "confirm" | "review" | "export" | "studio";
export type StudioDrawer = "bases" | "marca" | null;
export type StudioLayout = "b" | "c";
export type StudioShellProps = {
  stage?: StudioStage;
  projectId?: string;
  projectTitle?: string;
  pieceSubtitle?: string;
  projects?: Project[];
  onOpenProject?: (project: Project) => void;
  onRenameProject?: (title: string) => boolean | void | Promise<boolean | void>;
  onNavigate?: (stage: StudioStage) => void;
  onTabChange?: (tab: StudioTab) => void;
  onNewProject?: () => void;
  onReview?: () => void;
  canOpenStudio?: boolean;
  userLabel?: string;
  statusText?: string;
  versionStatus?: string;
  children?: ReactNode;
  canvas?: ReactNode;
  chat?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
  bases?: ReactNode;
  marca?: ReactNode;
  basesCount?: number;
  drawer?: StudioDrawer;
  onDrawerChange?: (drawer: StudioDrawer) => void;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  yellowDownload?: boolean;
  viewingArt?: boolean;
  onCloseArt?: () => void;
  onLayoutChange?: (layout: StudioLayout) => void;
};
const stageTitles: Partial<Record<StudioStage, string>> = {
  projects: "Seus projetos",
  brief: "Conte a sua ideia",
  briefing: "Conte a sua ideia",
  persona: "Conhecendo quem vai comprar",
  connect: "Conectar sua IA",
  confirm: "Confirmar antes de começar",
  review: "Revisar post e legenda",
  export: "Exportar arte e legenda",
};

function layoutKey(projectId: string) {
  return projectId ? `compor-studio-chat-layout:${projectId}` : "";
}

export default function StudioShell({
  stage = "projects",
  projectId = "",
  projectTitle = "",
  pieceSubtitle = "",
  projects = [],
  onOpenProject,
  onRenameProject,
  onNavigate,
  onTabChange,
  onNewProject,
  onReview,
  canOpenStudio = false,
  userLabel = "",
  statusText = "",
  versionStatus = "Rascunho",
  children,
  canvas,
  chat,
  headerActions,
  footer,
  overlays,
  bases = null,
  marca = null,
  basesCount = 0,
  drawer = undefined,
  onDrawerChange,
  onDownload,
  downloadDisabled = false,
  yellowDownload = true,
  viewingArt = false,
  onCloseArt,
  onLayoutChange,
}: StudioShellProps) {
  const renameId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const basesTrigger = useRef<HTMLButtonElement>(null);
  const marcaTrigger = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const layoutListener = useRef(onLayoutChange);
  layoutListener.current = onLayoutChange;
  const isStudio = stage === "studio";
  const showChrome = bases != null || marca != null;
  const showChat = Boolean(chat) && isStudio;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(projectTitle);
  const [barHeight, setBarHeight] = useState(64);
  const [internalDrawer, setInternalDrawer] = useState<StudioDrawer>(null);
  const [persistedCollapsed, setPersistedCollapsed] = useState(false);
  const controlledDrawer = onDrawerChange != null;
  const activeDrawer = controlledDrawer ? (drawer ?? null) : internalDrawer;
  const layoutC = showChat && (persistedCollapsed || Boolean(viewingArt));
  const initials = userLabel
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  const barTitle = projectTitle || stageTitles[stage] || "Estúdio";
  const canOpenMenu = Boolean(
    projectTitle || onNewProject || onRenameProject || onNavigate || projects.length,
  );

  function persistCollapse(collapsed: boolean) {
    setPersistedCollapsed(collapsed);
    const key = layoutKey(projectId);
    if (key) {
      try {
        sessionStorage.setItem(key, collapsed ? "collapsed" : "open");
      } catch {
        /* The choice stays in memory when the browser rejects storage. */
      }
    }
    layoutListener.current?.(collapsed ? "c" : "b");
  }
  function updateDrawer(next: StudioDrawer) {
    if (!controlledDrawer) setInternalDrawer(next);
    onDrawerChange?.(next);
    if (!next) {
      const trigger = activeDrawer === "bases" ? basesTrigger : marcaTrigger;
      trigger.current?.focus();
    }
  }
  function openStudio() {
    onNavigate?.("studio");
    onTabChange?.("post");
  }

  useEffect(() => {
    setRenameValue(projectTitle);
  }, [projectTitle]);
  useEffect(() => {
    const key = layoutKey(projectId);
    let stored = false;
    if (key) {
      try {
        stored = sessionStorage.getItem(key) === "collapsed";
      } catch {
        stored = false;
      }
    }
    persistCollapse(stored || Boolean(viewingArt));
  }, [projectId, viewingArt]);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const update = () => setBarHeight(bar.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);
  useEffect(() => {
    if (!activeDrawer) return;
    drawerRef.current?.focus();
  }, [activeDrawer]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (menuOpen) {
        setMenuOpen(false);
        menuTrigger.current?.focus();
        return;
      }
      if (activeDrawer) {
        updateDrawer(null);
        return;
      }
      if (viewingArt) onCloseArt?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, activeDrawer, viewingArt, projectId]);

  const fallbackActions =
    headerActions ||
    (stage === "projects" && onNewProject ? (
      <button className="studio-button" type="button" onClick={onNewProject}>
        Novo projeto
      </button>
    ) : isStudio && onReview ? (
      <button className="studio-button" type="button" onClick={onReview}>
        Revisar post
      </button>
    ) : null);

  return (
    <div
      className="compor-studio"
      data-stage={stage}
      data-layout={layoutC ? "c" : "b"}
      data-art={viewingArt ? "open" : "closed"}
      style={{ "--studio-bar": `${barHeight}px` } as CSSProperties}
    >
      <a className="studio-skip" href="#studio-main">
        Ir para o conteúdo
      </a>
      <header className="studio-topbar" ref={barRef}>
        <div className="studio-topbar-start">
          <div className="studio-brand">
            <span className="studio-logo-mark">
              <img src={`${assets}brand-symbol.svg`} alt="" width="22" height="22" />
            </span>
            <img
              className="studio-wordmark"
              src={`${assets}brand-wordmark.svg`}
              alt="Compor"
              width="84"
              height="17"
            />
          </div>
          <div className="studio-project-menu" ref={menuRef}>
            <div className="studio-project-heading">
              <h1>
                {canOpenMenu ? (
                  <button
                    ref={menuTrigger}
                    type="button"
                    className="studio-project-trigger"
                    aria-expanded={menuOpen}
                    aria-haspopup="dialog"
                    aria-controls="studio-project-menu"
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    {barTitle}
                    <span aria-hidden="true">▾</span>
                  </button>
                ) : (
                  barTitle
                )}
              </h1>
              {versionStatus && projectTitle ? (
                <span className="studio-badge">{versionStatus}</span>
              ) : null}
            </div>
            {pieceSubtitle ? <p className="studio-project-subtitle">{pieceSubtitle}</p> : null}
            {menuOpen ? (
              <div id="studio-project-menu" role="dialog" aria-label="Projetos" className="studio-menu-panel">
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate("projects");
                    }}
                  >
                    Todos os projetos
                  </button>
                ) : null}
                {projects.length > 0 ? (
                  <div className="studio-menu-projects">
                    <p>Trocar de projeto</p>
                    {projects.map((project) => (
                      <button
                        type="button"
                        key={project.id}
                        aria-current={project.id === projectId ? "true" : undefined}
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenProject?.(project);
                        }}
                      >
                        {project.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                {onNewProject ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNewProject();
                    }}
                  >
                    Novo projeto
                  </button>
                ) : null}
                {onRenameProject && projectTitle ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const title = renameValue.trim();
                      if (!title || title === projectTitle) return;
                      Promise.resolve(onRenameProject(title)).then((saved) => {
                        if (saved !== false) setMenuOpen(false);
                      });
                    }}
                  >
                    <label htmlFor={renameId}>
                      Renomear
                      <input
                        id={renameId}
                        value={renameValue}
                        maxLength={200}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                    </label>
                    <button type="submit">Salvar nome</button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="studio-topbar-end">
          {fallbackActions}
          {canOpenStudio && !isStudio && onNavigate ? (
            <button className="studio-button-secondary" type="button" onClick={openStudio}>
              Estúdio
            </button>
          ) : null}
          {showChrome ? (
            <>
              <button
                ref={basesTrigger}
                type="button"
                className="studio-chip"
                aria-expanded={activeDrawer === "bases"}
                onClick={() => updateDrawer(activeDrawer === "bases" ? null : "bases")}
              >
                Bases ({basesCount})
              </button>
              <button
                ref={marcaTrigger}
                type="button"
                className="studio-chip"
                aria-expanded={activeDrawer === "marca"}
                onClick={() => updateDrawer(activeDrawer === "marca" ? null : "marca")}
              >
                Marca
              </button>
            </>
          ) : null}
          {onDownload ? (
            <button
              type="button"
              className={yellowDownload ? "studio-button studio-button-yellow" : "studio-button studio-button-secondary"}
              disabled={downloadDisabled}
              onClick={onDownload}
            >
              Baixar
            </button>
          ) : null}
          <div className="studio-account">
            {initials ? (
              <span className="studio-initials" aria-hidden="true">
                {initials}
              </span>
            ) : null}
            <span>{userLabel || "Conta"}</span>
            {statusText ? (
              <span className="studio-save-status" role="status">
                {statusText}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <div className="studio-body" data-chat={showChat && !layoutC ? "open" : "collapsed"}>
        {showChat ? (
          <div className="studio-chat-slot">
            <aside className="studio-conversation" aria-label="Conversa com a IA">
              <button
                type="button"
                className="studio-collapse"
                aria-label="Recolher conversa"
                onClick={() => persistCollapse(true)}
              >
                Recolher
              </button>
              {chat}
            </aside>
          </div>
        ) : null}
        <main id="studio-main" tabIndex={-1} className={isStudio ? "studio-canvas-column" : "studio-page-content"}>
          {isStudio ? (canvas ?? children) : children}
        </main>
      </div>
      {layoutC ? (
        <div className="studio-floating-bar">
          <button
            type="button"
            className="studio-floating-input"
            aria-label="Abrir conversa"
            onClick={() => {
              persistCollapse(false);
              onCloseArt?.();
            }}
          >
            Escreva uma mensagem…
          </button>
        </div>
      ) : null}
      {viewingArt ? (
        <button type="button" className="studio-art-close" onClick={() => onCloseArt?.()}>
          Fechar arte
        </button>
      ) : null}
      {activeDrawer ? (
        <>
          <button type="button" className="studio-drawer-backdrop" aria-label="Fechar painel" onClick={() => updateDrawer(null)} />
          <div
            ref={drawerRef}
            role="dialog"
            tabIndex={-1}
            aria-label={activeDrawer === "bases" ? "Bases" : "Marca"}
            className="studio-drawer"
          >
            {activeDrawer === "bases" ? bases : marca}
          </div>
        </>
      ) : null}
      {footer ? <footer className="studio-footer">{footer}</footer> : null}
      {overlays}
    </div>
  );
}

export function StudioPanel({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {eyebrow?: string;title?: string;description?: string;children?: ReactNode;actions?: ReactNode}) {
  return (
    <section className="studio-panel">
      {eyebrow && <p className="studio-eyebrow">{eyebrow}</p>}
      {title && <h2>{title}</h2>}
      {description && <p className="studio-panel-description">{description}</p>}
      <div className="studio-panel-content">{children}</div>
      {actions && <div className="studio-panel-actions">{actions}</div>}
    </section>
  );
}

export function CreativeBoard({
  title = "Vamos encontrar a sua direção.",
  description = "Explore as ideias e versões do projeto.",
  children,
  onCurrentPost,
  surfaceWidth = 1500,
  surfaceHeight = 1060,
}: {title?: string;description?: string;children?: ReactNode;onCurrentPost?: () => void;surfaceWidth?: number;surfaceHeight?: number}) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  function fit() {
    const area = viewport.current;
    if (!area) return;
    setZoom(
      Math.max(
        0.25,
        Math.min(
          1,
          (area.clientWidth - 24) / surfaceWidth,
          (area.clientHeight - 24) / surfaceHeight,
        ),
      ),
    );
    area.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }
  return (
    <section className="studio-board">
      <div className="studio-board-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="studio-badge">Quadro criativo</span>
      </div>
      <div
        ref={viewport}
        className="studio-board-viewport"
        tabIndex={0}
        aria-label="Quadro criativo, use as barras de rolagem para explorar"
      >
        <div
          className="studio-board-size"
          style={{ width: surfaceWidth * zoom, height: surfaceHeight * zoom }}
        >
          <div
            className="studio-board-surface"
            style={{
              width: surfaceWidth,
              height: surfaceHeight,
              transform: `scale(${zoom})`,
            }}
          >
            <div
              className="studio-board-dots"
              style={{
                gridTemplateColumns: `repeat(${Math.ceil(surfaceWidth / 72)}, 72px)`,
              }}
              aria-hidden="true"
            >
              {Array.from(
                {
                  length:
                    Math.ceil(surfaceWidth / 72) *
                    Math.ceil(surfaceHeight / 72),
                },
                (_, index) => (
                  <span key={index}>
                    <img
                      src={`${assets}dot.svg`}
                      alt=""
                      width="1.5"
                      height="1.5"
                    />
                  </span>
                ),
              )}
            </div>
            <div className="studio-board-content">{children}</div>
          </div>
        </div>
      </div>
      <div
        className="studio-board-controls"
        role="group"
        aria-label="Controles do quadro"
      >
        <button
          type="button"
          aria-label="Diminuir zoom"
          disabled={zoom <= 0.25}
          onClick={() =>
            setZoom((value) =>
              Math.max(0.25, Math.round((value - 0.1) * 100) / 100),
            )
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label="Restaurar zoom a 100%"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          disabled={zoom >= 2}
          onClick={() =>
            setZoom((value) =>
              Math.min(2, Math.round((value + 0.1) * 100) / 100),
            )
          }
        >
          +
        </button>
        <button type="button" onClick={fit}>
          Ver quadro todo
        </button>
        {onCurrentPost && (
          <button type="button" onClick={onCurrentPost}>
            Post atual
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            viewport.current?.scrollBy({
              left: Math.max(200, viewport.current.clientWidth * 0.7),
              behavior: "smooth",
            })
          }
        >
          Explorar <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="studio-board-hint">
        Clique em uma versão para aproximar · role para explorar o quadro
      </p>
    </section>
  );
}

export function StudioEmptyBoard({ onStartIdea, onAddReference }: {onStartIdea?: () => void;onAddReference?: () => void}) {
  return (
    <div className="studio-empty-board">
      <h3>
        Uma boa ideia
        <br />
        começa com uma conversa.
      </h3>
      <p>
        Conte o que você quer divulgar. Enquanto a gente conversa, o seu quadro
        ganha referências, textos e possibilidades.
      </p>
      <div className="studio-empty-actions">
        {onStartIdea && (
          <button
            className="studio-button"
            type="button"
            onClick={onStartIdea}
          >
            Divulgar meu curso
          </button>
        )}
        {onAddReference && (
          <button
            className="studio-button studio-button-secondary"
            type="button"
            onClick={onAddReference}
          >
            Tenho uma referência
          </button>
        )}
      </div>
      <small>Você continua no comando de cada escolha.</small>
    </div>
  );
}

export function StudioChatPanel({
  children,
  composer,
  statusText = "Vamos compor juntos.",
}: {children?: ReactNode;composer?: ReactNode;statusText?: string}) {
  return (
    <>
      <header className="studio-chat-header">
        <img
          src={`${assets}compor-avatar.svg`}
          alt=""
          width="26"
          height="26.4044"
        />
        <div>
          <h2>Compor</h2>
          <p>{statusText}</p>
        </div>
      </header>
      <div className="studio-chat-messages">{children}</div>
      {composer && <div className="studio-chat-composer">{composer}</div>}
    </>
  );
}

"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Project } from "./studio-ui-types";
import AccountMenu from "./account-menu";
import "./studio-shell.css";
import "./studio-reference-workspace.css";

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
  accountLabel?: string;
  localAccount?: boolean;
  onSignOut?: () => void | Promise<void>;
  statusText?: string;
  versionStatus?: string;
  children?: ReactNode;
  canvas?: ReactNode;
  chat?: ReactNode;
  conversationFocus?: boolean;
  chatMessageCount?: number;
  headerActions?: ReactNode;
  context?: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
  bases?: ReactNode;
  marca?: ReactNode;
  basesCount?: number;
  drawer?: StudioDrawer;
  onDrawerChange?: (drawer: StudioDrawer) => void;
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
  return projectId ? `compor-studio-chat-layout:v2:${projectId}` : "";
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
  accountLabel = "",
  localAccount = false,
  onSignOut,
  statusText = "",
  versionStatus = "Rascunho",
  children,
  canvas,
  chat,
  conversationFocus = false,
  chatMessageCount = 0,
  headerActions,
  context,
  footer,
  overlays,
  bases = null,
  marca = null,
  basesCount = 0,
  drawer = undefined,
  onDrawerChange,
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
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const chatPanel = useRef<HTMLElement>(null);
  const resizeDrag = useRef<{pointerId:number;startY:number;startHeight:number}|null>(null);
  const [chatHeight,setChatHeight] = useState<number|null>(null);
  const [availableHeight,setAvailableHeight] = useState(620);
  const [chatDetailsVisible,setChatDetailsVisible] = useState(true);
  const [fixedChatHeight,setFixedChatHeight] = useState(0);
  const lastMessageCount = useRef(chatMessageCount);
  const [unread, setUnread] = useState(false);
  const [compactReferences, setCompactReferences] = useState(false);
  const [referenceChatCollapsed, setReferenceChatCollapsed] = useState(false);
  const [compactChatOpen, setCompactChatOpen] = useState(false);
  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const update = () => setCompactReferences(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const update=()=>setAvailableHeight(Math.max(1,Math.floor((window.visualViewport?.height ?? window.innerHeight)-32)));
    update();window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);
    return ()=>{window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);};
  },[]);
  const minimumChatHeight=Math.min(availableHeight,Math.max(fixedChatHeight,chatDetailsVisible && availableHeight+32<=550 ? 260 : 180));
  const maximumChatHeight=availableHeight;
  const currentChatHeight=Math.min(maximumChatHeight,Math.max(minimumChatHeight,chatHeight ?? Math.min(620,Math.round((availableHeight+32)*0.48))));
  const resizeChat=(height:number)=>setChatHeight(Math.min(maximumChatHeight,Math.max(minimumChatHeight,Math.round(height))));
  useLayoutEffect(() => {
    setChatHeight(height => {
      const selected=height ?? Math.min(620,Math.round((availableHeight+32)*0.48));
      const next=Math.min(maximumChatHeight,Math.max(minimumChatHeight,selected));
      return height===null && next===selected ? null : next;
    });
  },[minimumChatHeight,maximumChatHeight,availableHeight]);
  const layoutListener = useRef(onLayoutChange);
  layoutListener.current = onLayoutChange;
  const isStudio = stage === "studio";
  const showChrome = bases != null || marca != null;
  const showChat = Boolean(chat) && isStudio;
  const referenceWorkspace = showChat && conversationFocus;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(projectTitle);
  const [barHeight, setBarHeight] = useState(64);
  const [internalDrawer, setInternalDrawer] = useState<StudioDrawer>(null);
  const [persistedCollapsed, setPersistedCollapsed] = useState(true);
  const controlledDrawer = onDrawerChange != null;
  const activeDrawer = controlledDrawer ? (drawer ?? null) : internalDrawer;
  const layoutC = showChat && (Boolean(viewingArt) || (referenceWorkspace
    ? compactReferences ? !compactChatOpen : referenceChatCollapsed
    : persistedCollapsed));
  useLayoutEffect(() => {
    const panel=chatPanel.current;
    if(!showChat||!panel)return;
    const header=panel.querySelector<HTMLElement>('.studio-chat-header');
    const meta=panel.querySelector<HTMLElement>('.studio-chat-meta');
    const composer=panel.querySelector<HTMLElement>('.studio-chat-composer');
    if(!header||!meta||!composer)return;
    const update=()=>{
      setChatDetailsVisible(!meta.hidden);
      setFixedChatHeight(Math.ceil(header.offsetHeight+meta.offsetHeight+composer.offsetHeight+18));
    };
    update();
    const observer=new ResizeObserver(update);
    for(const element of [header,meta,composer])observer.observe(element);
    return()=>observer.disconnect();
  },[showChat,projectId]);
  const displayedChatHeight=currentChatHeight;
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
  function setChatCollapsed(collapsed: boolean) {
    if (referenceWorkspace) {
      if (compactReferences) setCompactChatOpen(!collapsed);
      else setReferenceChatCollapsed(collapsed);
      layoutListener.current?.(collapsed ? "c" : "b");
    } else persistCollapse(collapsed);
  }
  function openChat() {
    setChatCollapsed(false);
    onCloseArt?.();
    requestAnimationFrame(() => {
      if (document.activeElement !== chatTrigger.current && document.activeElement !== document.body) return;
      const input = chatPanel.current?.querySelector<HTMLTextAreaElement>("textarea:not([disabled])");
      if (input) input.focus(); else chatPanel.current?.focus();
    });
  }
  useEffect(() => {
    setReferenceChatCollapsed(false);
    setCompactChatOpen(false);
  }, [projectId]);
  useLayoutEffect(() => {
    // A breakpoint must not leave keyboard focus in either now-hidden area.
    if (referenceWorkspace && layoutC && chatPanel.current?.contains(document.activeElement)) chatTrigger.current?.focus();
    if (referenceWorkspace && compactReferences && !layoutC && document.activeElement?.closest("#studio-main, .studio-context, .studio-topbar-end")) chatTrigger.current?.focus();
  }, [referenceWorkspace, compactReferences, layoutC]);
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
    if (layoutC && chatMessageCount > lastMessageCount.current) setUnread(true);
    if (!layoutC) setUnread(false);
    lastMessageCount.current = chatMessageCount;
  }, [chatMessageCount, layoutC]);
  useEffect(() => {
    const key = layoutKey(projectId);
    let stored = true;
    if (key) {
      try {
        stored = sessionStorage.getItem(key) !== "open";
      } catch {
        stored = true;
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
      if (showChat && !layoutC) {
        setChatCollapsed(true);
        requestAnimationFrame(() => chatTrigger.current?.focus());
        return;
      }
      if (viewingArt) onCloseArt?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, activeDrawer, viewingArt, projectId, showChat, layoutC, referenceWorkspace, compactReferences]);

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
      data-conversation-focus={conversationFocus ? "true" : "false"}
      data-chat-presentation={referenceWorkspace ? "sidebar" : "floating"}
      data-reference-compact={referenceWorkspace && compactReferences ? "true" : "false"}
      data-layout={layoutC ? "c" : "b"}
      data-art={viewingArt ? "open" : "closed"}
      style={{ "--studio-bar": `${barHeight}px`, "--studio-viewport-height": `${availableHeight + 32}px` } as CSSProperties}
    >
      <a className="studio-skip" href={referenceWorkspace && compactReferences && !layoutC ? "#studio-floating-chat" : "#studio-main"}>
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
                    title={barTitle}
                    aria-expanded={menuOpen}
                    aria-haspopup="dialog"
                    aria-controls="studio-project-menu"
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <span className="studio-truncate">{barTitle}</span>
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
                        title={project.title}
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
                      if (!title) return;
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
          <div className="studio-account">
            <AccountMenu label={accountLabel || userLabel || "Conta"} local={localAccount} onSignOut={onSignOut} />
            {statusText ? (
              <span className="studio-save-status" role="status">
                {statusText}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {isStudio ? context : null}
      {referenceWorkspace && (compactReferences || layoutC) ? (
        <nav className="studio-reference-switcher" aria-label="Áreas da criação">
          {compactReferences ? <button type="button" aria-controls="studio-main" aria-pressed={layoutC} onClick={() => setChatCollapsed(true)}>Referências</button> : <span>Conversa recolhida</span>}
          <button ref={chatTrigger} type="button" aria-label="Abrir conversa" aria-controls="studio-floating-chat" aria-expanded={!layoutC} onClick={openChat}>
            <img src="/studio/compor-avatar.svg" alt="" width="20" height="20" />
            Conversa
            {unread && <span className="studio-chat-unread" aria-live="polite">Nova mensagem</span>}
          </button>
        </nav>
      ) : null}
      <div className="studio-body" data-chat={showChat && !layoutC ? "open" : "collapsed"}>
        <main id="studio-main" tabIndex={-1} className={isStudio ? "studio-canvas-column" : "studio-page-content"} hidden={referenceWorkspace && compactReferences && !layoutC}>
          {isStudio ? (canvas ?? children) : children}
        </main>
        {showChat ? (
          <div className="studio-chat-slot" style={referenceWorkspace ? undefined : {height:`min(${currentChatHeight}px, calc(100dvh - 32px))`}}>
            <aside ref={chatPanel} id="studio-floating-chat" tabIndex={-1} className="studio-conversation" aria-label="Conversa com a IA">
              {!referenceWorkspace && <div className="studio-chat-resize" role="slider" tabIndex={0} aria-label="Altura da conversa" aria-orientation="vertical" aria-valuemin={minimumChatHeight} aria-valuemax={maximumChatHeight} aria-valuenow={displayedChatHeight} aria-valuetext={`${displayedChatHeight} pixels`} onPointerDown={event=>{resizeDrag.current={pointerId:event.pointerId,startY:event.clientY,startHeight:chatPanel.current?.offsetHeight ?? displayedChatHeight};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const drag=resizeDrag.current;if(drag?.pointerId===event.pointerId)resizeChat(drag.startHeight+drag.startY-event.clientY);}} onPointerUp={event=>{if(resizeDrag.current?.pointerId===event.pointerId)resizeDrag.current=null;}} onPointerCancel={()=>{resizeDrag.current=null;}} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowRight')resizeChat(displayedChatHeight+32);else if(event.key==='ArrowDown'||event.key==='ArrowLeft')resizeChat(displayedChatHeight-32);else if(event.key==='Home')resizeChat(minimumChatHeight);else if(event.key==='End')resizeChat(maximumChatHeight);else return;event.preventDefault();}} />}
              <button
                type="button"
                className="studio-collapse"
                aria-label="Recolher conversa"
                onClick={() => { setChatCollapsed(true); requestAnimationFrame(() => chatTrigger.current?.focus()); }}
              >
                Recolher
              </button>
              {chat}
            </aside>
          </div>
        ) : null}
      </div>
      {showChat && !referenceWorkspace ? (
        <div className="studio-floating-bar" hidden={!layoutC}>
          <button
            ref={chatTrigger}
            type="button"
            className="studio-floating-input"
            aria-label="Abrir conversa"
            aria-expanded={!layoutC}
            aria-controls="studio-floating-chat"
            onClick={openChat}
          >
            <img src="/studio/compor-avatar.svg" alt="" width="24" height="24" />
            <span className="studio-floating-placeholder">Escreva uma mensagem…</span>
            {unread && <span className="studio-chat-unread" aria-live="polite">Nova mensagem</span>}
            <span className="studio-floating-arrow" aria-hidden="true">↑</span>
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
  actions,
  onCurrentPost,
  surfaceWidth = 1500,
  surfaceHeight = 1060,
}: {title?: string;description?: string;children?: ReactNode;actions?:ReactNode;onCurrentPost?: () => void;surfaceWidth?: number;surfaceHeight?: number}) {
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
        {actions ?? <span className="studio-badge">Quadro criativo</span>}
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

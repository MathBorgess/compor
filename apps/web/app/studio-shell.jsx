"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./studio-shell.css";

const assets = "/studio/";
const tabs = [
  { id: "post", label: "Estúdio" },
  { id: "moodboard", label: "Moodboard" },
  { id: "facts", label: "Fatos e textos" },
  { id: "history", label: "Histórico" },
];
const stageTitles = {
  projects: "Seus projetos",
  brief: "Conte a sua ideia",
  briefing: "Conte a sua ideia",
  persona: "Conhecendo quem vai comprar",
  connect: "Conectar sua IA",
  confirm: "Confirmar antes de começar",
  review: "Revisar post e legenda",
  export: "Exportar arte e legenda",
};

export default function StudioShell({
  stage = "projects",
  projectTitle = "",
  pieceSubtitle = "",
  activeTab = "post",
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
}) {
  const tabGroup = useId();
  const tabList = useRef(null);
  const isStudio = stage === "studio";
  const selectedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "post";
  const initials = userLabel
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  useEffect(() => {
    const list = tabList.current;
    const tab = list?.querySelector('[aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (left + tab.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = left + tab.offsetWidth - list.clientWidth;
  }, [selectedTab, isStudio]);
  function showHistory() {
    onNavigate?.("studio");
    onTabChange?.("history");
  }
  function moveTab(event, currentIndex) {
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex + direction + tabs.length) % tabs.length;
    onTabChange?.(tabs[next].id);
    event.currentTarget.parentElement
      .querySelectorAll('[role="tab"]')
      [next]?.focus();
  }
  return (
    <div className="compor-studio" data-stage={stage}>
      <a className="studio-skip" href="#studio-main">
        Ir para o conteúdo
      </a>
      <aside className="studio-sidebar" aria-label="Navegação Compor">
        <div className="studio-brand" aria-label="Compor">
          <img
            src={`${assets}brand-symbol.svg`}
            alt=""
            width="30"
            height="30.4667"
          />
          <img
            src={`${assets}brand-wordmark.svg`}
            alt="Compor"
            width="100"
            height="20.0997"
          />
        </div>
        <p className="studio-byline">por We MathAI</p>
        <nav className="studio-navigation" aria-label="Navegação principal">
          <button
            type="button"
            aria-current={stage === "projects" ? "page" : undefined}
            onClick={() => onNavigate?.("projects")}
            disabled={!onNavigate}
          >
            <img src={`${assets}folder.svg`} alt="" width="18" height="18" />
            Projetos
          </button>
          <button
            type="button"
            aria-current={
              isStudio && selectedTab !== "history" ? "page" : undefined
            }
            onClick={() => {
              onNavigate?.("studio");
              onTabChange?.("post");
            }}
            disabled={!canOpenStudio || !onNavigate}
          >
            <img src={`${assets}image.svg`} alt="" width="18" height="18" />
            Estúdio
          </button>
          <button
            type="button"
            aria-current={
              isStudio && selectedTab === "history" ? "page" : undefined
            }
            onClick={showHistory}
            disabled={!canOpenStudio || !onNavigate || !onTabChange}
          >
            <img src={`${assets}history.svg`} alt="" width="18" height="18" />
            Versões
          </button>
        </nav>
        {projectTitle && (
          <div className="studio-current-project">
            <p className="studio-micro">SEU PROJETO</p>
            <p className="studio-current-title">{projectTitle}</p>
            <p>Um post, várias ideias.</p>
          </div>
        )}
        {userLabel && (
          <div className="studio-account">
            <span className="studio-initials" aria-hidden="true">
              {initials}
            </span>
            <span>{userLabel}</span>
          </div>
        )}
      </aside>
      <div className="studio-main-column">
        <header className="studio-project-header">
          <div className="studio-project-title">
            <h1>{projectTitle || stageTitles[stage] || "Estúdio"}</h1>
            {pieceSubtitle && <p>{pieceSubtitle}</p>}
          </div>
          {projectTitle && (
            <span className="studio-badge">{versionStatus}</span>
          )}
          <div className="studio-header-actions">
            {headerActions ||
              (stage === "projects" && onNewProject ? (
                <button
                  className="studio-button"
                  type="button"
                  onClick={onNewProject}
                >
                  Novo projeto
                </button>
              ) : isStudio && onReview ? (
                <button
                  className="studio-button"
                  type="button"
                  onClick={onReview}
                >
                  Revisar post
                </button>
              ) : null)}
          </div>
        </header>
        {isStudio && (
          <div className="studio-project-tabs">
            <div ref={tabList} role="tablist" aria-label="Conteúdo do projeto">
              {tabs.map((tab, index) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`${tabGroup}-${tab.id}`}
                  aria-selected={selectedTab === tab.id}
                  aria-controls={`${tabGroup}-panel`}
                  tabIndex={selectedTab === tab.id ? 0 : -1}
                  onKeyDown={(event) => moveTab(event, index)}
                  onClick={() => onTabChange?.(tab.id)}
                  disabled={!onTabChange}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {statusText && (
              <span className="studio-save-status" role="status">
                {statusText}
              </span>
            )}
          </div>
        )}
        <main
          id="studio-main"
          tabIndex={-1}
          className={isStudio ? "studio-workspace" : "studio-page-content"}
        >
          {isStudio ? (
            <>
              <section
                className="studio-canvas-column"
                id={`${tabGroup}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabGroup}-${selectedTab}`}
              >
                {canvas ?? children}
              </section>
              {chat && (
                <aside
                  className="studio-conversation"
                  aria-label="Conversa com a IA"
                >
                  {chat}
                </aside>
              )}
            </>
          ) : (
            children
          )}
        </main>
        {footer && <footer className="studio-footer">{footer}</footer>}
      </div>
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
}) {
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
}) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef(null);
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

export function StudioEmptyBoard({ onStartIdea, onAddReference }) {
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
            className="studio-button studio-button-yellow"
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
}) {
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

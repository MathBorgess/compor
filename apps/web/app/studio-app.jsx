"use client";
import { useEffect, useRef, useState } from "react";
import StudioShell, { StudioPanel, CreativeBoard } from "./studio-shell";
import PersonaStep from "./persona-step";
import StudioEditor from "./studio-editor";
import { useStudioState } from "./use-studio-state";
import {
  updateBrief,
  updatePersona,
  createPost,
  selectVersion,
  selectDraft,
  getCurrentDraft,
  editDraft,
  addMark,
  removeMark,
  addReference,
  removeReference,
  approveDraft,
  recordSavedVersion,
  recordActionReceipt,
} from "../lib/studio-state.mjs";
import { createStudioTools } from "../lib/studio-tools.mjs";
import StudioChat from "./studio-chat";
import StudioDialog from "./studio-dialog";
import StudioAssets from "./studio-assets";

export default function StudioApp({
  userId,
  hasApiKey,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  recoveryBanner,
  isAuthenticated,
}) {
  const [projects, setProjects] = useState([]),
    [selected, setSelected] = useState(null),
    [projectName, setProjectName] = useState(""),
    [state, setState] = useState("loading"),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const seq = useRef(0);
  async function refresh() {
    const n = ++seq.current;
    setState("loading");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (n !== seq.current) return;
      setProjects(data.projects);
      setState("ready");
    } catch {
      if (n === seq.current) {
        setState("error");
        setNotice("Não foi possível carregar seus projetos.");
      }
    }
  }
  useEffect(() => {
    refresh();
    return () => {
      seq.current++;
    };
  }, [userId]);
  async function create(event) {
    event.preventDefault();
    if (state !== "ready" || uncertain || !projectName.trim()) return;
    setState("creating");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: projectName }),
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      setProjects((items) => [...items, data.project]);
      setSelected(data.project);
      setProjectName("");
      setState("ready");
    } catch {
      setUncertain(true);
      setState("ready");
      setNotice(
        "A criação pode ter acontecido. Atualize a lista antes de criar outro projeto.",
      );
    }
  }
  if (selected)
    return (
      <ProjectStudio
        key={`${userId}:${selected.id}`}
        userId={userId}
        isAuthenticated={isAuthenticated}
        project={selected}
        onBack={() => {setSelected(null);refresh();}}
        hasApiKey={hasApiKey}
        getApiKey={getApiKey}
        keyInput={keyInput}
        onRemoveKey={onRemoveKey}
        initialObjective={initialObjective}
      />
    );
  return (
    <StudioShell
      stage="projects"
      statusText="Conta conectada"
      onNewProject={() =>
        document.getElementById("studio-project-name")?.focus()
      }
    >
      {recoveryBanner}
      <StudioPanel
        eyebrow="UM LUGAR PARA SUAS IDEIAS"
        title="Seus projetos"
        description="Retome uma criação ou comece uma nova história."
      >
        {state === "loading" && <p role="status">Carregando seus projetos…</p>}
        <div className="studio-project-grid">
          {projects.map((project) => (
            <button
              className="studio-project-card"
              key={project.id}
              onClick={() => setSelected(project)}
            >
              <span className="studio-project-art" aria-hidden="true">
                C
              </span>
              <strong>{project.title}</strong>
              <span>Abrir projeto →</span>
            </button>
          ))}
        </div>
        {state !== "loading" && projects.length === 0 && (
          <p>Você ainda não tem projetos. Seu primeiro post começa aqui.</p>
        )}
        <form onSubmit={create} className="studio-project-create">
          <label htmlFor="studio-project-name">Nome do projeto</label>
          <input
            id="studio-project-name"
            maxLength={200}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Ex.: lançamento da minha aula"
          />
          <button
            className="studio-button"
            disabled={state !== "ready" || uncertain || !projectName.trim()}
          >
            {state === "creating" ? "Criando…" : "Criar projeto"}
          </button>
        </form>
        {notice && <p role="alert">{notice}</p>}
        {(state === "error" || uncertain) && (
          <button type="button" onClick={refresh}>
            Atualizar projetos
          </button>
        )}
        {uncertain && (
          <button type="button" onClick={() => setUncertain(false)}>
            Entendi, iniciar outra criação
          </button>
        )}
      </StudioPanel>
    </StudioShell>
  );
}

function ProjectStudio({
  userId,
  project,
  onBack,
  hasApiKey,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  isAuthenticated,
}) {
  const local = useStudioState({ userId, projectId: project.id }),
    s = local.state;
  const [stage, setStage] = useState("brief"),
    [tab, setTab] = useState("post"),
    [versions, setVersions] = useState([]),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [base, setBase] = useState(null),
    [preview, setPreview] = useState(null),
    [references, setReferences] = useState([]),
    [proposal, setProposal] = useState(null),
    [dialog, setDialog] = useState(null),
    [projectDetails, setProjectDetails] = useState(project),
    [compact, setCompact] = useState(false);
  const stateRef = useRef(null),
    versionRef = useRef([]),
    toolsRef = useRef(null),
    confirmResolver = useRef(null),
    active = useRef(true),
    saveLock = useRef(false),
    baseLoadGeneration=useRef(0),
    versionsReadSequence=useRef(0);
  useEffect(() => {
    const media = window.matchMedia("(max-width:600px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  stateRef.current = s;
  versionRef.current = versions;
  const draft = s ? getCurrentDraft(s) : null;
  async function refreshVersions() {
    const readSequence=++versionsReadSequence.current;
    const response = await fetch(
      `/api/pieces?projectId=${encodeURIComponent(project.id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw Error("Não foi possível carregar as versões.");
    const data = await response.json();
    if (active.current&&readSequence===versionsReadSequence.current) setVersions(data.versions);
    return data.versions;
  }
  useEffect(() => {
    active.current = true;
    refreshVersions().catch(() =>
      setNotice("As versões não estão disponíveis."),
    );
    return () => {
      active.current = false;
      confirmResolver.current?.(false);
    };
  }, [project.id]);
  useEffect(() => {
    if (s && initialObjective && !s.brief.direction)
      local.change((value) =>
        updateBrief(value, { direction: initialObjective }),
      );
  }, [Boolean(s)]);
  useEffect(() => {
    if (!s) return;
    try {
      const saved = sessionStorage.getItem(
        `compor-studio-stage:${userId}:${project.id}`,
      );
      if (
        [
          "brief",
          "persona",
          "connect",
          "confirm",
          "studio",
          "review",
          "export",
        ].includes(saved)
      )
        setStage(saved);
    } catch {}
  }, [Boolean(s)]);
  useEffect(() => {
    if (!s) return;
    try {
      sessionStorage.setItem(
        `compor-studio-stage:${userId}:${project.id}`,
        stage,
      );
    } catch {}
  }, [stage, userId, project.id, Boolean(s)]);
  useEffect(() => {
    if (!s || !local.storage.current) return;
    let live = true;
    const urls = [];
    Promise.all(
      s.references.map(async (ref) => {
        const value = await local.storage.current.getReference(
          { userId, projectId: project.id },
          ref.id,
        );
        if (!value || !live) return null;
        const url = URL.createObjectURL(value.file);
        urls.push(url);
        return { ...ref, url };
      }),
    )
      .then((items) => {
        if (live) setReferences(items.filter(Boolean));
      })
      .catch(() => {
        if (live)
          setNotice(
            "Não foi possível recuperar as referências deste navegador.",
          );
      });
    return () => {
      live = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [s?.references, project.id, userId]);
  useEffect(() => {
    setPreview(null);
    setBase(null);
    const loadGeneration=++baseLoadGeneration.current;
    if (!draft || !local.storage.current) return;
    let live = true;
    local.storage.current
      .getDraftAsset(
        { userId, projectId: project.id },
        {
          pieceId: draft.pieceId,
          baseVersion: draft.baseVersion,
          kind: "base",
        },
      )
      .then((value) => {
        if (live && loadGeneration===baseLoadGeneration.current && value) setBase(value.file);
      })
      .catch(() => {
        if (live)
          setNotice("Não foi possível recuperar a imagem local desta versão.");
      });
    return () => {
      live = false;
    };
  }, [draft?.pieceId, draft?.baseVersion]);
  async function useBase({ blob, pieceId, version }) {
    baseLoadGeneration.current++;
    try {
      await local.storage.current.putDraftAsset({
        userId,
        projectId: project.id,
        pieceId,
        baseVersion: version,
        kind: "base",
        file: blob,
      });
      const current = getCurrentDraft(local.get());
      if (
        active.current &&
        current?.pieceId === pieceId &&
        current.baseVersion === version
      )
        setBase(blob);
      else if (active.current)
        setNotice("A imagem está preservada no rascunho da versão de origem.");
    } catch {
      if (active.current)
        setNotice(
          "Não foi possível preservar a imagem no navegador. O arquivo anterior foi mantido.",
        );
    }
  }

  useEffect(() => {
    setPreview(null);
  }, [
    base,
    draft?.content.headline,
    draft?.content.price,
    draft?.content.date,
  ]);

  function nextStage(value) {
    setStage(value);
    setNotice("");
  }
  function newPost(pieceId = crypto.randomUUID()) {
    local.change((value) =>
      value.drafts.some((d) => d.pieceId === pieceId && d.baseVersion === 0)
        ? selectDraft(value, { pieceId, baseVersion: 0 })
        : createPost(value, { pieceId }),
    );
    setBase(null);
    setPreview(null);
    setTab("post");
    setStage("studio");
  }
  function openVersion(version) {
    const latest = versionRef.current
      .filter((v) => v.piece_id === version.piece_id)
      .reduce((n, v) => Math.max(n, v.version), 0);
    local.change((value) =>
      selectVersion(value, {
        pieceId: version.piece_id,
        version: version.version,
        latestVersion: latest,
        content: version.content,
        approval:
          version.metadata?.approval?.status === "approved"
            ? version.metadata.approval
            : { status: "unapproved" },
      }),
    );
    setTab("post");
    setStage("studio");
  }
  function confirmAction(action) {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setDialog(action);
    });
  }
  function resolveConfirmation(yes) {
    confirmResolver.current?.(yes);
    confirmResolver.current = null;
    setDialog(null);
  }
  async function saveCurrent(args) {
    const current = local.get(),
      d = getCurrentDraft(current);
    if (!d || saveLock.current) throw Error("save_unavailable");
    if (
      args?.pieceId &&
      (args.pieceId !== d.pieceId ||
        args.baseVersion !== d.baseVersion ||
        args.expectedLatestVersion !== d.expectedLatestVersion)
    )
      throw Error("context_changed");
    saveLock.current = true;
    setSaving(true);
    setNotice("");
    try {
      await local.flush();
      versionsReadSequence.current++;
      const response = await fetch("/api/pieces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          pieceId: d.pieceId,
          expectedVersion: d.expectedLatestVersion,
          baseVersion: d.baseVersion,
          content: d.content,
        }),
      });
      const data = await response.json();
      if (response.status === 409) {
        setNotice(
          "Outra versão foi salva. Seu rascunho foi preservado; consulte o histórico antes de continuar.",
        );
        return { status: "unknown" };
      }
      if (!response.ok || data.status !== "saved") throw Error("save_unknown");
      if (!active.current) return { status: "unknown" };
      versionsReadSequence.current++;
      setVersions((items) => [...items.filter(item=>item.piece_id!==data.version.piece_id||item.version!==data.version.version), data.version]);
      local.change((value) =>
        recordSavedVersion(value, {
          pieceId: d.pieceId,
          baseVersion: d.baseVersion,
          version: data.version.version,
          content: data.version.content,
          approval: data.version.metadata?.approval.status === "approved" ? data.version.metadata.approval : data.version.metadata ? {status:"unapproved"} : undefined,
          eventId: crypto.randomUUID(),
        }),
      );
      if (base)
        await useBase({
          blob: base,
          pieceId: d.pieceId,
          version: data.version.version,
        });
      setNotice("Nova versão salva.");
      return {
        status: "completed",
        pieceId: d.pieceId,
        version: data.version.version,
      };
    } catch {
      setNotice(
        "O resultado do salvamento é desconhecido. Seu rascunho continua nesta aba; consulte as versões antes de repetir.",
      );
      return { status: "unknown" };
    } finally {
      saveLock.current = false;
      if (active.current) setSaving(false);
    }
  }
  const handlers = useRef({});
  handlers.current = {
    compor_contexto: async () => {
      const state = local.get(),
        d = getCurrentDraft(state);
      return {
        status: "completed",
        projectId: project.id,
        revision: state.revision,
        pieceId: d?.pieceId ?? null,
        baseVersion: d?.baseVersion ?? null,
        expectedLatestVersion: d?.expectedLatestVersion ?? 0,
        unsaved: Boolean(d?.dirty),
      };
    },
    compor_editar_briefing: async (args) => {
      local.change((value) => updateBrief(value, { [args.field]: args.value }));
      return { status: "completed", local: true };
    },
    compor_editar_persona: async (args) => {
      local.change((value) =>
        updatePersona(value, { [args.field]: args.value }),
      );
      return { status: "completed", local: true };
    },
    compor_registrar_afirmacao_persona: async (args) => {
      if (
        !local.get().persona.claims.some((claim) => claim.id === args.requestId)
      )
        local.change((value) =>
          updatePersona(value, {
            claims: [
              ...value.persona.claims,
              {
                id: args.requestId,
                text: args.text,
                provenance: args.provenance,
                ...(args.source ? { source: args.source } : {}),
              },
            ],
          }),
        );
      return { status: "completed", local: true };
    },
    compor_novo_post: async (args) => {
      newPost(args.requestId);
      return {
        status: "completed",
        local: true,
        pieceId: args.requestId,
        baseVersion: 0,
        expectedLatestVersion: 0,
      };
    },
    compor_editar_peca: async (args) => {
      const d = getCurrentDraft(local.get());
      if (
        !d ||
        d.pieceId !== args.pieceId ||
        d.baseVersion !== args.baseVersion
      )
        throw Error("context_changed");
      local.change((value) =>
        editDraft(value, { field: args.field, value: args.value }),
      );
      return { status: "completed", local: true };
    },
    compor_abrir_versao: async (args) => {
      const version = versionRef.current.find(
        (v) => v.piece_id === args.pieceId && v.version === args.version,
      );
      if (!version) throw Error("version_unavailable");
      openVersion(version);
      return { status: "completed" };
    },
    compor_salvar_versao: saveCurrent,
    compor_renomear_projeto: async (args) => {
      const response = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: args.title,
          expectedRevision: projectDetails.revision ?? 0,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "renamed") {
        setNotice(
          "Não foi possível confirmar a alteração do nome. Atualize os projetos antes de repetir.",
        );
        return { status: "unknown" };
      }
      if (active.current) setProjectDetails(data.project);
      return { status: "completed", title: data.project.title };
    },
    compor_propor_imagem: async (args) => {
      setProposal({ prompt: args.prompt });
      return { status: "pending_confirmation" };
    },
  };
  useEffect(() => {
    if (!s) return;
    const tools = createStudioTools({
      getScope: () => {
        const value = local.get();
        return {
          userId: isAuthenticated?.() === false ? null : userId,
          projectId: project.id,
          revision: value?.revision,
        };
      },
      handlers: Object.fromEntries(
        [
          "compor_contexto",
          "compor_editar_briefing",
          "compor_editar_persona",
          "compor_registrar_afirmacao_persona",
          "compor_novo_post",
          "compor_editar_peca",
          "compor_abrir_versao",
          "compor_salvar_versao",
          "compor_renomear_projeto",
          "compor_propor_imagem",
        ].map((name) => [name, (...args) => handlers.current[name](...args)]),
      ),
      confirm: confirmAction,
      getReceipt: (id) =>
        local.get()?.actionReceipts.find((receipt) => receipt.requestId === id),
      canRecord: () => local.get()?.actionReceipts.length < 200,
      saveReceipt: async (receipt) => {
        const result = {
          ...receipt.result,
          revision: local.get().revision + 1,
        };
        local.change((value) =>
          recordActionReceipt(value, { ...receipt, result }),
        );
        await local.flush();
        return result;
      },
    });
    toolsRef.current = tools;
    let registration;
    tools
      .register(document.modelContext)
      .then((value) => (registration = value));
    return () => {
      tools.dispose();
      registration?.dispose();
      toolsRef.current = null;
    };
  }, [Boolean(s), project.id, userId]);
  async function addFiles(files) {
    if (!local.storage.current) return;
    try {
      for (const file of files) {
        const metadata = await local.storage.current.putReference({
          userId,
          projectId: project.id,
          id: crypto.randomUUID(),
          file,
        });
        local.change((value) => addReference(value, metadata));
      }
      setNotice("Referências adicionadas neste navegador.");
    } catch {
      setNotice(
        "Não foi possível adicionar a imagem. Use PNG ou JPEG dentro dos limites informados.",
      );
    }
  }
  async function removeFile(id) {
    local.change((value) => removeReference(value, id));
    try {
      await local.flush();
      await local.storage.current?.removeReference(
        { userId, projectId: project.id },
        id,
      );
      if (active.current) setNotice("Referência removida do moodboard.");
    } catch (error) {
      if (active.current)
        setNotice(
          error.code === "studio_reference_in_use"
            ? "A referência saiu do moodboard e continua preservada no histórico local de ajustes."
            : "A referência saiu do moodboard, mas não foi possível confirmar a remoção do arquivo local.",
        );
    }
  }
  if (local.loading || !s)
    return (
      <StudioShell stage="projects" statusText="Conta conectada">
        <p role="status">Abrindo seu espaço de criação…</p>
      </StudioShell>
    );
  const editor = (
    <StudioEditor
      draft={draft}
      base={base}
      marks={s.marks.filter(
        (m) =>
          m.pieceId === draft?.pieceId && m.baseVersion === draft?.baseVersion,
      )}
      onEdit={(field, value) =>
        local.change((state) => editDraft(state, { field, value }))
      }
      onMark={(mark) =>
        local.change((value) =>
          addMark(value, { ...mark, id: crypto.randomUUID() }),
        )
      }
      onRemoveMark={(id) => local.change((value) => removeMark(value, id))}
      onPreview={(blob) => {
        const current=getCurrentDraft(local.get());
        if(current?.pieceId!==draft?.pieceId||current?.baseVersion!==draft?.baseVersion||JSON.stringify(current?.content)!==JSON.stringify(draft?.content))return;
        setPreview(blob);
        setStage("review");
      }}
      onApprove={async () => {
        const selected = getCurrentDraft(local.get());
        const version = versionRef.current.find(
          (v) =>
            v.piece_id === selected?.pieceId &&
            v.version === selected?.baseVersion,
        );
        if (!selected || selected.dirty || !version) {
          setNotice("Salve a versão antes de aprovar.");
          return;
        }
        try {
          const response = await fetch("/api/pieces", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "approve",
              projectId: project.id,
              pieceId: selected.pieceId,
              version: selected.baseVersion,
              expectedRevision: version.metadata?.revision ?? 0,
            }),
          });
          const data = await response.json();
          if (!response.ok || data.status !== "approved") throw Error();
          versionsReadSequence.current++;
          await refreshVersions();
          const current = getCurrentDraft(local.get());
          if (
            current?.pieceId === selected.pieceId &&
            current.baseVersion === selected.baseVersion &&
            !current.dirty
          )
            local.change((value) =>
              approveDraft(value, {
                at:
                  data.version?.metadata?.approval?.at ??
                  new Date().toISOString(),
                eventId: crypto.randomUUID(),
              }),
            );
          setNotice("Aprovação salva nesta versão.");
        } catch {
          setNotice(
            "Não foi possível confirmar a aprovação. Consulte as versões antes de repetir.",
          );
        }
      }}
    />
  );
  const chat = (
    <StudioChat
      state={s}
      getState={local.get}
      change={local.change}
      flush={local.flush}
      tools={toolsRef}
      hasApiKey={hasApiKey}
      getApiKey={getApiKey}
      onUseImage={useBase}
      loadBase={async () => {
        const d = getCurrentDraft(local.get());
        return d
          ? local.storage.current?.getDraftAsset(
              { userId, projectId: project.id },
              { pieceId: d.pieceId, baseVersion: d.baseVersion, kind: "base" },
            )
          : null;
      }}
      loadReference={(id) =>
        local.storage.current?.getReference(
          { userId, projectId: project.id },
          id,
        )
      }
    />
  );
  return (
    <StudioShell
      stage={stage}
      projectTitle={projectDetails.title}
      activeTab={tab}
      statusText="Conta conectada"
      canOpenStudio
      versionStatus={
        draft?.approval.status === "approved"
          ? "Aprovado"
          : draft?.dirty
            ? "Rascunho"
            : draft?.baseVersion
              ? `Versão ${draft.baseVersion}`
              : "Rascunho"
      }
      onTabChange={setTab}
      onNewProject={onBack}
      onBack={onBack}
      onNavigate={(value) =>
        value === "projects" ? onBack() : nextStage(value)
      }
      onReview={() => nextStage("review")}
      headerActions={
        <>
          <button
            className="studio-button-secondary"
            onClick={() => nextStage("connect")}
          >
            {hasApiKey ? "IA conectada" : "Conectar IA"}
          </button>
          <button
            className="studio-button"
            disabled={!draft || saving}
            onClick={() => saveCurrent()}
          >
            {saving ? "Salvando…" : "Salvar versão"}
          </button>
        </>
      }
      canvas={
        tab === "history" ? (
          <div className="studio-history">
            <h2>Histórico do projeto</h2>
            <button className="studio-button" onClick={()=>newPost()}>Novo post</button>
            <button
              onClick={() =>
                refreshVersions().catch(() =>
                  setNotice("Não foi possível atualizar as versões."),
                )
              }
            >
              Atualizar versões
            </button>
            <h3>Rascunhos neste navegador</h3>
            {s.drafts.map((item) => (
              <button
                key={`${item.pieceId}:${item.baseVersion}`}
                onClick={() => {
                  local.change((value) =>
                    selectDraft(value, {
                      pieceId: item.pieceId,
                      baseVersion: item.baseVersion,
                    }),
                  );
                  setTab("post");
                  setStage("studio");
                }}
              >
                <strong>{item.content.headline || "Post sem título"}</strong>
                <span>
                  {item.baseVersion
                    ? `Base: versão ${item.baseVersion}`
                    : "Novo post"}
                  {item.dirty ? " · alterações locais" : ""}
                </span>
              </button>
            ))}
            <h3>Versões salvas</h3>
            {versions.map((version) => (
              <button
                key={`${version.piece_id}:${version.version}`}
                onClick={() => openVersion(version)}
              >
                <strong>{version.content.headline || "Post sem título"}</strong>
                <span>Versão {version.version}{version.version===Math.max(...versions.filter(item=>item.piece_id===version.piece_id).map(item=>item.version))?" · atual":""}</span>
                {version.metadata?.approval.status==="approved"&&<small>{version.metadata.approval.kind==="inherited"?`Aprovação herdada da versão ${version.metadata.approval.sourceVersion}`:"Aprovação explícita"}</small>}
              </button>
            ))}
          </div>
        ) : tab === "moodboard" ? (
          <div className="studio-moodboard">
            <h2>Referências da sua criação</h2>
            <p>Estas imagens permanecem neste navegador.</p>
            <label>
              Adicionar PNG ou JPEG
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                onChange={(e) => {
                  addFiles([...e.target.files]);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="studio-reference-grid">
              {references.map((ref) => (
                <figure key={ref.id}>
                  <img src={ref.url} alt={ref.name} />
                  <figcaption>{ref.name}</figcaption>
                  <button onClick={() => removeFile(ref.id)}>
                    Remover referência
                  </button>
                </figure>
              ))}
            </div>
          </div>
        ) : tab === "facts" ? (
          <div>
            <h2>Fatos e direção</h2>
            <dl>
              {Object.entries(s.brief).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {
                      {
                        offer: "Oferta",
                        audience: "Público",
                        action: "Ação esperada",
                        direction: "Direção criativa",
                      }[key]
                    }
                  </dt>
                  <dd>{value || "Ainda não informado"}</dd>
                </div>
              ))}
            </dl>
            <PersonaStep
              value={s.persona}
              onChange={(value) =>
                local.change((state) => updatePersona(state, value))
              }
              onContinue={() => setTab("post")}
            />
          </div>
        ) : (
          <CreativeBoard
            title={draft ? "Post atual" : "Sua criação"}
            surfaceWidth={compact ? 352 : 772}
            surfaceHeight={compact ? 1760 : 1100}
            onCurrentPost={() => setTab("post")}
          >
            {editor}
          </CreativeBoard>
        )
      }
      chat={chat}
      overlays={
        <>
          {dialog && (
            <StudioDialog
              title="Confirmar alteração no projeto?"
              onClose={() => resolveConfirmation(false)}
            >
              <p>
                {dialog.name === "compor_salvar_versao"
                  ? "Uma nova versão será salva."
                  : "O nome do projeto será atualizado."}
              </p>
              <button onClick={() => resolveConfirmation(true)}>
                Confirmar
              </button>
              <button onClick={() => resolveConfirmation(false)}>
                Cancelar
              </button>
            </StudioDialog>
          )}
          {proposal && (
            <StudioDialog
              title="Imagem proposta"
              onClose={() => setProposal(null)}
            >
              <p>{proposal.prompt}</p>
              <p>
                Esta proposta ainda não gerou uma imagem. A execução depende da
                confirmação da chamada vinculada ao agente.
              </p>
              <button onClick={() => setProposal(null)}>
                Voltar ao estúdio
              </button>
            </StudioDialog>
          )}
        </>
      }
      footer={
        <>
          {local.error && <p role="alert">{local.error}</p>}
          {notice && <p role="status">{notice}</p>}
        </>
      }
    >
      {stage === "brief" && (
        <StudioPanel
          eyebrow="CONTE SUA IDEIA"
          title="O que vamos criar?"
          description="Uma direção começa com o que você quer comunicar."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              nextStage("persona");
            }}
          >
            {[
              ["offer", "O que você oferece?"],
              ["audience", "Para quem?"],
              ["action", "O que a pessoa deve fazer?"],
              ["direction", "Qual direção você imagina?"],
            ].map(([field, label]) => (
              <label key={field}>
                {label}
                <textarea
                  value={s.brief[field]}
                  maxLength={4000}
                  onChange={(e) =>
                    local.change((value) =>
                      updateBrief(value, { [field]: e.target.value }),
                    )
                  }
                />
              </label>
            ))}
            <button className="studio-button">Continuar</button>
          </form>
        </StudioPanel>
      )}
      {stage === "persona" && (
        <PersonaStep
          value={s.persona}
          onChange={(value) =>
            local.change((state) => updatePersona(state, value))
          }
          onBack={() => nextStage("brief")}
          onContinue={() => nextStage("connect")}
        />
      )}
      {stage === "connect" && (
        <StudioPanel
          eyebrow="SUA IA, SUA ESCOLHA"
          title="Conectar sua IA"
          description="Use sua chave OpenAI para criar com o Compor. O consumo é cobrado pela OpenAI."
        >
          {keyInput}
          <p className="studio-hint">
            Sua chave fica somente na memória desta aba. Ao recarregar, você
            pode precisar informá-la novamente.
          </p>
          <button
            className="studio-button"
            disabled={!hasApiKey}
            onClick={() => nextStage("confirm")}
          >
            Continuar
          </button>
          <button onClick={onRemoveKey} disabled={!hasApiKey}>
            Remover chave
          </button>
          <button onClick={() => nextStage("confirm")}>
            Continuar sem IA por enquanto
          </button>
        </StudioPanel>
      )}
      {stage === "confirm" && (
        <StudioPanel
          eyebrow="VOCÊ NO CONTROLE"
          title="Tudo pronto para começar?"
          description="Revise sua direção. Cada geração de imagem pedirá sua confirmação antes de consumir a API de imagem."
        >
          <h3>{s.brief.offer || "Sua nova criação"}</h3>
          <p>
            {s.brief.direction || "Você pode explorar a direção na conversa."}
          </p>
          <p>
            O custo final depende do uso da OpenAI. Ainda não há teto automático
            de gasto.
          </p>
          <button
            className="studio-button"
            onClick={() => {
              if (!draft) newPost();
              else nextStage("studio");
            }}
          >
            Abrir estúdio
          </button>
        </StudioPanel>
      )}
      {(stage === "review" || stage === "export") && (
        <StudioPanel
          eyebrow="ARTE E LEGENDA"
          title={
            stage === "review"
              ? "Revise seu post"
              : "Pronto para levar sua ideia adiante"
          }
          description="Confira arte, fatos e legenda antes de usar."
        >
          {preview ? <Preview blob={preview} /> : editor}
          <label>
            Imagem-base PNG ou JPEG
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && draft)
                  useBase({
                    blob: file,
                    pieceId: draft.pieceId,
                    version: draft.baseVersion,
                  });
                e.target.value = "";
              }}
            />
          </label>
          <p>{draft?.content.caption}</p>
          {draft && (
            <StudioAssets
              userId={userId}
              projectId={project.id}
              pieceId={draft.pieceId}
              version={draft.baseVersion}
              canSave={draft.baseVersion > 0 && !draft.dirty}
              preview={preview}
              onUseImage={useBase}
            />
          )}
          <button
            className="studio-button"
            onClick={() => {
              if (preview) {
                const url = URL.createObjectURL(preview),
                  a = document.createElement("a");
                a.href = url;
                a.download = "compor-post-1080x1350.png";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }
            }}
            disabled={!preview}
          >
            Baixar PNG
          </button>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(draft?.content.caption ?? "")
                .then(() => setNotice("Legenda copiada."))
                .catch(() =>
                  setNotice("Selecione e copie a legenda manualmente."),
                )
            }
          >
            Copiar legenda
          </button>
          <button onClick={() => nextStage("studio")}>
            Pedir ajuste no estúdio
          </button>
        </StudioPanel>
      )}
    </StudioShell>
  );
}
function Preview({ blob }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url ? (
    <img
      src={url}
      className="studio-export-preview"
      alt="Prévia da arte em 1080 por 1350 pixels"
    />
  ) : null;
}

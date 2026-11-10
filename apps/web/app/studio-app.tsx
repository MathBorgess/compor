"use client";
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import dynamic from "next/dynamic";
import StudioShell, { StudioPanel, CreativeBoard, type StudioStage, type StudioDrawer } from "./studio-shell";
const PersonaStep = dynamic(() => import("./persona-step"));
const StudioDirection = dynamic(() => import("./studio-direction"));
import StudioEditor from "./studio-editor";
import StudioReview from "./studio-review";
import { useStudioState } from "./use-studio-state";
import BriefSummary from "./brief-summary";
import ReferenceExploration from "./reference-exploration";
import type { ExploredReference } from "../lib/reference-exploration-contract";
import ExplorationGallery from "./exploration-gallery";
import { useExplorationLoop } from "./use-exploration-loop";
import { selectedExplorationKey } from "../lib/exploration-batch";
import { recordVisualFeedback,recordGeneratedComment } from "../lib/studio-visual-feedback";
import { recordReferenceRound } from "../lib/studio-reference-round";
import { submitOnEnter } from "../lib/submit-on-enter";
import { provisionalTitle } from "../lib/project-title";
import {
  updateBrief,
  updatePersona,
  addCreativeCriterion,
  recordCreativeDecision,
  createPost,
  selectVersion,
  selectDraft,
  getCurrentDraft,
  samePieceContent,
  editDraft,
  setCreativeField,
  removeCreativeField,
  addMark,
  removeMark,
  addReference,
  removeReference,
  approveDraft,
  recordSavedVersion,
  recordActionReceipt,
  resolveProjectTitle,
} from "../lib/studio-state.ts";
import { createStudioTools, type StudioModelContext } from "../lib/studio-tools.ts";
import StudioChat from "./studio-chat";
import StudioDialog from "./studio-dialog";
const StudioAssets = dynamic(() => import("./studio-assets"), {loading: () => <p role="status">Consultando imagens desta versão…</p>});

import {z} from 'zod';
import { projectsSchema, projectResponseSchema, versionsSchema, savedVersionSchema, versionSchema, type Project, type PieceVersion, type ImageSelection } from './studio-ui-types';
import type { StudioState, StudioReference, ActionResult, DraftContext } from '../lib/studio-domain';
import type { ActionInputByName, StudioActionName, StudioAction } from '@compor/agents-api/studio-chat-tools';
declare global { interface Document { readonly modelContext?: StudioModelContext } }
type StudioHandlers = {[Name in StudioActionName]:(input:ActionInputByName[Name], context?:{signal?:AbortSignal})=>Promise<ActionResult>};
type StudioAppProps={userId:string;hasApiKey:boolean;getApiKey:()=>string;keyInput:ReactNode;onRemoveKey:()=>void;initialObjective:string;recoveryBanner?:ReactNode;isAuthenticated:()=>boolean;developerMode?:boolean;accountLabel?:string;localAccount?:boolean;onSignOut?:()=>void|Promise<void>};
type ProjectStudioProps=Omit<StudioAppProps,'recoveryBanner'>&{project:Project;projects:Project[];onOpenProject:(project:Project)=>void;onProjectRenamed:(project:Project)=>void;onCreateNew:()=>void;onBack:()=>void;initialTitleProvisional:boolean};
type Confirmation={name:StudioActionName;args:StudioAction};
const renamedProjectSchema=projectResponseSchema.extend({status:z.literal('renamed')});
const approvedVersionSchema=z.object({status:z.literal('approved'),version:versionSchema});
const briefLabels:Record<string,string>={offer:'Oferta',audience:'Público',action:'Ação esperada',direction:'Direção criativa'};

export default function StudioApp({
  userId,
  hasApiKey,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  recoveryBanner,
  isAuthenticated,
  developerMode = false,
  accountLabel = "",
  localAccount = false,
  onSignOut,
}: StudioAppProps) {
  const [projects, setProjects] = useState<Project[]>([]),
    [selected, setSelected] = useState<Project|null>(null),
    [projectName, setProjectName] = useState(initialObjective || ""),
    [openingPrompt, setOpeningPrompt] = useState(""),
    [state, setState] = useState("loading"),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const seq = useRef(0);
  const focusCreate = useRef(false);
  async function refresh() {
    const n = ++seq.current;
    setState("loading");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw Error();
      const data = projectsSchema.parse(await response.json());
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
  useEffect(() => {
    if (selected || !focusCreate.current || state !== "ready") return;
    focusCreate.current = false;
    document.getElementById("studio-project-name")?.focus();
  }, [selected, state]);
  function requestCreate() {
    focusCreate.current = true;
    setOpeningPrompt("");
    setSelected(null);
    refresh();
  }
  function projectRenamed(project:Project) {
    setProjects(items => items.map(item => item.id === project.id ? {...item,...project} : item));
    setSelected(current => current?.id === project.id ? {...current,...project} : current);
  }
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "ready" || uncertain || !projectName.trim()) return;
    setState("creating");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: provisionalTitle(projectName) }),
      });
      if (!response.ok) throw Error();
      const data = projectResponseSchema.parse(await response.json());
      setProjects((items) => [...items, data.project]);
      setSelected(data.project);
      setOpeningPrompt(projectName.trim());
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
        developerMode={developerMode}
        accountLabel={accountLabel}
        localAccount={localAccount}
        onSignOut={onSignOut}
        project={selected}
        projects={projects}
        onOpenProject={project => {setOpeningPrompt("");setSelected(project);}}
        onProjectRenamed={projectRenamed}
        onCreateNew={requestCreate}
        onBack={() => {setSelected(null);refresh();}}
        hasApiKey={hasApiKey}
        getApiKey={getApiKey}
        keyInput={keyInput}
        onRemoveKey={onRemoveKey}
        initialObjective={openingPrompt || initialObjective}
        initialTitleProvisional={Boolean(openingPrompt)}
      />
    );
  return (
    <StudioShell
      stage="projects"
      accountLabel={accountLabel}
      localAccount={localAccount}
      onSignOut={onSignOut}
      onNewProject={() =>
        document.getElementById("studio-project-name")?.focus()
      }
    >
      {recoveryBanner}
      <section className="studio-starter" aria-labelledby="starter-title">
        <h2 id="starter-title">O que vamos comunicar?</h2>
        <p>Comece com uma ideia, uma oferta ou uma dúvida. A conversa ajuda a encontrar o visual e a mensagem para quem vai receber seu post.</p>
        <form onSubmit={create}>
          <label htmlFor="studio-project-name">Sua ideia</label>
          <textarea id="studio-project-name" maxLength={4000} value={projectName} onChange={event => setProjectName(event.target.value)} onKeyDown={submitOnEnter} placeholder="Quero divulgar minha mentoria com uma mensagem próxima, sem parecer mais uma promessa de resultado." />
          <button className="studio-button" disabled={state !== "ready" || uncertain || !projectName.trim()}>{state === "creating" ? "Abrindo conversa…" : "Começar conversa"}</button>
        </form>
        {notice && <p role="alert">{notice}</p>}
        {(state === "error" || uncertain) && <button type="button" onClick={refresh}>Atualizar projetos</button>}
        {uncertain && <button type="button" onClick={() => setUncertain(false)}>Entendi, iniciar outra criação</button>}
      </section>
      <section className="studio-recent-projects" aria-label="Conversas e projetos anteriores">
        <h2>Continue de onde parou</h2>
        {state === "loading" && <p role="status">Carregando seus projetos…</p>}
        <div className="studio-project-grid">
          {projects.map(project => <button className="studio-project-card" key={project.id} title={project.title} onClick={() => { setOpeningPrompt(""); setSelected(project); }}><strong className="studio-truncate">{project.title}</strong><span>Retomar conversa</span></button>)}
        </div>
      </section>
    </StudioShell>
  );
}

function ProjectStudio({
  userId,
  project,
  projects,
  onOpenProject,
  onProjectRenamed,
  onCreateNew,
  onBack,
  hasApiKey,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  initialTitleProvisional,
  isAuthenticated,
  developerMode = false,
  accountLabel = "",
  localAccount = false,
  onSignOut,
}: ProjectStudioProps) {
  const session = useStudioState({ userId, projectId: project.id, projectTitleProvisional: initialTitleProvisional }), s=session.state;
  const local = {...session,get:():StudioState=>{const value=session.get();if(!value)throw Error("O estúdio ainda está carregando.");return value;}};
  const [editorRequested, setEditorRequested] = useState(false);
  const [stageRestored, setStageRestored] = useState(false);
  const [stage, setStage] = useState<StudioStage>("studio"),
    [versions, setVersions] = useState<PieceVersion[]>([]),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [base, setBase] = useState<Blob|null>(null),
    [referenceImages, setReferenceImages] = useState<{manifest:string;items:(StudioReference & {url:string})[]}|null>(null),
    [proposal, setProposal] = useState<{prompt:string}|null>(null),
    [dialog, setDialog] = useState<Confirmation|null>(null),
    [projectDetails, setProjectDetails] = useState(project),
    [compact, setCompact] = useState(false),
    [drawer, setDrawer] = useState<StudioDrawer>(null),
    [viewingArt, setViewingArt] = useState(false);
  const referenceManifest = s ? JSON.stringify({userId, projectId:project.id, references:s.references}) : null;
  const references = referenceImages?.manifest === referenceManifest ? referenceImages.items : [];
  const stateRef = useRef<StudioState|null>(null),
    versionRef = useRef<PieceVersion[]>([]),
    toolsRef = useRef<ReturnType<typeof createStudioTools>|null>(null),
    confirmResolver = useRef<((value:boolean)=>void)|null>(null),
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
  const showBrief = !editorRequested && !base && !draft?.baseVersion && !draft?.content.headline && !draft?.content.price && !draft?.content.date && !draft?.content.caption && !draft?.content.fields?.length;
  const exploration = useExplorationLoop({ userId, projectId: project.id, state: s, getState: session.get, hasApiKey, getApiKey, isAuthenticated, enabled: stageRestored && stage === "studio" && showBrief });
  async function signOutSafely() {
    exploration.pause();
    try { if (!session.loading) await session.flush(); }
    catch (error) { setNotice("Não foi possível preservar o projeto antes de sair."); throw error; }
    await onSignOut?.();
  }
  async function refreshVersions() {
    const readSequence=++versionsReadSequence.current;
    const response = await fetch(
      `/api/pieces?projectId=${encodeURIComponent(project.id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw Error("Não foi possível carregar as versões.");
    const data = versionsSchema.parse(await response.json());
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
    if (s && !s.selection) local.change(value => createPost(value, { pieceId: crypto.randomUUID() }));
  }, [Boolean(s)]);
  useEffect(() => {
    if (!s) return;
    try {
      const saved = sessionStorage.getItem(
        `compor-studio-stage:${userId}:${project.id}`,
      );
      if (saved === "studio" || saved === "review" || saved === "export") setStage(saved);
    } catch {}
    setStageRestored(true);
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
    if (!s || !referenceManifest || !local.storage.current) return;
    let live = true;
    const urls:string[] = [];
    const storage=local.storage.current;
    Promise.all(
      s.references.map(async (ref) => {
        const value = await storage.getReference(
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
        if (live) setReferenceImages({manifest:referenceManifest,items:items.filter((item): item is StudioReference & {url:string} => item !== null)});
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
  }, [referenceManifest, project.id, userId]);
  useEffect(() => {
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
  async function useBase({ blob, pieceId, version }:ImageSelection) {
    baseLoadGeneration.current++;
    try {
      if(!local.storage.current)throw Error("Armazenamento indisponível.");
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
      return true;
    } catch {
      if (active.current)
        setNotice(
          "Não foi possível preservar a imagem no navegador. O arquivo anterior foi mantido.",
        );
      return false;
    }
  }

  function nextStage(value:StudioStage) {
    setStage(value);
    setNotice("");
    if(value !== "studio") setViewingArt(false);
  }
  function newPost(pieceId:string = crypto.randomUUID()) {
    setEditorRequested(false);
    local.change((value) =>
      value.drafts.some((d) => d.pieceId === pieceId && d.baseVersion === 0)
        ? selectDraft(value, { pieceId, baseVersion: 0 })
        : createPost(value, { pieceId }),
    );
    setBase(null);
    setDrawer(null);
    setViewingArt(false);
    setStage("studio");
  }
  function openVersion(version:PieceVersion) {
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
    setDrawer(null);
    setViewingArt(false);
    setStage("studio");
  }
  function confirmAction(action:Confirmation) {
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setDialog(action);
    });
  }
  function resolveConfirmation(yes:boolean) {
    confirmResolver.current?.(yes);
    confirmResolver.current = null;
    setDialog(null);
  }
  async function saveCurrent(args?:DraftContext):Promise<ActionResult> {
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
      const input:unknown = await response.json();
      if (response.status === 409) {
        // A previous save may have succeeded even if its response was not recorded locally.
        // Recover only when the immediately following version has the same base and content.
        const versions = await refreshVersions();
        const matching = versions.filter(item => item.piece_id === d.pieceId);
        const latest = matching.reduce<PieceVersion | null>((previous, item) => !previous || item.version > previous.version ? item : previous, null);
        if (latest?.version === d.expectedLatestVersion + 1 && latest.metadata?.baseVersion === (d.baseVersion || null) &&
          samePieceContent(latest.content, d.content)) {
          if (!active.current) return { status: "unknown" };
          const storage=local.storage.current;
          if (!storage) throw Error("storage_unavailable");
          await storage.copyDraftAsset({userId,projectId:project.id},
            {pieceId:d.pieceId,baseVersion:d.baseVersion,kind:'base'},
            {pieceId:d.pieceId,baseVersion:latest.version,kind:'base'});
          if (!active.current) return { status: "unknown" };
          local.change(value => recordSavedVersion(value, {
            pieceId:d.pieceId, baseVersion:d.baseVersion, version:latest.version, content:latest.content,
            approval:latest.metadata?.approval.status === "approved" ? latest.metadata.approval : {status:"unapproved"},
            eventId:crypto.randomUUID(),
          }));
          await local.flush();
          setNotice("Recuperamos a versão que já havia sido salva. Seu rascunho foi preservado; solicite a geração novamente.");
        } else {
          setNotice("Outra versão foi salva. Seu rascunho foi preservado; consulte o histórico antes de continuar.");
        }
        return { status: "unknown" };
      }
      const data=savedVersionSchema.parse(input);
      if (!response.ok || data.status !== "saved") throw Error("save_unknown");
      if (!active.current) return { status: "unknown" };
      const storage=local.storage.current;
      if (!storage) throw Error("storage_unavailable");
      await storage.copyDraftAsset({userId,projectId:project.id},
        {pieceId:d.pieceId,baseVersion:d.baseVersion,kind:'base'},
        {pieceId:d.pieceId,baseVersion:data.version.version,kind:'base'});
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
  const handlers:StudioHandlers = {
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
                source: args.source || "",
              },
            ],
          }),
        );
      return { status: "completed", local: true };
    },
    compor_registrar_feedback_visual: async (args, context) => recordVisualFeedback(local.get(), args, fetch, context?.signal),
    compor_comentar_imagem_gerada: async (args, context) => recordGeneratedComment(local.get(), args, fetch, context?.signal),
    compor_propor_criterio: async args => {
      for (const id of [args.exampleReferenceId, args.counterexampleReferenceId].filter(Boolean)) {
        if (!local.get().references.some(reference => reference.id === id)) throw Error("reference_unavailable");
      }
      local.change(value => addCreativeCriterion(value, {
        id: args.requestId, viewpoint: args.viewpoint, dimension: args.dimension, statement: args.statement,
        example: { description: args.example, referenceId: args.exampleReferenceId || null },
        counterexample: { description: args.counterexample, referenceId: args.counterexampleReferenceId || null },
        provenance: args.provenance, source: args.source || "", tension: args.tension || "",
      }));
      setDrawer("marca");
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
    compor_adicionar_campo: async args => {
      const d=getCurrentDraft(local.get());
      if(!d || d.pieceId!==args.pieceId || d.baseVersion!==args.baseVersion) throw Error("context_changed");
      local.change(value => setCreativeField(value,{id:args.requestId,label:args.label,value:"",origin:"agent"}));
      return {status:"completed",local:true};
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
      const parsed = renamedProjectSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        setNotice(
          "Não foi possível confirmar a alteração do nome. Atualize os projetos antes de repetir.",
        );
        return { status: "unknown" };
      }
      if (parsed.data.project.id !== project.id) return { status: "unknown" };
      if (active.current) {
        local.change(resolveProjectTitle);
        await local.flush();
      }
      if (active.current) {
        setProjectDetails(parsed.data.project);
        onProjectRenamed(parsed.data.project);
      }
      return { status: "completed", title: parsed.data.project.title };
    },
    compor_propor_imagem: async (args) => {
      setProposal({ prompt: args.prompt });
      return { status: "pending_confirmation" };
    },
  };
  const handlersRef=useRef(handlers);
  handlersRef.current=handlers;
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
      handlers: {
        compor_contexto: args => handlersRef.current.compor_contexto(args),
        compor_editar_briefing: args => handlersRef.current.compor_editar_briefing(args),
        compor_editar_persona: args => handlersRef.current.compor_editar_persona(args),
        compor_registrar_afirmacao_persona: args => handlersRef.current.compor_registrar_afirmacao_persona(args),
        compor_registrar_feedback_visual: (args, context) => handlersRef.current.compor_registrar_feedback_visual(args, context),
        compor_comentar_imagem_gerada: (args, context) => handlersRef.current.compor_comentar_imagem_gerada(args, context),
        compor_propor_criterio: args => handlersRef.current.compor_propor_criterio(args),
        compor_novo_post: args => handlersRef.current.compor_novo_post(args),
        compor_editar_peca: args => handlersRef.current.compor_editar_peca(args),
        compor_adicionar_campo: args => handlersRef.current.compor_adicionar_campo(args),
        compor_abrir_versao: args => handlersRef.current.compor_abrir_versao(args),
        compor_salvar_versao: args => handlersRef.current.compor_salvar_versao(args),
        compor_renomear_projeto: args => handlersRef.current.compor_renomear_projeto(args),
        compor_propor_imagem: args => handlersRef.current.compor_propor_imagem(args),
      },
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
    let registration:{dispose:()=>void}|undefined;
    tools
      .register(document.modelContext)
      .then((value) => (registration = value));
    return () => {
      tools.dispose();
      registration?.dispose();
      toolsRef.current = null;
    };
  }, [Boolean(s), project.id, userId]);
  async function addFiles(files:File[]) {
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
      await local.flush();
      try { recordReferenceRound(local.get()); } catch {}
      setNotice("Referências adicionadas neste navegador.");
    } catch {
      setNotice(
        "Não foi possível adicionar a imagem. Use PNG ou JPEG dentro dos limites informados.",
      );
    }
  }
  async function storeSelectedReference(source:NonNullable<StudioReference['source']>,file:File) {
    const storage=local.storage.current;
    if (!storage || !active.current || !isAuthenticated()) throw Error("studio_storage_unavailable");
    const scope={userId,projectId:project.id};
    const metadata=await storage.putReference({...scope,id:crypto.randomUUID(),file,source});
    try {
      const current=local.get();
      if(!active.current || !isAuthenticated() || !current || current.projectId!==project.id || current.userId!==userId || !local.change(value=>addReference(value,metadata))) throw Error("studio_unavailable");
    } catch(error) {
      await storage.removeReference(scope,metadata.id).catch(()=>{});
      throw error;
    }
    await local.flush();
    try { recordReferenceRound(local.get()); } catch {}
  }
  async function useExploredReference(reference:ExploredReference,file:File) {
    if (local.get().references.some(item => item.source && 'originUrl' in item.source && item.source.originUrl === reference.originUrl)) return;
    await storeSelectedReference({originUrl:reference.originUrl,board:reference.board,title:reference.title},file);
  }
  async function useGeneratedReference(imageId:string,file:File,ordinal?:number) {
    const alreadySelected=local.get().references.some(item => item.source && 'kind' in item.source && item.source.kind === 'generated' && item.source.projectId === project.id && item.source.imageId === imageId);
    if (alreadySelected) return;
    const signalKey=`compor-exploration-selection-signal:${userId}:${project.id}:${imageId}`;
    let signalId=localStorage.getItem(signalKey);
    if(!signalId) { signalId=crypto.randomUUID();localStorage.setItem(signalKey,signalId); }
    const response=await fetch('/api/studio/explorations/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:signalId,projectId:project.id,imageId,action:'selected',comment:'',supersedes:null})});
    if(!response.ok)throw Error('selection_unconfirmed');
    await storeSelectedReference({kind:'generated',projectId:project.id,imageId,...(ordinal === undefined ? {} : {ordinal})},file);
    localStorage.setItem(selectedExplorationKey(userId,project.id,imageId),'1');
  }
  async function removeFile(id:string) {
    if (local.get().direction.criteria.some(criterion => [criterion.example.referenceId, criterion.counterexample.referenceId].includes(id))) {
      setNotice("Esta imagem faz parte de um exemplo na Direção e continua preservada com esse critério.");
      return;
    }
    local.change((value) => removeReference(value, id));
    try {
      await local.flush();
      try { recordReferenceRound(local.get()); } catch {}
      await local.storage.current?.removeReference(
        { userId, projectId: project.id },
        id,
      );
      if (active.current) setNotice("Referência removida.");
    } catch (error) {
      if (active.current)
        setNotice(
          error instanceof Error && "code" in error && error.code === "studio_reference_in_use"
            ? "A referência saiu do moodboard e continua preservada no histórico local de ajustes."
            : "A referência saiu do moodboard, mas não foi possível confirmar a remoção do arquivo local.",
        );
    }
  }
  if (local.loading || !s)
    return (
      <StudioShell stage="projects" accountLabel={accountLabel} localAccount={localAccount} onSignOut={onSignOut ? signOutSafely : undefined}>
        <p role="status">Abrindo seu espaço de criação…</p>
      </StudioShell>
    );
  const selectedGeneratedIds = s.references.flatMap(reference => reference.source && 'kind' in reference.source && reference.source.kind === 'generated' ? [reference.source.imageId] : []);
  const selectedOrigins = s.references.flatMap(reference => reference.source && 'originUrl' in reference.source ? [reference.source.originUrl] : []);
  const editor = (
    <StudioEditor
      draft={draft}
      brief={s.brief}
      base={base}
      onViewArt={() => {setDrawer(null);setViewingArt(true);}}
      marks={s.marks.filter(
        (m) =>
          m.pieceId === draft?.pieceId && m.baseVersion === draft?.baseVersion,
      )}
      onEdit={(field, value) =>
        local.change((state) => editDraft(state, { field, value }))
      }
      onSetField={field => local.change(state => setCreativeField(state, field))}
      onRemoveField={id => local.change(state => removeCreativeField(state, id))}
      onMark={(mark) =>
        local.change((value) =>
          addMark(value, { ...mark, id: crypto.randomUUID() }),
        )
      }
      onRemoveMark={(id) => local.change((value) => removeMark(value, id))}
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
          const data = approvedVersionSchema.parse(await response.json());
          if (!response.ok) throw Error();
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
                  (data.version.metadata?.approval.status === "approved" ? data.version.metadata.approval.at : undefined) ??
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
      projectRevision={projectDetails.revision}
      developerMode={developerMode}
      getState={local.get}
      change={local.change}
      flush={local.flush}
      tools={toolsRef}
      hasApiKey={hasApiKey}
      getApiKey={getApiKey}
      onUseImage={useBase}
      prepareImageVersion={saveCurrent}
      initialMessage={s.messages.length === 0 ? initialObjective : ""}
      connection={<><details className="studio-inline-key" open={!hasApiKey}><summary>{hasApiKey ? "IA conectada" : "Conectar minha IA"}</summary>{keyInput}<p className="studio-hint">A chave fica na memória desta aba. A conversa e as explorações usam sua API e geram consumo.</p>{hasApiKey && <button type="button" onClick={onRemoveKey}>Remover chave</button>}</details><details className="studio-exploration-status"><summary>Exploração visual</summary><p>{exploration.status}</p><p>As propostas seguem regras de variação a partir do briefing e das suas decisões.</p>{hasApiKey && !exploration.blocked && !exploration.awaitingFeedback && (exploration.paused ? <button type="button" onClick={exploration.resume}>Retomar exploração</button> : <button type="button" onClick={exploration.pause}>Pausar exploração</button>)}</details></>}
      explorationRecovery={exploration.awaitingFeedback ? <div className="studio-message studio-exploration-recovery" data-role="assistant"><p>Mostrei duas rodadas de propostas. Você já está satisfeito com alguma delas? Conte o que achou ou peça mais opções.</p>{exploration.resumeError && <p role="alert">{exploration.resumeError}</p>}{hasApiKey && <button type="button" className="studio-button-secondary" disabled={exploration.resuming} onClick={exploration.resume}>{exploration.resuming?'Retomando…':'Gerar mais propostas'}</button>}</div> : exploration.blocked ? <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{hasApiKey && <button type="button" onClick={exploration.resume}>Consultar e retomar</button>}</div> : exploration.awaitingAnswer && <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{hasApiKey && <button type="button" className="studio-button-secondary" onClick={exploration.resume}>Gerar mais propostas</button>}</div>}
      loadBase={async () => {
        const d = getCurrentDraft(local.get());
        return d
          ? local.storage.current?.getDraftAsset(
              { userId, projectId: project.id },
              { pieceId: d.pieceId, baseVersion: d.baseVersion, kind: "base" },
            )
          : null;
      }}
      loadReference={async (id) =>
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
      accountLabel={accountLabel}
      localAccount={localAccount}
      onSignOut={onSignOut ? signOutSafely : undefined}
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
      onTabChange={() => {setDrawer(null);nextStage("studio");}}
      onNewProject={async () => {try {await local.flush();if(active.current) onCreateNew();} catch {setNotice("Não foi possível preservar o projeto antes de sair.");}}}
      onNavigate={async value => {
        if(value !== "projects") return nextStage(value);
        try {await local.flush();if(active.current) onBack();}
        catch {setNotice("Não foi possível preservar o projeto antes de sair.");}
      }}
      onReview={() => nextStage("review")}
      headerActions={
        <>
          <button className="studio-button-secondary" disabled={!draft} onClick={() => nextStage("review")}>
            Revisar post
          </button>
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
      projectId={project.id}
      projects={projects}
      onOpenProject={async target => {
        try { await local.flush(); if(active.current) onOpenProject(target); }
        catch { setNotice("Não foi possível preservar este projeto antes de trocar."); }
      }}
      onRenameProject={async title => {
        try {
          const result=await handlersRef.current.compor_renomear_projeto({projectId:project.id,requestId:crypto.randomUUID(),revision:local.get().revision,title});
          return result.status === "completed";
        } catch {setNotice("Não foi possível confirmar a alteração do nome.");return false;}
      }}
      basesCount={references.length + versions.length}
      drawer={drawer}
      onDrawerChange={setDrawer}
      viewingArt={viewingArt}
      onCloseArt={() => setViewingArt(false)}
      conversationFocus={showBrief}
      chatMessageCount={s.messages.length}
      bases={<>
          <ExplorationGallery projectId={project.id} completed={exploration.completed} phase={exploration.phase} countdown={exploration.countdown} onUseReference={useGeneratedReference} selectedIds={selectedGeneratedIds} />
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
                  setDrawer(null);
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
            {draft && <StudioAssets
              userId={userId}
              projectId={project.id}
              pieceId={draft.pieceId}
              version={draft.baseVersion}
              canSave={draft.baseVersion > 0 && !draft.dirty}
              preview={base}
              onUseImage={useBase}
            />}
          </div>
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
                  addFiles(Array.from(e.target.files ?? []));
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
      </>}
      marca={<>
          <div>
            <h2>Fatos e direção</h2>
            <dl>
              {Object.entries(s.brief).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {
                      briefLabels[key]
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
              onContinue={() => setDrawer(null)}
            />
          </div>
        <StudioDirection direction={s.direction} references={references} onPropose={criterion => local.change(value => addCreativeCriterion(value, criterion))} onDecide={decision => local.change(value => recordCreativeDecision(value, decision))} />
      </>}
      canvas={
        showBrief ? <div className="studio-brief">
          <ReferenceExploration key={`references:${project.id}`} projectId={project.id} selectedOrigins={selectedOrigins} onUseReference={useExploredReference} />
          <ExplorationGallery key={`explorations:${project.id}`} projectId={project.id} completed={exploration.completed} phase={exploration.phase} countdown={exploration.countdown} onUseReference={useGeneratedReference} selectedIds={selectedGeneratedIds} />
          <BriefSummary state={s} />
          <button className="studio-button-secondary" type="button" onClick={() => setEditorRequested(true)}>Definir textos da arte</button>
        </div> : <CreativeBoard title={draft ? "Post atual" : "Sua criação"} surfaceWidth={compact ? 352 : 772} surfaceHeight={compact ? 1760 : 1100} onCurrentPost={() => setDrawer(null)}>
          <label>
            Imagem-base PNG ou JPEG
            <input type="file" accept="image/png,image/jpeg" onChange={event => {
              const file = event.target.files?.[0];
              if (file && draft) void useBase({blob:file,pieceId:draft.pieceId,version:draft.baseVersion});
              event.target.value = "";
            }} />
          </label>
          {editor}
        </CreativeBoard>
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
                {"title" in dialog.args
                  ? `O projeto passa a se chamar “${dialog.args.title}”.`
                  : "Uma nova versão será salva."}
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
            onClick={() => nextStage("studio")}
          >
            Continuar
          </button>
          <button onClick={onRemoveKey} disabled={!hasApiKey}>
            Remover chave
          </button>
          <button onClick={() => nextStage("studio")}>
            Continuar sem IA por enquanto
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
          <StudioReview title={projectDetails.title} draft={draft} base={base} />
          <button onClick={() => nextStage("studio")}>
            Pedir ajuste no estúdio
          </button>
        </StudioPanel>
      )}
    </StudioShell>
  );
}

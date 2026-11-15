"use client";
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import dynamic from "next/dynamic";
import StudioShell, { StudioPanel, type StudioStage, type StudioDrawer } from "./studio-shell";
const PersonaStep = dynamic(() => import("./persona-step"));
const StudioDirection = dynamic(() => import("./studio-direction"));
import StudioEditor from "./studio-editor";
import StudioReview from "./studio-review";
import VariantCards from "./studio-variant-cards";
import type { ImageProposal } from '@compor/agents-api/image-proposal';
import { useStudioState } from "./use-studio-state";
import {PreparationSteps,ProjectQuestions,ProjectAI,ProjectPosts,GuidedWorkspace,GuidedArtPreview} from './studio-guided';
import {updateWorkflow,conversationMessages,postIds,startPostPreparation,completePostPreparation,prepareReferenceWorkspace} from '../lib/studio-workflow';
import StudioNavigation from './studio-navigation';
import PostSettings from './studio-post-settings';
import ReferencePanel from './studio-reference-panel';
import {addPostCriterion,decidePostCriterion,freezeCreationContext,conversationContext,effectiveReferences,postContext,updatePostContext,selectScopedReference,unselectScopedReference} from '../lib/studio-post-context';
import ContextStrip from "./context-strip";
import ReferenceExploration from "./reference-exploration";
import type { ExploredReference } from "../lib/reference-exploration-contract";
import { recordReferenceSelection } from "../lib/reference-selection";
import type { ApprovedReference } from "../lib/web-contracts";
import ExplorationGallery from "./exploration-gallery";
import ReferenceSelectionTray from "./reference-selection-tray";
import { useExplorationLoop } from "./use-exploration-loop";
import type { CredentialSource } from "./use-ai-credentials";
import { selectedExplorationKey } from "../lib/exploration-batch";
import { recordVisualFeedback,recordGeneratedComment } from "../lib/studio-visual-feedback";
import { recordReferenceRound } from "../lib/studio-reference-round";
import { studioProjectIdea } from "../lib/studio-project-idea";
import {
  updateBrief,
  updatePersona,
  updateOfferFacts,
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
  approveDraft,
  recordSavedVersion,
  recordActionReceipt,
  resolveProjectTitle,
  STUDIO_LIMITS,
} from "../lib/studio-state.ts";
import { createStudioTools, type StudioModelContext } from "../lib/studio-tools.ts";
import StudioChat from "./studio-chat";
import StudioDialog from "./studio-dialog";
const StudioAssets = dynamic(() => import("./studio-assets"), {loading: () => <p role="status">Consultando imagens desta versão…</p>});

import * as z from 'zod';
import { projectsSchema, projectResponseSchema, versionsSchema, savedVersionSchema, versionSchema, type Project, type PieceVersion, type ImageSelection } from './studio-ui-types';
import type { StudioState, StudioReference, ActionResult, DraftContext } from '../lib/studio-domain';
import type { ActionInputByName, StudioActionName, StudioAction } from '@compor/agents-api/studio-chat-tools';
declare global { interface Document { readonly modelContext?: StudioModelContext } }
type StudioHandlers = {[Name in StudioActionName]:(input:ActionInputByName[Name], context?:{signal?:AbortSignal;conversationId?:string})=>Promise<ActionResult>};
type StudioAppProps={userId:string;hasApiKey:boolean;canUseAI?:boolean;credentialSource?:CredentialSource;credentialEpoch?:number;defaultAvailable?:boolean;onUseAI?:()=>void;onPauseAI?:()=>void;getApiKey:()=>string;keyInput:ReactNode;onRemoveKey:()=>void;initialObjective:string;recoveryBanner?:ReactNode;isAuthenticated:()=>boolean;developerMode?:boolean;accountLabel?:string;localAccount?:boolean;onSignOut?:()=>void|Promise<void>};
type ProjectStudioProps=Omit<StudioAppProps,'recoveryBanner'>&{project:Project;projects:Project[];onOpenProject:(project:Project)=>void;onProjectRenamed:(project:Project)=>void;onCreateNew:()=>void;onBack:()=>void;initialPrepare:boolean};
type Confirmation={name:StudioActionName;args:StudioAction};
const renamedProjectSchema=projectResponseSchema.extend({status:z.literal('renamed')});
const approvedVersionSchema=z.object({status:z.literal('approved'),version:versionSchema});

export default function StudioApp({
  userId,
  hasApiKey,
  canUseAI = hasApiKey,
  credentialSource = "byok",
  credentialEpoch = 0,
  defaultAvailable = false,
  onUseAI,
  onPauseAI,
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
    [projectName, setProjectName] = useState(""),
    [createdProjectId, setCreatedProjectId] = useState<string|null>(null),
    [state, setState] = useState("loading"),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const [deleteTarget,setDeleteTarget]=useState<Project|null>(null),[deleteError,setDeleteError]=useState('');
  const deleteLock=useRef(false);
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
      if (!uncertain) setNotice("");
      setState("ready");
    } catch {
      if (n === seq.current) {
        setState("error");
        setNotice("Não foi possível carregar seus projetos.");
      }
    }
  }
  useEffect(() => {
    setDeleteTarget(null);setDeleteError('');deleteLock.current=false;
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
    setCreatedProjectId(null);
    setSelected(null);
    refresh();
  }
  function projectRenamed(project:Project) {
    setProjects(items => items.map(item => item.id === project.id ? {...item,...project} : item));
    setSelected(current => current?.id === project.id ? {...current,...project} : current);
  }
  async function deleteProject(){
    const target=deleteTarget;
    if(!target||!target.revision||deleteLock.current||deleteError||!isAuthenticated())return;
    deleteLock.current=true;const n=++seq.current;setState('deleting');
    try{
      const response=await fetch('/api/projects',{method:'DELETE',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({projectId:target.id,expectedRevision:target.revision})});
      if(n!==seq.current||!isAuthenticated())return;
      const result=z.strictObject({status:z.literal('deleted'),projectId:z.string()}).safeParse(await response.json());
      if(!response.ok||!result.success||result.data.projectId!==target.id)throw Error('unconfirmed');
      setProjects(items=>items.filter(item=>item.id!==target.id));setDeleteTarget(null);setNotice('Projeto excluído da lista.');
    }catch{
      if(n===seq.current)setDeleteError('Não foi possível confirmar a exclusão. Atualize a lista antes de tentar novamente.');
    }finally{if(n===seq.current){deleteLock.current=false;setState('ready');}}
  }
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "ready" || uncertain || !projectName.trim()) return;
    setState("creating");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: projectName.trim() }),
      });
      if (!response.ok) throw Error();
      const data = projectResponseSchema.parse(await response.json());
      setProjects((items) => [...items, data.project]);
      setSelected(data.project);
      setCreatedProjectId(data.project.id);
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
        onOpenProject={project => {setCreatedProjectId(null);setSelected(project);}}
        onProjectRenamed={projectRenamed}
        onCreateNew={requestCreate}
        onBack={() => {setSelected(null);refresh();}}
        hasApiKey={hasApiKey}
        canUseAI={canUseAI}
        credentialSource={credentialSource}
        credentialEpoch={credentialEpoch}
        defaultAvailable={defaultAvailable}
        onUseAI={onUseAI}
        onPauseAI={onPauseAI}
        getApiKey={getApiKey}
        keyInput={keyInput}
        onRemoveKey={onRemoveKey}
        initialObjective=""
        initialPrepare={createdProjectId===selected.id}
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
      {deleteTarget&&<StudioDialog title="Excluir projeto?" onClose={()=>{if(!deleteLock.current)setDeleteTarget(null);}}><p>Excluir “{deleteTarget.title}” da sua lista de projetos?</p><p>Os posts, imagens e históricos serão preservados internamente. Esta ação não apaga os arquivos definitivamente.</p>{deleteError&&<p role="alert">{deleteError}</p>}<button type="button" className="studio-button-secondary" disabled={state==='deleting'} onClick={()=>setDeleteTarget(null)}>Cancelar</button>{deleteError?<button type="button" className="studio-button" onClick={()=>{setDeleteTarget(null);setDeleteError('');void refresh();}}>Atualizar projetos</button>:<button type="button" className="studio-button" disabled={state==='deleting'} onClick={()=>void deleteProject()}>{state==='deleting'?'Excluindo…':'Excluir projeto'}</button>}</StudioDialog>}
      <section className="studio-starter" aria-labelledby="starter-title">
        <h2 id="starter-title">Comece um projeto</h2>
        <p>Um projeto reúne o contexto, as referências e os posts de uma mesma divulgação. Primeiro vamos prepará-lo; depois você cria cada post.</p>
        <form onSubmit={create}>
          <label htmlFor="studio-project-name">Nome do projeto</label><p className="studio-hint" id="project-idea-help">Escolha um nome para organizar seus posts. Na próxima etapa, você descreve o contexto do projeto.</p>
          <input type="text" id="studio-project-name" aria-describedby="project-idea-help" maxLength={200} value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Ex.: Mentoria Veloz — Campanha 1" />
          <button className="studio-button" disabled={state !== "ready" || uncertain || !projectName.trim()}>{state === "creating" ? "Criando projeto…" : "Criar projeto e continuar"}</button>
        </form>
        {initialObjective&&<details><summary>Rascunho anterior</summary><p>{initialObjective}</p></details>}
        {notice && <p role="alert">{notice}</p>}
        {(state === "error" || uncertain) && <button type="button" onClick={refresh}>Atualizar projetos</button>}
        {uncertain && <button type="button" onClick={() => setUncertain(false)}>Entendi, iniciar outra criação</button>}
      </section>
      <section className="studio-recent-projects" aria-label="Conversas e projetos anteriores">
        <h2>Seus projetos</h2>
        {state === "loading" && <p role="status">Carregando seus projetos…</p>}{state === "ready" && projects.length===0 && <p>Seus projetos aparecerão aqui. Comece com uma ideia acima.</p>}
        <div className="studio-project-grid">
          {projects.map(project => <div className="studio-project-entry" key={project.id}><button className="studio-project-card" title={project.title} disabled={state==='deleting'} onClick={() => { setCreatedProjectId(null); setSelected(project); }}><strong id={`project-title-${project.id}`} className="studio-truncate">{project.title}</strong><span>Abrir projeto</span></button><button type="button" className="studio-project-delete" title="Excluir projeto" aria-label="Excluir projeto" aria-describedby={`project-title-${project.id}`} disabled={state!=='ready'||!project.revision} onClick={()=>{setDeleteError('');setDeleteTarget(project);}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button></div>)}
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
  hasApiKey: credentialActive,
  canUseAI = credentialActive,
  credentialSource = "byok",
  credentialEpoch = 0,
  defaultAvailable = false,
  onUseAI,
  onPauseAI,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  initialPrepare,
  isAuthenticated,
  developerMode = false,
  accountLabel = "",
  localAccount = false,
  onSignOut,
}: ProjectStudioProps) {
  const session = useStudioState({ userId, projectId: project.id, prepare:initialPrepare,projectIdea:initialObjective }), s=session.state;
  const local = {...session,get:():StudioState=>{const value=session.get();if(!value)throw Error("O estúdio ainda está carregando.");return value;}};
  const [projectIntent, setProjectIntent] = useState(false);
  const [settingsTab,setSettings]=useState<'context'|'ai'|'references'|'direction'|'materials'|'history'|null>(null);
  const [referenceScope,setReferenceScope]=useState('references');
  const [postSettingsOpen,setPostSettingsOpen]=useState(false);
  const [explorationRequested,setExplorationRequested]=useState(false);
  const [visitedPosts,setVisitedPosts]=useState<string[]>([]);
  const projectAIChosen=Boolean(s&&s.workflow.aiPreference!=='none'&&s.workflow.aiPreference===credentialSource);
  const canUseProjectAI=canUseAI&&projectAIChosen;
  const hasApiKey = credentialActive && projectAIChosen && (credentialSource !== "default" || projectIntent);
  const credentialSeen = useRef(credentialEpoch);
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
  stateRef.current = s;
  versionRef.current = versions;
  const draft = s ? getCurrentDraft(s) : null;
  const currentSettings=settingsTab??(drawer==='marca'?'direction':drawer==='bases'?'materials':null);
  const referencesOpen=s?.workflow.phase==='references'||currentSettings==='references';
  useEffect(()=>{if(draft)setVisitedPosts(ids=>ids.includes(draft.pieceId)?ids:[...ids,draft.pieceId]);},[draft?.pieceId]);
  useEffect(()=>{if(!referencesOpen){setExplorationRequested(false);}},[referencesOpen]);
  const idea = studioProjectIdea(s,initialObjective);
  const exploration = useExplorationLoop({ userId, projectId: project.id, state: s?conversationContext(s,referenceScope):null, getState: ()=>{const value=session.get();return value?conversationContext(value,referenceScope):null;}, conversationId:referenceScope, hasApiKey, canUseAI:canUseProjectAI, getApiKey, credentialSource, credentialEpoch, isAuthenticated, idea:referenceScope==='references'?idea:s?postContext(s,referenceScope).message||idea:idea, enabled: stageRestored && stage === "studio" && referencesOpen && explorationRequested });
  useEffect(() => {
    if (credentialSeen.current === credentialEpoch) return;
    credentialSeen.current = credentialEpoch;
    if (!credentialActive) { setProjectIntent(false); exploration.pause(); }
  }, [credentialEpoch, credentialActive]);
  function activateAI() {
    setProjectIntent(true); onUseAI?.();

  }
  function continueWithoutAI() {
    setProjectIntent(false); onPauseAI?.(); exploration.pause(); local.change(value=>updateWorkflow(value,{aiPreference:'none'})); nextStage("studio");
  }
  const sourceLabel = credentialSource === "default" ? "IA do Compor" : "Minha chave OpenAI";
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
    if (s && referencesOpen && s.projectReferenceIds.length && !s.selection) local.change(value => prepareReferenceWorkspace(value,crypto.randomUUID()));
  }, [Boolean(s),referencesOpen,s?.projectReferenceIds.length]);
  useEffect(() => {
    if (!s) return;
    try {
      const saved = sessionStorage.getItem(
        `compor-studio-stage:${userId}:${project.id}`,
      );
      if (s.workflow.phase==="ready"&&(saved === "studio" || saved === "review" || saved === "export")) setStage(saved);
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
  async function useBase({ blob, pieceId, version,creationContext }:ImageSelection) {
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
      if(local.get().drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===version)){local.change(value=>freezeCreationContext(value,pieceId,version,creationContext??{postContext:postContext(value,pieceId),references:[]}));await local.flush();}
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
  function closeSettings(){setSettings(null);setDrawer(null);}
  function newPost(pieceId:string = crypto.randomUUID(),fromAgent=false) {
    closeSettings();
    local.change(value=>fromAgent?updateWorkflow(value.drafts.some(d=>d.pieceId===pieceId&&d.baseVersion===0)?selectDraft(value,{pieceId,baseVersion:0}):createPost(value,{pieceId}),{view:'studio'}):startPostPreparation(value,pieceId));
    setBase(null);setViewingArt(false);setStage('studio');
  }
  function openPost(pieceId:string) {
    const value=local.get(),remembered=value.workflow.selections[pieceId];
    const chosen=value.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===remembered)??value.drafts.filter(item=>item.pieceId===pieceId).at(-1);
    closeSettings();setStage('studio');
    if(chosen)local.change(state=>updateWorkflow(selectDraft(state,chosen),{view:state.posts[pieceId]?.prepared===false?'prepare-post':'studio'}));
    else {const version=versionRef.current.filter(item=>item.piece_id===pieceId).toSorted((a,b)=>b.version-a.version)[0];if(version)openVersion(version);}
  }
  function openVersion(version:PieceVersion) {
    setSettings(null);
    const latest = versionRef.current
      .filter((v) => v.piece_id === version.piece_id)
      .reduce((n, v) => Math.max(n, v.version), 0);
    local.change((value) =>
      updateWorkflow(selectVersion(value, {
        pieceId: version.piece_id,
        version: version.version,
        latestVersion: latest,
        content: version.content,
        approval:
          version.metadata?.approval?.status === "approved"
            ? version.metadata.approval
            : { status: "unapproved" },
      }), {view:'studio'}),
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
  async function saveCurrent(args?:DraftContext&Partial<Pick<ImageProposal,'operation'|'changedDimension'>>):Promise<ActionResult> {
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
          ...(args?.operation?{operation:args.operation}:{}),
          ...(args?.changedDimension?{changedDimension:args.changedDimension}:{}),
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
          samePieceContent(latest.content, d.content) && (latest.metadata?.operation??null)===(args?.operation??null) && (latest.metadata?.changedDimension??null)===(args?.changedDimension??null)) {
          if (!active.current) return { status: "unknown" };
          const storage=local.storage.current;
          if (!storage) throw Error("storage_unavailable");
          if(!args?.changedDimension)await storage.copyDraftAsset({userId,projectId:project.id},
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
      if(!args?.changedDimension)await storage.copyDraftAsset({userId,projectId:project.id},
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
    compor_editar_briefing: async (args,context) => {
      const target=context?.conversationId??local.get().selection?.pieceId;
      local.change(value=>target&&target!=='references'&&['offer','action'].includes(args.field)?updatePostContext(value,target,{[args.field==='offer'?'message':'action']:args.value}):updateBrief(value,{[args.field]:args.value}));
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
    compor_propor_criterio: async (args,context) => {
      const target=context?.conversationId;
      for (const id of [args.exampleReferenceId, args.counterexampleReferenceId].filter(Boolean)) {
        if (!effectiveReferences(local.get(),target).some(reference => reference.id === id)) throw Error("reference_unavailable");
      }
      local.change(value => (target&&target!=='references'?(state:StudioState,criterion:Parameters<typeof addCreativeCriterion>[1])=>addPostCriterion(state,target,criterion):addCreativeCriterion)(value, {
        id: args.requestId, viewpoint: args.viewpoint, dimension: args.dimension, statement: args.statement,
        example: { description: args.example, referenceId: args.exampleReferenceId || null },
        counterexample: { description: args.counterexample, referenceId: args.counterexampleReferenceId || null },
        provenance: args.provenance, source: args.source || "", tension: args.tension || "",
      }));
      if(target&&target!=='references')setPostSettingsOpen(true);else setDrawer('marca');
      return { status: 'completed', local: true };
    },
    compor_novo_post: async (args) => {
      newPost(args.requestId,true);
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
        compor_editar_briefing: (args,context) => handlersRef.current.compor_editar_briefing(args,context),
        compor_editar_persona: args => handlersRef.current.compor_editar_persona(args),
        compor_registrar_afirmacao_persona: args => handlersRef.current.compor_registrar_afirmacao_persona(args),
        compor_registrar_feedback_visual: (args, context) => handlersRef.current.compor_registrar_feedback_visual(args, context),
        compor_comentar_imagem_gerada: (args, context) => handlersRef.current.compor_comentar_imagem_gerada(args, context),
        compor_propor_criterio: (args,context) => handlersRef.current.compor_propor_criterio(args,context),
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
    const target=referenceScope;
    if (!local.storage.current) return;
    try {
      for (const file of files) await storeSelectedReference(undefined,file,target);
      setNotice("Referências adicionadas neste navegador.");
    } catch {
      setNotice(
        "Imagem não adicionada. Use PNG/JPEG até 8 MB. O limite é de 20 por projeto.",
      );
    }
  }
  async function storeSelectedReference(source:StudioReference['source'],file:File,target=referenceScope) {
    const storage=local.storage.current;
    if (!storage || !active.current || !isAuthenticated()) throw Error("studio_storage_unavailable");
    const scope={userId,projectId:project.id};
    if(local.get().references.length>=STUDIO_LIMITS.references)throw Error('studio_state_limit');
    const metadata=await storage.putReference({...scope,id:crypto.randomUUID(),file,source});
    try {
      const current=local.get();
      if(!active.current || !isAuthenticated() || !current || current.projectId!==project.id || current.userId!==userId || !local.change(value=>selectScopedReference(value,metadata,target))) throw Error("studio_unavailable");
    } catch(error) {
      await storage.removeReference(scope,metadata.id).catch(()=>{});
      throw error;
    }
    await local.flush();
    try { recordReferenceRound(conversationContext(local.get(),referenceScope)); } catch {}
  }
  async function useExploredReference(reference:ExploredReference,file:File) {
    if(!isAuthenticated())throw Error('studio_unavailable');
    const existing=local.get().references.find(item=>item.source&&'originUrl' in item.source&&item.source.originUrl===reference.originUrl);
    if(existing){await selectExistingReference(existing,referenceScope,reference);return;}
    const target=referenceScope;
    await recordReferenceSelection({userId,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),reference,commit:()=>storeSelectedReference({originUrl:reference.originUrl,board:reference.board,title:reference.title},file,target)});
  }
  async function useGeneratedReference(imageId:string,file:File,ordinal?:number) {
    const existing=local.get().references.find(item=>item.source&&'kind' in item.source&&item.source.imageId===imageId);
    if(existing){await selectExistingReference(existing,referenceScope);return;}
    const target=referenceScope;
    const signalKey=`compor-exploration-selection-signal:${userId}:${project.id}${target!=='references'?`:${target}`:''}:${imageId}`;
    let signalId=localStorage.getItem(signalKey);
    if(!signalId) { signalId=crypto.randomUUID();localStorage.setItem(signalKey,signalId); }
    const response=await fetch('/api/studio/explorations/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:signalId,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),imageId,action:'selected',comment:'',supersedes:null})});
    if(!response.ok)throw Error('selection_unconfirmed');
    await storeSelectedReference({kind:'generated',projectId:project.id,imageId,...(ordinal === undefined ? {} : {ordinal})},file,target);
    localStorage.setItem(selectedExplorationKey(userId,project.id,imageId),'1');
  }
  async function selectExistingReference(reference:StudioReference,target:string,pin?:ExploredReference) {
    const source=reference.source;
    const commit=async()=>{local.change(value=>selectScopedReference(value,reference,target));await local.flush();recordReferenceRound(conversationContext(local.get(),target));};
    if(source&&'originUrl' in source&&pin){await recordReferenceSelection({userId,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),reference:pin,commit});return;}
    if(source){
      const key=`compor-reference-share:${userId}:${project.id}:${target}:${reference.id}`;
      let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}
      const body={id,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),action:'selected',comment:'',supersedes:null,...('kind' in source?{imageId:source.imageId}:{originUrl:source.originUrl,board:source.board})};
      const response=await fetch('kind' in source?'/api/studio/explorations/signals':'/api/studio/references/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw Error('selection_unconfirmed');
    }
    await commit();
  }
  async function removeFile(id:string) {
    local.change((value) => unselectScopedReference(value,id,referenceScope));
    try {
      await local.flush();
      try { recordReferenceRound(conversationContext(local.get(),referenceScope)); } catch {}
      if(!local.get().references.some(reference=>reference.id===id))await local.storage.current?.removeReference(
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
  async function removeSelected(match:(reference:StudioReference)=>boolean) {
    const selected=local.get()?.references.find(match);
    if(selected)await removeFile(selected.id);
  }
  if (local.loading || !s)
    return (
      <StudioShell stage="projects" accountLabel={accountLabel} localAccount={localAccount} onSignOut={onSignOut ? signOutSafely : undefined}>
        <p role="status">Abrindo seu espaço de criação…</p>
      </StudioShell>
    );
  const scopedReferences=effectiveReferences(s,referenceScope);
  const selectedGeneratedIds = scopedReferences.flatMap(reference => reference.source && 'kind' in reference.source && reference.source.kind === 'generated' ? [reference.source.imageId] : []);
  const selectedOrigins = scopedReferences.flatMap(reference => reference.source && 'originUrl' in reference.source ? [reference.source.originUrl] : []);
  const editor = (
    <StudioEditor guided
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
              references:(selected.creationContext?.references??[]).flatMap((reference):ApprovedReference[]=>{
                const source=reference.source;
                if(!source)return [];
                return 'kind' in source ? [{kind:'generated',projectId:source.projectId,imageId:source.imageId}] : [{kind:'pinterest',originUrl:source.originUrl,board:source.board}];
              }),
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
  const explorationRecovery=(exploration.awaitingFeedback ? <div className="studio-message studio-exploration-recovery" data-role="assistant"><p>Mostrei duas rodadas de propostas. Você já está satisfeito com alguma delas? Conte o que achou ou peça mais opções.</p>{exploration.resumeError && <p role="alert">{exploration.resumeError}</p>}{hasApiKey && <button type="button" className="studio-button-secondary" disabled={exploration.resuming} onClick={exploration.resume}>{exploration.resuming?'Retomando…':'Gerar mais propostas'}</button>}</div> : exploration.blocked ? <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{hasApiKey && <button type="button" onClick={exploration.resume}>Consultar e retomar</button>}</div> : exploration.awaitingAnswer && <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{hasApiKey && <button type="button" className="studio-button-secondary" onClick={exploration.resume}>Gerar mais propostas</button>}</div>);
  const renderChat = (conversationId:string|undefined,intro=false,readOnly=false) => (
    <StudioChat key={conversationId??"legacy"} conversationId={conversationId} intro={intro} readOnly={readOnly} allowReferenceAnalysis={referencesOpen&&conversationId===referenceScope}
      state={s}
      projectRevision={projectDetails.revision}
      developerMode={developerMode}
      getState={local.get}
      change={local.change}
      flush={local.flush}
      tools={toolsRef}
      hasApiKey={hasApiKey}
      canUseAI={canUseProjectAI}
      credentialSource={credentialSource}
      credentialEpoch={credentialEpoch}
      onUseAI={activateAI}
      getApiKey={getApiKey}
      onUseImage={useBase}
      prepareImageVersion={saveCurrent}
      initialMessage=""
      connection={<p className="studio-hint">{canUseProjectAI?sourceLabel:'Escolha uma IA nas configurações para conversar, ou continue no editor sem IA.'}</p>}

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
  const basesPanel=(<>
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
            {s.drafts.filter(item=>item.pieceId!==s.workflow.referencePieceId).map((item) => (
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
                  setSettings(null);
                  local.change(value=>updateWorkflow(value,{view:'studio'}));
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
          <button type="button" className="studio-button-secondary" onClick={()=>{setReferenceScope('references');setDrawer(null);setSettings('references');}}>Gerenciar referências do projeto</button>
      </>);
  const directionPanel=(<>
          <div>
            <PersonaStep
              showAudience={false}
              value={s.persona}
              onChange={(value) =>
                local.change((state) => updatePersona(state, value))
              }
              onContinue={closeSettings}
            />
          </div>
        <StudioDirection direction={s.direction} references={references} onPropose={criterion => local.change(value => addCreativeCriterion(value, criterion))} onDecide={decision => local.change(value => recordCreativeDecision(value, decision))} />
      </>);
  const artwork=(<div className="studio-post-workspace">
          <div className="studio-post-workspace-header"><button type="button" className="studio-button-secondary" onClick={()=>{setReferenceScope(draft?.pieceId??'references');setDrawer(null);setSettings('references');}}>Escolher mais referências</button></div>

          <div className="guided-artwork-editor">
          <details><summary>Usar uma imagem-base própria</summary><label>
            Imagem-base PNG ou JPEG
            <input type="file" accept="image/png,image/jpeg" onChange={event => {
              const file = event.target.files?.[0];
              if (file && draft) void useBase({blob:file,pieceId:draft.pieceId,version:draft.baseVersion});
              event.target.value = "";
            }} />
          </label></details>
          {editor}
          <details className="guided-versions"><summary>Versões e variantes deste post</summary>{draft && <VariantCards userId={userId} projectId={project.id} pieceId={draft.pieceId} versions={versions} selectedVersion={draft.baseVersion} assetRevision={base} onOpenVersion={openVersion} loadLocal={version=>local.storage.current?.getDraftAsset({userId,projectId:project.id},{pieceId:version.piece_id,baseVersion:version.version,kind:'base'})??Promise.resolve(null)} onUseImage={useBase} />}</details>
        </div>
        </div>);
  const preparing=s.workflow.phase!=='ready';
  const postTitle=draft?.content.headline||`Post ${postIds(s).indexOf(draft?.pieceId??'')+1}`;
  const finishPreparation=()=>local.change(value=>updateWorkflow(value,{phase:'ready',view:'posts'}));
  const nextReferences=()=>local.change(value=>updateWorkflow(value,{phase:'references'}));
  const aiPanel=<ProjectAI continueLabel={preparing?'Continuar para referências':'Voltar ao post'} preference={s.workflow.aiPreference} source={credentialSource} available={defaultAvailable} canUseAI={canUseAI} keyInput={keyInput} onDefault={()=>{if(credentialSource==='byok')onRemoveKey();local.change(value=>updateWorkflow(value,{aiPreference:'default'}));activateAI();}} onOwn={()=>local.change(value=>updateWorkflow(value,{aiPreference:'byok'}))} onRemove={()=>{onRemoveKey();setProjectIntent(false);exploration.pause();}} onContinue={preparing?nextReferences:closeSettings} onSkip={()=>{continueWithoutAI();if(preparing)nextReferences();else closeSettings();}} onBack={()=>preparing?local.change(value=>updateWorkflow(value,{phase:'context'})):closeSettings()}/>;
  const referencePanel=<ReferencePanel projectWide={referenceScope==='references'} onScope={!preparing&&draft?wide=>{exploration.pause();setExplorationRequested(false);setReferenceScope(wide?'references':draft.pieceId);}:undefined}
    shared={referenceScope!=='references'&&s.projectReferenceIds.length>0&&<fieldset className="guided-shared-references"><legend>Referências do projeto usadas neste post</legend>{s.references.filter(reference=>s.projectReferenceIds.includes(reference.id)).map(reference=><label key={reference.id}><input type="checkbox" checked={scopedReferences.some(item=>item.id===reference.id)} onChange={event=>{local.change(value=>event.target.checked?selectScopedReference(value,reference,referenceScope):unselectScopedReference(value,reference.id,referenceScope));void local.flush().then(()=>recordReferenceRound(conversationContext(local.get(),referenceScope))).catch(()=>setNotice('Não foi possível salvar a seleção.'));}}/>{reference.name}</label>)}</fieldset>}
    selection={<ReferenceSelectionTray items={scopedReferences.map(reference=>({...reference,url:references.find(item=>item.id===reference.id)?.url,scopeLabel:s.projectReferenceIds.includes(reference.id)?'Do projeto':'Deste post',removeLabel:referenceScope==='references'?'Remover do projeto':s.projectReferenceIds.includes(reference.id)?'Deixar de usar neste post':'Remover deste post',...(referenceScope!=='references'&&!s.projectReferenceIds.includes(reference.id)?{onShare:()=>{void selectExistingReference(reference,'references').catch(()=>setNotice('Não foi possível confirmar o compartilhamento.'));}}:{})}))} limit={STUDIO_LIMITS.references} onRemove={removeFile}/>}
    search={<ReferenceExploration key={referenceScope} userId={userId} projectId={project.id} idea={referenceScope==='references'?idea:postContext(s,referenceScope).message||idea} selectedOrigins={selectedOrigins} onUseReference={useExploredReference} onRemoveReference={originUrl=>removeSelected(reference=>Boolean(reference.source&&'originUrl' in reference.source&&reference.source.originUrl===originUrl))}/>}
    upload={<label className="guided-reference-upload">Enviar suas imagens<p>PNG ou JPEG, até 8 MB cada. Limite de 20 imagens por projeto.</p><input type="file" accept="image/png,image/jpeg" multiple onChange={event=>{void addFiles(Array.from(event.target.files??[]));event.target.value='';}}/></label>}
    proposals={<section><h2>Propostas visuais do Compor</h2><p>Explore estilos antes de criar o post.</p><p role="status">{explorationRequested?exploration.status:'A exploração ainda não foi iniciada.'}</p>{!canUseProjectAI&&<p>Escolha sua IA para pedir propostas. Você pode continuar sem gerar imagens.</p>}<div className="guided-actions"><button type="button" className="studio-button" disabled={!canUseProjectAI||explorationRequested&&!exploration.paused&&!exploration.blocked&&!exploration.awaitingAnswer&&!exploration.awaitingFeedback} onClick={()=>{activateAI();setExplorationRequested(true);void exploration.resume();}}>Pedir propostas visuais</button>{explorationRequested&&!exploration.paused&&<button type="button" className="studio-button-secondary" onClick={exploration.pause}>Pausar exploração</button>}</div><ExplorationGallery projectId={project.id} completed={exploration.completed} phase={exploration.phase} countdown={exploration.countdown} onUseReference={useGeneratedReference} onRemoveReference={imageId=>removeSelected(reference=>Boolean(reference.source&&'kind' in reference.source&&reference.source.kind==='generated'&&reference.source.imageId===imageId))} selectedIds={selectedGeneratedIds}/></section>}
    conversation={<>{explorationRecovery}{scopedReferences.length>0&&canUseProjectAI&&<details open><summary>Conversa sobre estas referências</summary><div className="guided-reference-chat">{referenceScope==='references'?renderChat(referenceScope):<p>O Compor comenta esta seleção na conversa deste post. Ao continuar, você volta para ela.</p>}</div></details>}</>}
    onBack={preparing?()=>local.change(value=>updateWorkflow(value,{phase:'ai'})):undefined} onContinue={preparing?finishPreparation:closeSettings} continueLabel={preparing?'Ir para os posts do projeto':'Voltar ao post'}/>;
  const intro=s.workflow.view==='compose'&&!draft?.baseVersion&&!base&&!conversationMessages(s,draft?.pieceId).some(message=>message.role==='user');
  const chatIds=[...new Set([...visitedPosts,...(draft?[draft.pieceId]:[])])];
  const chats=chatIds.map(id=><div className="guided-conversation" key={id} hidden={id!==draft?.pieceId}>{renderChat(id,id===draft?.pieceId&&intro)}</div>);
  const pendingTurn=s.adjustments.find(item=>!['completed','failed'].includes(item.status));
  const showPosts=()=>{closeSettings();setPostSettingsOpen(false);nextStage('studio');local.change(value=>updateWorkflow(value,{view:'posts'}));};
  const preparingPost=s.workflow.view==='prepare-post'&&draft;
  const postPreparation=preparingPost&&<section className="studio-panel guided-question" aria-labelledby="post-preparation-title"><p className="studio-eyebrow">PREPARAR POST</p><h2 id="post-preparation-title">Vamos preparar este post</h2><p>O projeto já está configurado. Agora defina o propósito desta peça antes de seguir para a conversa ou o editor.</p><PostSettings preparing value={postContext(s,draft.pieceId)} legacyAction={s.brief.action} onChange={patch=>local.change(value=>updatePostContext(value,draft.pieceId,patch))}/><p className="studio-hint">A chamada para ação é opcional. Você pode complementar essas informações depois.</p><div className="guided-actions"><button type="button" className="studio-button-secondary" onClick={showPosts}>Voltar aos posts</button><button type="button" className="studio-button" onClick={()=>local.change(completePostPreparation)}>Continuar para criação</button></div></section>;
  const canvas=<>{pendingTurn&&!preparing&&<p className="studio-hint" role="status">Há um pedido ainda não confirmado. <button type="button" onClick={()=>pendingTurn.context.conversationId==='references'?setSettings('references'):openPost(pendingTurn.context.pieceId)}>Abrir a conversa desse pedido</button></p>}{preparing?<><PreparationSteps phase={s.workflow.phase}/>{s.workflow.phase==='context'?<ProjectQuestions state={s} onChange={patch=>local.change(value=>updateWorkflow(updateBrief(value,patch),{contextStarted:true}))} onStep={contextStep=>local.change(value=>updateWorkflow(value,{contextStep}))} onContinue={()=>local.change(value=>updateWorkflow(value,{phase:'ai'}))}/>:s.workflow.phase==='ai'?aiPanel:referencePanel}</>:s.workflow.view==='posts'?<ProjectPosts state={s} versions={versions} onOpen={openPost} onNew={()=>newPost()}/>:preparingPost?postPreparation:<GuidedWorkspace chat={chats} artwork={artwork} intro={intro} onManual={()=>local.change(value=>updateWorkflow(value,{view:'studio'}))}/>}</>;

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
      guided
      pieceSubtitle={!preparing&&s.workflow.view!=='posts'?postTitle:undefined}
      sidebar={!preparing?<StudioNavigation actions={[
        {id:'posts',label:'Posts do projeto',onClick:showPosts,current:s.workflow.view==='posts'&&stage==='studio'},
        {id:'project',label:'Configurações do projeto',onClick:()=>setSettings('context')},
        ...(draft&&s.workflow.view!=='posts'&&!preparingPost?[
          {id:'post' as const,label:'Configurações deste post',onClick:()=>setPostSettingsOpen(true)},
          {id:'review' as const,label:'Revisar post',onClick:()=>nextStage('review'),disabled:Boolean(preparingPost),current:stage==='review'},
          {id:'save' as const,label:saving?'Salvando…':'Salvar versão',onClick:()=>{void saveCurrent();},disabled:saving||Boolean(preparingPost)},
        ]:[]),
      ]}/>:undefined}
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
      canvas={canvas}
      overlays={
        <>
          {currentSettings&&<StudioDialog title={currentSettings==='references'?'Escolher referências':'Configurações do projeto'} onClose={closeSettings}>{currentSettings!=='references'&&<nav className="guided-settings-tabs" aria-label="Configurações">{([['context','Contexto'],['ai','IA'],['references','Referências'],['direction','Marca e direção'],['materials','Materiais e versões'],['history','Histórico anterior']] as const).map(([tab,label])=><button type="button" className="studio-button-secondary" key={tab} aria-pressed={currentSettings===tab} onClick={()=>{setDrawer(null);if(tab==='references')setReferenceScope('references');setSettings(tab);}}>{label}</button>)}</nav>}{currentSettings==='context'?<><p>Ideia inicial: {idea||'Ainda não informada'}</p><ContextStrip state={s} onBrief={patch=>local.change(value=>updateBrief(value,patch))} onFacts={facts=>local.change(value=>updateOfferFacts(value,facts))}/></>:currentSettings==='ai'?aiPanel:currentSettings==='references'?referencePanel:currentSettings==='direction'?directionPanel:currentSettings==='materials'?basesPanel:<><p>Histórico preservado da versão anterior. Novos pedidos são feitos na conversa de cada post.</p><div className="guided-reference-chat">{renderChat(undefined,false,true)}</div></>}{currentSettings!=='references'&&<button type="button" className="studio-button" onClick={closeSettings}>Voltar ao post</button>}</StudioDialog>}
          {postSettingsOpen&&draft&&<StudioDialog title="Configurações deste post" onClose={()=>setPostSettingsOpen(false)}><PostSettings value={postContext(s,draft.pieceId)} legacyAction={s.brief.action} onChange={patch=>local.change(value=>updatePostContext(value,draft.pieceId,patch))}/>{s.posts[draft.pieceId]?.direction.criteria.length>0&&<StudioDirection direction={s.posts[draft.pieceId].direction} references={references.filter(reference=>effectiveReferences(s,draft.pieceId).some(item=>item.id===reference.id))} onPropose={criterion=>local.change(value=>addPostCriterion(value,draft.pieceId,criterion))} onDecide={decision=>local.change(value=>decidePostCriterion(value,draft.pieceId,decision))}/>}<button type="button" className="studio-button" onClick={()=>setPostSettingsOpen(false)}>Voltar ao post</button></StudioDialog>}
          {viewingArt&&base&&<StudioDialog title="Arte do post" onClose={()=>setViewingArt(false)}><GuidedArtPreview image={base}/></StudioDialog>}
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
          <p className="studio-hint">{postTitle}</p><StudioReview title={projectDetails.title} draft={draft} base={base} />
          <button onClick={() => nextStage("studio")}>
            Pedir ajuste no estúdio
          </button>
        </StudioPanel>
      )}
    </StudioShell>
  );
}

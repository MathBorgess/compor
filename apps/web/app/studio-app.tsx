"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import StudioShell, { StudioPanel, type StudioStage, type StudioDrawer } from "./studio-shell";
import PersonaStep from "./persona-step";
import StudioDirection from "./studio-direction";
import StudioEditor from "./studio-editor";
import StudioReview from "./studio-review";
import VariantCards from "./studio-variant-cards";
import type { ImageProposal } from '@compor/agents-api/image-proposal';
import { useStudioState } from "./use-studio-state";
import {PreparationSteps,ProjectQuestions,ProjectAI,ProjectPosts,GuidedWorkspace,GuidedArtPreview} from './studio-guided';
import {updateWorkflow,conversationMessages,postIds,startPostPreparation,completePostPreparation,updatePostPreparation,updateLegacyPostName,cancelPostPreparation,removePostFromList,prepareReferenceWorkspace} from '../lib/studio-workflow';
import StudioNavigation from './studio-navigation';
import {postMutationSchema,postNameSchema,type PostRecord} from '../lib/post-catalog';
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
import {confirmedExploration,recordCompletedExploration,prepareExplorationDraft} from "../lib/exploration-draft";
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
  changeStudioState,
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
import { rootRoute, useStudioRoute, type StudioRoute } from "../lib/studio-route";
import StudioProfile from "./studio-profile";
import StudioAssets from "./studio-assets";

import * as z from '../lib/schema.ts';
import { projectsSchema, projectResponseSchema, versionsSchema, savedVersionSchema, versionSchema, type Project, type PieceVersion, type ImageSelection } from './studio-ui-types';
import type { StudioState, StudioReference, ActionResult, DraftContext } from '../lib/studio-domain';
import type { ActionInputByName, StudioActionName, StudioAction } from '@compor/agents-api/studio-chat-tools';
declare global { interface Document { readonly modelContext?: StudioModelContext } }
type StudioHandlers = {[Name in StudioActionName]:(input:ActionInputByName[Name], context?:{signal?:AbortSignal;conversationId?:string})=>Promise<ActionResult>};
type StudioAppProps={userId:string;hasApiKey:boolean;canUseAI?:boolean;credentialSource?:CredentialSource;credentialEpoch?:number;defaultAvailable?:boolean;onUseAI?:()=>void;onPauseAI?:()=>void;getApiKey:()=>string;keyInput:ReactNode;onRemoveKey:()=>void;initialObjective:string;recoveryBanner?:ReactNode;isAuthenticated:()=>boolean;developerMode?:boolean;accountLabel?:string;localAccount?:boolean;onSignOut?:()=>void|Promise<void>};
type RegisterProjectLeaveGuard=(projectId:string,guard:()=>Promise<boolean>)=>()=>void;
type ProjectStudioProps=Omit<StudioAppProps,'recoveryBanner'>&{project:Project;projects:Project[];onOpenProject:(project:Project)=>void;onProjectRenamed:(project:Project)=>void;onCreateNew:()=>void;onBack:()=>void;initialPrepare:boolean;routePieceId:string|null;onRoutePiece:(pieceId:string|null,replace:boolean)=>void;openedFromUrl:boolean;onRegisterLeaveGuard:RegisterProjectLeaveGuard;onOpenProfile:()=>void;onRequestDelete:()=>void;accountOverlays:ReactNode};
type Confirmation={name:StudioActionName;args:StudioAction};
const renamedProjectSchema=z.extend(projectResponseSchema,{status:z.literal('renamed')});
const approvedVersionSchema=z.object({status:z.literal('approved'),version:versionSchema});
const homeSteps=[['Projeto','Um nome'],['Contexto','Oferta e público'],['IA','Escolha a IA'],['Referências','Opcional'],['Post','Seu pedido']] as const;
const lastProjectKey=(userId:string)=>`compor:last-project:${userId}`;
const createdDate=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric'});
function formatCreated(value?:string){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':createdDate.format(date);}
function newestProject(projects:Project[]){return projects.reduce<Project|undefined>((best,project)=>!best||(project.created_at??'')>=(best.created_at??'')?project:best,undefined);}
const settingsSections=[['context','Contexto'],['ai','IA'],['references','Referências'],['direction','Marca e direção'],['materials','Materiais e versões'],['history','Histórico anterior']] as const;

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
  const [profileOpen,setProfileOpen]=useState(false);
  const deleteLock=useRef(false);
  const seq = useRef(0);
  const focusCreate = useRef(false);
  const [route, navigate] = useStudioRoute();
  const selectedRoute = useRef<StudioRoute>(rootRoute);
  const leaveGuard = useRef<{projectId:string;guard:()=>Promise<boolean>}|null>(null);
  const registerLeaveGuard = useCallback<RegisterProjectLeaveGuard>((projectId,guard) => {
    leaveGuard.current = {projectId,guard};
    return () => { if (leaveGuard.current?.guard === guard) leaveGuard.current = null; };
  }, []);
  if (selected && route?.projectId === selected.id) selectedRoute.current = route;
  const [openedFromUrl, setOpenedFromUrl] = useState(false);
  // Only the id of the last opened project stays in this browser, to offer it first on the home screen.
  const [lastOpened, setLastOpened] = useState<string|null>(null);
  useEffect(() => { try { setLastOpened(localStorage.getItem(lastProjectKey(userId))); } catch { setLastOpened(null); } }, [userId]);
  function rememberProject(id:string) {
    setLastOpened(id);
    try { localStorage.setItem(lastProjectKey(userId), id); } catch { /* the home screen falls back to the newest project */ }
  }
  const hasProjects = projects.length > 0;
  const openedProject = projects.find(project => project.id === lastOpened);
  const resumeProject = projects.length > 1 ? openedProject ?? newestProject(projects) : undefined;
  const resume = resumeProject ? { project: resumeProject, opened: resumeProject === openedProject, created: formatCreated(resumeProject.created_at) } : null;
  function openProject(project:Project, created=false) {
    rememberProject(project.id);
    setCreatedProjectId(created ? project.id : null);
    setOpenedFromUrl(false);
    setSelected(project);
    selectedRoute.current = { projectId: project.id, pieceId: null };
    navigate(selectedRoute.current);
  }
  // The URL (initial load or back/forward) chooses the open project once the list is known.
  useEffect(() => {
    if (!route) return;
    if (selected?.id === route.projectId || (route.projectId && state !== "ready")) return;
    function applyRoute() {
      if (!route?.projectId) { if (selected) { setSelected(null); void refresh(); } return; }
      const target = projects.find(project => project.id === route.projectId);
      if (target) { selectedRoute.current=route; rememberProject(target.id); setCreatedProjectId(null); setOpenedFromUrl(true); setSelected(target); }
      else { navigate(rootRoute, { replace: true }); setNotice("Este projeto não está disponível na sua conta."); }
    }
    if (!selected) { applyRoute(); return; }
    let cancelled = false;
    const registered = leaveGuard.current;
    void (async () => {
      const preserved = registered?.projectId === selected.id && await registered.guard();
      if (cancelled) return;
      // Keep the destination in history so a later Back can retry after storage recovers.
      if (!preserved) { navigate(selectedRoute.current); return; }
      applyRoute();
    })();
    return () => { cancelled = true; };
  }, [route, state, projects, selected?.id]);
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
    setDeleteTarget(null);setDeleteError('');setProfileOpen(false);deleteLock.current=false;
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
    navigate(rootRoute);
    refresh();
  }
  function projectRenamed(project:Project) {
    setProjects(items => items.map(item => item.id === project.id ? {...item,...project} : item));
    setSelected(current => current?.id === project.id ? {...current,...project} : current);
  }
  async function openProfile(){
    if(selected){
      const registered=leaveGuard.current;
      if(registered?.projectId!==selected.id||!await registered.guard())return;
    }
    if(isAuthenticated())setProfileOpen(true);
  }
  async function requestDeletion(project:Project){
    if(selected?.id===project.id){
      const registered=leaveGuard.current;
      if(registered?.projectId!==project.id||!await registered.guard())return;
    }
    if(isAuthenticated()){setDeleteError('');setDeleteTarget(project);}
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
      setProjects(items=>items.filter(item=>item.id!==target.id));setDeleteTarget(null);setNotice('Projeto excluído da lista. Seus aprendizados continuam em Seu perfil.');
      if(selected?.id===target.id){setSelected(null);navigate(rootRoute,{replace:true});}
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
      openProject(data.project, true);
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
  const accountOverlays=<>{profileOpen&&<StudioProfile userId={userId} isAuthenticated={isAuthenticated} onClose={()=>setProfileOpen(false)}/>}
    {deleteTarget&&<StudioDialog title="Excluir projeto?" onClose={()=>{if(!deleteLock.current)setDeleteTarget(null);}}><p>Excluir “{deleteTarget.title}” da sua lista de projetos?</p><p>Seus aprendizados continuam em Seu perfil, com as escolhas, comentários e critérios deste projeto. Posts, imagens e históricos são preservados. Esta ação remove o projeto da lista; não apaga seus arquivos definitivamente.</p>{deleteError&&<p role="alert">{deleteError}</p>}<button type="button" className="studio-button-secondary" disabled={state==='deleting'} onClick={()=>setDeleteTarget(null)}>Cancelar</button>{deleteError?<button type="button" className="studio-button" onClick={()=>{setDeleteTarget(null);setDeleteError('');setSelected(null);navigate(rootRoute,{replace:true});void refresh();}}>Atualizar projetos</button>:<button type="button" className="studio-button" disabled={state==='deleting'} onClick={()=>void deleteProject()}>{state==='deleting'?'Excluindo…':'Excluir projeto'}</button>}</StudioDialog>}
  </>;
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
        onOpenProject={project => openProject(project)}
        onProjectRenamed={projectRenamed}
        onCreateNew={requestCreate}
        onBack={() => {setSelected(null);navigate(rootRoute);refresh();}}
        routePieceId={route?.projectId===selected.id?route.pieceId:selectedRoute.current.pieceId}
        onRoutePiece={(pieceId,replace)=>{
          selectedRoute.current={projectId:selected.id,pieceId};
          if(route?.projectId===selected.id)navigate(selectedRoute.current,{replace});
        }}
        onOpenProfile={()=>{void openProfile();}}
        onRequestDelete={()=>{void requestDeletion(selected);}}
        accountOverlays={accountOverlays}
        onRegisterLeaveGuard={registerLeaveGuard}
        openedFromUrl={openedFromUrl}
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
      onOpenProfile={()=>{void openProfile();}}
      overlays={accountOverlays}
      accountLabel={accountLabel}
      localAccount={localAccount}
      onSignOut={onSignOut}
      onNewProject={() =>
        document.getElementById("studio-project-name")?.focus()
      }
    >
      {recoveryBanner}

      <div className="studio-home" data-empty={hasProjects?undefined:'true'}>
      {resume&&<section className="studio-home-resume" aria-labelledby="resume-title">
        <div className="studio-home-resume-art" aria-hidden="true"><span/><span/><span/></div>
        <div className="studio-home-resume-body">
          <p className="studio-home-eyebrow">{resume.opened?'Aberto por último':'Mais recente'}</p>
          <h2 id="resume-title" title={resume.project.title}>{resume.project.title}</h2>
          {resume.created&&<p className="studio-home-meta">Criado em {resume.created}</p>}
          <button type="button" className="studio-button" disabled={state==='deleting'} onClick={() => openProject(resume.project)}>Continuar projeto</button>
        </div>
      </section>}
      <section className="studio-recent-projects" aria-label="Conversas e projetos anteriores">
        <h2>{hasProjects?'Todos os projetos':'Seus projetos'}</h2>
        {state === "loading" && <p role="status">Carregando seus projetos…</p>}{state === "ready" && projects.length===0 && <p>Seus projetos aparecerão aqui. Comece com uma ideia acima.</p>}
        <div className="studio-project-grid">
          {projects.map(project => <div className="studio-project-entry" key={project.id}><button className="studio-project-card" title={project.title} disabled={state==='deleting'} onClick={() => openProject(project)}><strong id={`project-title-${project.id}`} className="studio-truncate">{project.title}</strong><span>Abrir projeto</span></button><button type="button" className="studio-project-delete" title="Excluir projeto" aria-label="Excluir projeto" aria-describedby={`project-title-${project.id}`} disabled={state!=='ready'||!project.revision} onClick={()=>{void requestDeletion(project);}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button></div>)}
        </div>
      </section>
      <section className="studio-starter" aria-labelledby="starter-title">
        <h2 id="starter-title">{hasProjects?'Novo projeto':'Comece um projeto'}</h2>
        <p>Você prepara o projeto uma vez e cada post nasce dele. Nenhuma imagem é gerada até você pedir.</p>
        <ol className="studio-home-steps" aria-label="Etapas de um projeto">
          {homeSteps.map(([label,detail],index)=><li key={label} aria-current={index===0?'step':undefined}><span aria-hidden="true">{index+1}</span><strong>{label}</strong><small>{detail}</small></li>)}
        </ol>
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
      </div>
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
  routePieceId,
  onRoutePiece,
  openedFromUrl,
  onRegisterLeaveGuard,
  onOpenProfile,
  onRequestDelete,
  accountOverlays,
}: ProjectStudioProps) {
  const session = useStudioState({ userId, projectId: project.id, prepare:initialPrepare,projectIdea:initialObjective }), s=session.state;
  const local = {...session,get:():StudioState=>{const value=session.get();if(!value)throw Error("O estúdio ainda está carregando.");return value;}};
  const [projectIntent, setProjectIntent] = useState(false);
  const [settingsTab,setSettingsTab]=useState<'context'|'ai'|'references'|'direction'|'materials'|'history'|null>(null);
  const [referenceScope,setReferenceScope]=useState('references');
  const [referenceWaits,setReferenceWaits]=useState<Record<string,boolean>>({});
  const reportReferenceWait=useCallback((conversationId:string,waiting:boolean)=>setReferenceWaits(current=>current[conversationId]===waiting?current:{...current,[conversationId]:waiting}),[]);
  const [referenceChatTarget,setReferenceChatTarget]=useState<HTMLDivElement|null>(null);
  const [postSettingsOpen,setPostSettingsOpen]=useState(false);
  const [postRecords,setPostRecords]=useState<PostRecord[]>([]);
  const postRecordsRef=useRef<PostRecord[]>([]);postRecordsRef.current=postRecords;
  const [creatingPost,setCreatingPost]=useState(false),[deletingPost,setDeletingPost]=useState(false);
  const [postDeleteTarget,setPostDeleteTarget]=useState<{pieceId:string;name:string}|null>(null),[postDeleteError,setPostDeleteError]=useState('');
  const [explorationRequested,setExplorationRequested]=useState(false);
  const [referenceTransition,setReferenceTransition]=useState(false);
  const referenceTransitionLock=useRef(false);
  const [visitedPosts,setVisitedPosts]=useState<string[]>([]);
  const projectAIChosen=Boolean(s&&s.workflow.aiPreference!=='none'&&s.workflow.aiPreference===credentialSource);
  const canUseProjectAI=canUseAI&&projectAIChosen;
  const hasApiKey = credentialActive && projectAIChosen && (credentialSource !== "default" || projectIntent);
  const credentialSeen = useRef(credentialEpoch);
  const [stageRestored, setStageRestored] = useState(false);
  const [stage, setStage] = useState<StudioStage>("studio"),
    [versionsLoaded, setVersionsLoaded] = useState(false),
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
  useEffect(() => onRegisterLeaveGuard(project.id, async () => {
    try {
      if (!session.loading) await session.flush();
      return active.current;
    } catch {
      setNotice("Não foi possível preservar o projeto antes de sair.");
      return false;
    }
  }), [project.id, session.loading, session.flush, onRegisterLeaveGuard]);
  const draft = s ? getCurrentDraft(s) : null;
  useEffect(()=>{
    const pieceId=s?.selection?.pieceId;
    if(!s||!pieceId||!postRecords.some(post=>post.pieceId===pieceId&&post.deleted)||s.adjustments.some(turn=>turn.context.pieceId===pieceId&&!['completed','failed'].includes(turn.status)))return;
    local.change(value=>removePostFromList(value,pieceId));setStage('studio');
  },[postRecords,s?.selection?.pieceId,s?.adjustments]);
  const currentSettings=settingsTab??(drawer==='marca'?'direction':drawer==='bases'?'materials':null);
  const referencesOpen=s?.workflow.phase==='references'||currentSettings==='references';
  useEffect(()=>{if(draft)setVisitedPosts(ids=>ids.includes(draft.pieceId)?ids:[...ids,draft.pieceId]);},[draft?.pieceId]);
  useEffect(()=>{if(!referencesOpen){setExplorationRequested(false);}},[referencesOpen]);
  const idea = studioProjectIdea(s,initialObjective);
  const exploration = useExplorationLoop({ userId, projectId: project.id, state: s?conversationContext(s,referenceScope):null, getState: ()=>{const value=session.get();return value?conversationContext(value,referenceScope):null;}, conversationId:referenceScope, hasApiKey, canUseAI:canUseProjectAI, getApiKey, credentialSource, credentialEpoch, isAuthenticated, idea:referenceScope==='references'?idea:s?postContext(s,referenceScope).message||idea:idea, enabled: stageRestored && (stage === "studio" || currentSettings === "references") && referencesOpen && explorationRequested, onCompleted:async(imageId,ordinal,conversationId,creationContext)=>{
    if(!active.current||!isAuthenticated())throw Error("studio_unavailable");
    const state=local.get();
    if(state.workflow.latestExplorations?.[conversationId]?.imageId!==imageId){
      const candidate=await confirmedExploration(project.id,imageId);
      if(!active.current||!isAuthenticated())throw Error("studio_unavailable");
      local.change(value=>recordCompletedExploration(value,conversationId,{...candidate,...(creationContext?{creationContext}:{})}));
    }
    await local.flush();
  } });
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
    if(data.posts.some(post=>post.projectId!==project.id))throw Error('invalid posts');
    if (active.current&&readSequence===versionsReadSequence.current){setVersionsLoaded(true);setVersions(data.versions.filter(version=>!isRemoved(version.piece_id)));setPostRecords(previous=>[...data.posts.filter(post=>!previous.some(old=>old.pieceId===post.pieceId&&old.deleted)),...previous.filter(post=>post.deleted)]);}
    return data.versions;
  }
  useEffect(() => {
    active.current = true;
    refreshVersions().catch(() => {
      setVersionsLoaded(true);
      setNotice("As versões não estão disponíveis.");
    });
    return () => {
      active.current = false;
      confirmResolver.current?.(false);
    };
  }, [project.id]);
  useEffect(() => {
    if (s && referencesOpen && !s.selection) local.change(value => prepareReferenceWorkspace(value,crypto.randomUUID()));
  }, [Boolean(s),referencesOpen]);
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
  // The address bar names the open post (/projetos/<id>/posts/<pieceId>); the reference workspace is not a post.
  const openPieceId = s && s.workflow.phase === "ready" && (s.workflow.view === "compose" || s.workflow.view === "studio") &&
    s.selection && s.selection.pieceId !== s.workflow.referencePieceId ? s.selection.pieceId : null;
  // Opened from the project list, the project resumes its saved screen and the URL follows it.
  const routeSync = useRef<{target:string|null|undefined;tried:boolean;done:boolean;resume:boolean}>({target:undefined,tried:false,done:false,resume:!openedFromUrl});
  useEffect(() => { // URL -> screen (initial load, back/forward)
    const sync = routeSync.current;
    if (sync.target !== routePieceId) {
      const resume = sync.target === undefined && sync.resume && routePieceId === null;
      Object.assign(sync, {target:routePieceId,tried:false,done:resume});
    }
    if (s && sync.resume && openPieceId === routePieceId) sync.resume = false; // resumed screen already matches the URL
    if (sync.done || !s) return;
    if (openPieceId === routePieceId) { sync.done = true; return; }
    if (sync.tried || s.workflow.phase !== "ready") { sync.done = true; onRoutePiece(openPieceId, true); return; }
    if (routePieceId === null) {
      sync.tried = true;
      closeSettings(); setPostSettingsOpen(false); nextStage("studio");
      local.change(value => updateWorkflow(value, {view:"posts"}));
      return;
    }
    const known = s.drafts.some(item => item.pieceId === routePieceId) || versions.some(item => item.piece_id === routePieceId) ||
      postRecords.some(post => post.pieceId === routePieceId && !post.deleted);
    if (!known && !versionsLoaded) return;
    if (!known || isRemoved(routePieceId)) {
      // Keep screen -> URL paused until the list renders, even when the catalog loaded before local state.
      sync.tried = true;
      closeSettings(); setPostSettingsOpen(false); nextStage("studio");
      local.change(value => updateWorkflow(value, {view:"posts"}));
      onRoutePiece(null, true);
      return;
    }
    sync.tried = true;
    openPost(routePieceId);
  }, [Boolean(s), routePieceId, openPieceId, versionsLoaded]);
  useEffect(() => { // screen -> URL
    const sync = routeSync.current;
    if (!s || !sync.done || openPieceId === routePieceId) return;
    onRoutePiece(openPieceId, sync.resume);
    sync.resume = false;
  }, [openPieceId]);
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
  function setSettings(value:typeof settingsTab){if(value==='references')setStage('studio');setSettingsTab(value);}
  function closeSettings(){setSettings(null);setDrawer(null);}
  function isRemoved(pieceId:string){return Boolean(session.get()?.posts[pieceId]?.deleted||postRecordsRef.current.some(post=>post.pieceId===pieceId&&post.deleted));}
  function newPost(pieceId:string = crypto.randomUUID(),fromAgent=false) {
    if(isRemoved(pieceId))throw Error("Post excluído.");
    closeSettings();
    if(fromAgent)exploration.pause();
    local.change(value=>{const next=startPostPreparation(value,pieceId);return fromAgent?changeStudioState(next,state=>{state.selection=null;if(state.workflow.phase==='references')state.workflow.phase='ready';if(referencesOpen&&state.workflow.latestExplorations?.[referenceScope])state.workflow.referenceHandoff=referenceScope;}):next;});
    setBase(null);setViewingArt(false);setStage('studio');
  }
  async function confirmPostCreation(){
    if(creatingPost)return;
    const value=local.get(),pieceId=value.workflow.pendingPost?.pieceId??value.selection?.pieceId;
    const parsed=postNameSchema.safeParse(value.workflow.pendingPost?.name??(pieceId?value.posts[pieceId]?.name:''));
    if(!pieceId||!parsed.success)return;
    const plannedHandoff=value.workflow.referenceHandoff,plannedImage=plannedHandoff?value.workflow.latestExplorations?.[plannedHandoff]?.imageId:undefined;
    setCreatingPost(true);setNotice('');
    try{
      await local.flush();
      const response=await fetch('/api/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,pieceId,name:parsed.data})});
      if(!response.ok)throw Error('unconfirmed');const result=postMutationSchema.parse(await response.json());
      if(result.status!=='created'||result.post.projectId!==project.id||result.post.pieceId!==pieceId||result.post.name!==parsed.data||result.post.deleted)throw Error('unconfirmed');
      if(!active.current||!isAuthenticated())return;
      ++versionsReadSequence.current;
      setPostRecords(previous=>[...previous.filter(post=>post.pieceId!==pieceId),result.post]);
      const latest=local.get(),currentPiece=latest.workflow.pendingPost?.pieceId??latest.selection?.pieceId,currentName=latest.workflow.pendingPost?.name??latest.posts[pieceId]?.name;
      const currentParsedName=postNameSchema.safeParse(currentName);
      if(currentPiece!==pieceId||!currentParsedName.success||currentParsedName.data!==parsed.data){
        if(plannedHandoff&&latest.workflow.referenceHandoff===plannedHandoff&&latest.workflow.latestExplorations?.[plannedHandoff]?.imageId===plannedImage)local.change(state=>updateWorkflow(state,{referenceHandoff:null}));
        await local.flush();setNotice(`O post “${parsed.data}” foi criado. Sua preparação mais recente foi preservada.`);return;
      }
      const handoff=plannedHandoff;
      local.change(state=>updateWorkflow(completePostPreparation(state),{view:'prepare-post'}));await local.flush();
      const retained=handoff?await retainReferenceProposal(handoff):{result:'none',hasImage:false};
      if(!active.current||!isAuthenticated())return;
      local.change(state=>updateWorkflow(state,{view:retained.hasImage?'studio':'compose',referenceHandoff:null}));await local.flush();
      if(retained.result==='retained')setNotice('A última proposta do Compor está preservada como v0 deste post.');
    }catch{if(active.current)setNotice('Não foi possível confirmar a criação do post. Sua preparação foi mantida. Tente novamente para verificar o mesmo pedido.');}
    finally{if(active.current)setCreatingPost(false);}
  }
  async function confirmPostDeletion(){
    if(!postDeleteTarget||deletingPost)return;
    const {pieceId}=postDeleteTarget;
    if(local.get().adjustments.some(turn=>turn.context.pieceId===pieceId&&!['completed','failed'].includes(turn.status))){setPostDeleteError('Conclua ou verifique o pedido pendente antes de excluir este post.');return;}
    setDeletingPost(true);setPostDeleteError('');
    try{
      await local.flush();
      const response=await fetch('/api/posts',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,pieceId})});
      if(!response.ok)throw Error('unconfirmed');const result=postMutationSchema.parse(await response.json());
      if(result.status!=='deleted'||result.post.projectId!==project.id||result.post.pieceId!==pieceId||!result.post.deleted)throw Error('unconfirmed');
      if(!active.current||!isAuthenticated())return;
      ++versionsReadSequence.current;
      setPostRecords(previous=>[...previous.filter(post=>post.pieceId!==pieceId),result.post]);
      setVersions(previous=>previous.filter(version=>version.piece_id!==pieceId));
      local.change(value=>removePostFromList(value,pieceId));await local.flush();
      setPostDeleteTarget(null);setNotice('Post excluído da lista deste projeto.');
    }catch{if(active.current)setPostDeleteError('Não foi possível confirmar a exclusão. Verifique novamente antes de sair; não houve repetição automática.');}
    finally{if(active.current)setDeletingPost(false);}
  }
  function openPost(pieceId:string) {
    if(isRemoved(pieceId))return;
    const value=local.get(),remembered=value.workflow.selections[pieceId];
    const chosen=value.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===remembered)??value.drafts.filter(item=>item.pieceId===pieceId).at(-1);
    closeSettings();setStage('studio');
    if(chosen)local.change(state=>updateWorkflow(selectDraft(state,chosen),{view:state.posts[pieceId]?.prepared===false?'prepare-post':'studio'}));
    else {const version=versionRef.current.filter(item=>item.piece_id===pieceId).toSorted((a,b)=>b.version-a.version)[0];if(version)openVersion(version);else if(postRecordsRef.current.some(post=>post.pieceId===pieceId&&!post.deleted))local.change(value=>updateWorkflow(createPost(value,{pieceId}),{view:'compose'}));}
  }
  function openVersion(version:PieceVersion) {
    if(isRemoved(version.piece_id))return;
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
        status: "declined",
        local: true,
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
  async function useSharedReference(id:string) {
    const scope=referenceScope;
    if(scope==='references')return;
    try {
      const current=local.get();
      const reference=current.references.find(item=>item.id===id);
      if(!reference||!current.projectReferenceIds.includes(id))throw Error('reference_unavailable');
      if(!local.change(value=>selectScopedReference(value,reference,scope)))throw Error('studio_unavailable');
      await local.flush();
      try { recordReferenceRound(conversationContext(local.get(),scope)); } catch {}
    } catch { if(active.current)setNotice('Não foi possível salvar a seleção.'); }
  }
  async function removeFile(id:string):Promise<boolean> {
    const scope=referenceScope,before=local.get(),reference=before.references.find(item=>item.id===id);
    if(!reference)return false;
    local.change(value=>unselectScopedReference(value,id,scope));
    try {await local.flush();}
    catch {
      // Restore only this selection; preserve unrelated edits made during the write.
      local.change(value=>changeStudioState(selectScopedReference(value,reference,scope),next=>{
        for(const [pieceId,post] of Object.entries(before.posts)){
          const current=next.posts[pieceId];
          if(current&&post.excludedReferenceIds.includes(id)&&!current.excludedReferenceIds.includes(id))current.excludedReferenceIds.push(id);
        }
      }));
      if(active.current)setNotice('Não foi possível confirmar a retirada. A referência continua selecionada.');
      return false;
    }
    try {recordReferenceRound(conversationContext(local.get(),scope));} catch {}
    try {
      if(!local.get().references.some(item=>item.id===id))await local.storage.current?.removeReference({userId,projectId:project.id},id);
      if(active.current)setNotice('Referência retirada da seleção.');
    } catch {
      if(active.current)setNotice('Referência retirada da seleção. O arquivo continua preservado no histórico local.');
    }
    return true;
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
  const renderChat = (conversationId:string|undefined,intro=false,readOnly=false,referenceWorkbench=false) => (
    <StudioChat key={conversationId??"legacy"} conversationId={conversationId} portalTarget={conversationId===referenceScope&&referencesOpen?referenceChatTarget:null} intro={intro&&!(conversationId===referenceScope&&referenceChatTarget)} readOnly={readOnly} referenceWorkbench={referenceWorkbench||Boolean(conversationId===referenceScope&&referencesOpen)} allowReferenceAnalysis={referencesOpen&&conversationId===referenceScope} onReferenceWait={reportReferenceWait}
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
            <h2>Materiais e versões</h2>
            <p>Abra um post para ver seus rascunhos e versões. As referências ficam na aba Referências.</p>
            <div className="guided-actions">
              <button type="button" className="studio-button-secondary" onClick={()=>{closeSettings();nextStage('studio');local.change(value=>updateWorkflow(value,{view:'posts'}));}}>Abrir posts do projeto</button>
              {draft&&s.workflow.view!=='posts'&&<button type="button" className="studio-button-secondary" onClick={()=>{closeSettings();nextStage('studio');local.change(value=>updateWorkflow(value,{view:'studio'}));requestAnimationFrame(()=>{const details=document.querySelector<HTMLDetailsElement>('.guided-versions');if(details){details.open=true;details.querySelector('summary')?.focus();}});}}>Ver versões deste post</button>}
              <button type="button" className="studio-button-secondary" onClick={()=>{void refreshVersions().catch(()=>setNotice('Não foi possível atualizar as versões.'));}}>Atualizar versões</button>
            </div>
            {draft&&s.workflow.view!=='posts'&&<StudioAssets
              userId={userId}
              projectId={project.id}
              pieceId={draft.pieceId}
              version={draft.baseVersion}
              canSave={draft.baseVersion > 0 && !draft.dirty}
              preview={base}
              onUseImage={useBase}
            />}
          </div>
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
  const postTitle=(draft&&(s.posts[draft.pieceId]?.name||postRecords.find(post=>post.pieceId===draft.pieceId)?.name))||draft?.content.headline||`Post ${postIds(s).indexOf(draft?.pieceId??'')+1}`;
  const postVersionLabel=draft?.approval.status==="approved"?"Aprovado":draft?.dirty?"Rascunho":draft?.baseVersion?`Versão ${draft.baseVersion}`:draft?.creationContext?.explorationSource?"v0 · Rascunho":"Rascunho";
  // ADR 0056: nome do post, versão e ações ficam no topo do próprio post; a barra superior é fixa.
  const artwork=(<div className="studio-post-workspace">
          <div className="studio-post-workspace-header">
            <div className="studio-post-identity"><h2 title={postTitle}>{postTitle}</h2><span className="studio-badge">{postVersionLabel}</span></div>
            <div className="studio-post-actions" role="toolbar" aria-label="Ações deste post"><button type="button" className="studio-button-secondary" onClick={()=>{setReferenceScope(draft?.pieceId??'references');setDrawer(null);setSettings('references');}}>Escolher mais referências</button>
            <button type="button" className="studio-button-secondary" onClick={()=>setPostSettingsOpen(true)}>Configurações do Post</button>
            <button type="button" className="studio-button-secondary" disabled={s.workflow.view==='prepare-post'} onClick={()=>nextStage('review')}>Revisar post</button>
            <button type="button" className="studio-button" disabled={saving||s.workflow.view==='prepare-post'} onClick={()=>{void saveCurrent();}}>{saving?'Salvando…':'Salvar versão'}</button></div></div>

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
  async function renameProject(title:string){
    try {
      const result=await handlersRef.current.compor_renomear_projeto({projectId:project.id,requestId:crypto.randomUUID(),revision:local.get().revision,title});
      return result.status === "completed";
    } catch {setNotice("Não foi possível confirmar a alteração do nome.");return false;}
  }
  const returnToWorkspaceLabel=s.workflow.view==='posts'?'Voltar aos posts':'Voltar ao post';
  async function retainReferenceProposal(conversationId:string) {
    const storage=local.storage.current;
    if(!storage&&local.get().workflow.latestExplorations?.[conversationId])throw Error('studio_storage_unavailable');
    const result=storage?await prepareExplorationDraft({conversationId,getState:local.get,change:local.change,flush:local.flush,storage}):'none';
    if(!active.current||!isAuthenticated())throw Error('studio_unavailable');
    const selected=getCurrentDraft(local.get());
    let image=selected?.pieceId===draft?.pieceId?base:null;
    if(selected&&storage&&result!=='none'){image=(await storage.getDraftAsset({userId,projectId:project.id},{pieceId:selected.pieceId,baseVersion:selected.baseVersion,kind:'base'}))?.file??null;baseLoadGeneration.current++;setBase(image);}
    return {result,hasImage:Boolean(image)};
  }
  async function finishReferences() {
    if(referenceTransitionLock.current)return false;
    referenceTransitionLock.current=true;setReferenceTransition(true);exploration.pause();
    try {
      const value=local.get(),selected=getCurrentDraft(value);
      const defer=preparing||!selected||selected.pieceId===value.workflow.referencePieceId||value.workflow.view==='posts'||value.workflow.view==='prepare-post';
      if(defer){
        if(value.workflow.latestExplorations?.[referenceScope])local.change(state=>updateWorkflow(state,{referenceHandoff:referenceScope}));
        if(preparing){
          setSettings('references');
          local.change(state=>{const ready=updateWorkflow(state,{phase:'ready'});return ready.workflow.pendingPost?updateWorkflow(ready,{view:'prepare-post'}):startPostPreparation(ready,crypto.randomUUID());});
        }
        await local.flush();
      } else {
        const retained=await retainReferenceProposal(referenceScope);
        if(retained.result==='retained')setNotice('A última proposta do Compor está preservada como v0 deste post.');
      }
      if(!active.current||!isAuthenticated())return false;
      closeSettings();
      requestAnimationFrame(()=>{const name=document.querySelector<HTMLInputElement>('.guided-post-preparation-fields input');if(name)name.focus();else document.querySelector<HTMLButtonElement>('.studio-post-actions button')?.focus();});
      return true;
    } catch {setNotice('Não foi possível preservar a proposta para o post. Suas referências continuam aqui; tente continuar novamente.');return false;}
    finally {referenceTransitionLock.current=false;if(active.current)setReferenceTransition(false);}
  }
  const nextReferences=()=>local.change(value=>updateWorkflow(value,{phase:'references'}));
  const aiPanel=<ProjectAI continueLabel={preparing?'Continuar para referências':returnToWorkspaceLabel} preference={s.workflow.aiPreference} source={credentialSource} available={defaultAvailable} canUseAI={canUseAI} keyInput={keyInput} onDefault={()=>{if(credentialSource==='byok')onRemoveKey();local.change(value=>updateWorkflow(value,{aiPreference:'default'}));activateAI();}} onOwn={()=>local.change(value=>updateWorkflow(value,{aiPreference:'byok'}))} onRemove={()=>{onRemoveKey();setProjectIntent(false);exploration.pause();}} onContinue={preparing?nextReferences:closeSettings} onSkip={()=>{continueWithoutAI();if(preparing)nextReferences();else closeSettings();}} onBack={()=>preparing?local.change(value=>updateWorkflow(value,{phase:'context'})):closeSettings()}/>;
  const referencePanel=<ReferencePanel entry={preparing?'preparation':draft&&referenceScope!=='references'?'post':'project'} projectTitle={projectDetails.title} selectionCount={scopedReferences.length} selectionWaiting={Boolean(referenceWaits[referenceScope])} needsResponse={exploration.awaitingAnswer||exploration.awaitingFeedback} projectWide={referenceScope==='references'} continueDisabled={referenceTransition} onRequestProposals={()=>{activateAI();setExplorationRequested(true);void exploration.resume();}} proposalsDisabled={referenceTransition||!canUseProjectAI||explorationRequested&&!exploration.paused&&!exploration.blocked&&!exploration.awaitingAnswer&&!exploration.awaitingFeedback} proposalsRunning={explorationRequested&&!exploration.paused&&!exploration.blocked&&!exploration.awaitingAnswer&&!exploration.awaitingFeedback} onPauseProposals={exploration.pause} proposalPhase={exploration.phase} proposalStatus={referenceTransition?'Preservando a proposta para o post…':explorationRequested?exploration.status:undefined} onScope={!preparing&&draft?wide=>{exploration.pause();setExplorationRequested(false);setReferenceScope(wide?'references':draft.pieceId);}:undefined}
    selection={<ReferenceSelectionTray items={scopedReferences.map(reference=>({...reference,url:references.find(item=>item.id===reference.id)?.url,scopeLabel:s.projectReferenceIds.includes(reference.id)?'Do projeto':'Deste post',removeLabel:referenceScope==='references'?'Remover do projeto':s.projectReferenceIds.includes(reference.id)?'Deixar de usar neste post':'Remover deste post',...(referenceScope!=='references'&&!s.projectReferenceIds.includes(reference.id)?{onShare:()=>{void selectExistingReference(reference,'references').catch(()=>setNotice('Não foi possível confirmar o compartilhamento.'));}}:{})}))} availableShared={referenceScope==='references'?[]:s.references.filter(reference=>s.projectReferenceIds.includes(reference.id)&&!scopedReferences.some(item=>item.id===reference.id)).map(reference=>({...reference,url:references.find(item=>item.id===reference.id)?.url}))} onUseShared={referenceScope==='references'?undefined:useSharedReference} limit={STUDIO_LIMITS.references} onRemove={async id=>{await removeFile(id);}}/>}
    search={sourceControl=><ReferenceExploration sourceControl={sourceControl} key={referenceScope} userId={userId} projectId={project.id} idea={referenceScope==='references'?idea:postContext(s,referenceScope).message||idea} selectedOrigins={selectedOrigins} onUseReference={useExploredReference} onRemoveReference={async originUrl=>{const reference=effectiveReferences(local.get(),referenceScope).find(item=>item.source&&'originUrl' in item.source&&item.source.originUrl===originUrl);if(!reference||!await removeFile(reference.id))throw Error('reference_removal_not_confirmed');}}/>}
    upload={<label className="guided-reference-upload">Enviar suas imagens<p>PNG ou JPEG, até 8 MB cada. Limite de 20 imagens por projeto.</p><input type="file" accept="image/png,image/jpeg" multiple onChange={event=>{void addFiles(Array.from(event.target.files??[]));event.target.value='';}}/></label>}
    proposals={<section className="reference-workbench-proposals">{!canUseProjectAI&&<p>Escolha sua IA para pedir propostas. Você pode continuar sem gerar imagens.</p>}<ExplorationGallery projectId={project.id} completed={exploration.completed} phase={exploration.phase} countdown={exploration.countdown} onUseReference={useGeneratedReference} selectedIds={selectedGeneratedIds} onRemoveReference={async imageId=>{const reference=effectiveReferences(local.get(),referenceScope).find(item=>item.source&&'kind' in item.source&&item.source.imageId===imageId);if(!reference||!await removeFile(reference.id))throw Error('reference_removal_not_confirmed');}}/></section>}
    conversation={<>{explorationRecovery}<div className="guided-reference-chat"><div className="guided-reference-post-chat" ref={setReferenceChatTarget}/></div></>}
    onBack={preparing?()=>local.change(value=>updateWorkflow(value,{phase:'ai'})):undefined} onContinue={()=>{void finishReferences();}} continueLabel={preparing?(scopedReferences.length?'Preparar primeiro post':'Continuar sem referências'):s.workflow.view==='prepare-post'?'Voltar ao pedido':returnToWorkspaceLabel}/>;
  const intro=s.workflow.view==='compose'&&!draft?.baseVersion&&!base&&!conversationMessages(s,draft?.pieceId).some(message=>message.role==='user');
  const chatIds=[...new Set([...visitedPosts,...(draft?[draft.pieceId]:[])])].filter(id=>id!==s.workflow.referencePieceId);
  const chats=chatIds.map(id=><div className="guided-conversation" key={id} hidden={id!==draft?.pieceId}>{renderChat(id,id===draft?.pieceId&&intro)}</div>);
  const pendingTurn=s.adjustments.find(item=>!['completed','failed'].includes(item.status));
  const showPosts=()=>{closeSettings();setPostSettingsOpen(false);nextStage('studio');local.change(value=>updateWorkflow(value,{view:'posts'}));};
  const pendingPost=s.workflow.pendingPost;
  const preparingPost=s.workflow.view==='prepare-post';
  const preparedValue=pendingPost??(draft?postContext(s,draft.pieceId):{objective:'',message:'',action:''});
  const preparedName=pendingPost?.name??(draft?s.posts[draft.pieceId]?.name??'':'');
  const changePreparation=(patch:Partial<typeof preparedValue&{name:string}>)=>local.change(value=>{
    if(value.workflow.pendingPost)return updatePostPreparation(value,patch);
    if(!draft)return value;
    const next=updatePostContext(value,draft.pieceId,patch);
    return 'name' in patch?updateLegacyPostName(next,draft.pieceId,patch.name??''):next;
  });
  const postPreparation=preparingPost&&<section className="studio-panel guided-question" aria-labelledby="post-preparation-title"><p className="studio-eyebrow">PREPARAR POST</p><h2 id="post-preparation-title">Vamos preparar este post</h2><p>Escolha um nome para organizar esta peça e defina o que ela deve comunicar.</p><form onSubmit={event=>{event.preventDefault();void confirmPostCreation();}}><fieldset className="guided-post-preparation-fields" disabled={creatingPost}><label>Nome do post<input required maxLength={200} value={preparedName} placeholder="Ex.: Live gratuita — Porcentagem no ENEM" disabled={creatingPost} onChange={event=>changePreparation({name:event.target.value})}/></label><PostSettings preparing value={preparedValue} legacyAction={s.brief.action} onChange={changePreparation}/><p className="studio-hint">A chamada para ação é opcional. O post será criado somente ao continuar.</p><div className="guided-actions"><button type="button" className="studio-button-secondary" disabled={creatingPost} onClick={()=>{local.change(cancelPostPreparation);showPosts();}}>Cancelar</button><button type="submit" className="studio-button" disabled={creatingPost||!postNameSchema.safeParse(preparedName).success}>{creatingPost?'Criando post…':'Continuar para criação'}</button></div></fieldset></form></section>;

  const canvas=<>
    {referencesOpen&&referencePanel}
    <div className="studio-workspace-host" hidden={referencesOpen}>
      {pendingTurn&&!preparing&&<p className="studio-hint" role="status">Há um pedido ainda não confirmado. <button type="button" onClick={()=>{if(pendingTurn.context.conversationId==='references'){setReferenceScope('references');setSettings('references');}else openPost(pendingTurn.context.pieceId);}}>Abrir a conversa desse pedido</button></p>}
      {preparing&&s.workflow.phase!=='references'&&<><PreparationSteps phase={s.workflow.phase}/>{s.workflow.phase==='context'?<ProjectQuestions state={s} onChange={patch=>local.change(value=>updateWorkflow(updateBrief(value,patch),{contextStarted:true}))} onStep={contextStep=>local.change(value=>updateWorkflow(value,{contextStep}))} onContinue={()=>local.change(value=>updateWorkflow(value,{phase:'ai'}))}/>:aiPanel}</>}
      {!preparing&&s.workflow.view==='posts'&&<ProjectPosts state={s} versions={versions} posts={postRecords} onOpen={openPost} onNew={()=>newPost()} onDelete={(pieceId,name)=>{setPostDeleteError('');setPostDeleteTarget({pieceId,name});}}/>}
      <div className="guided-post-host" hidden={preparing||s.workflow.view==='posts'} style={{height:'100%',minHeight:0,overflowY:preparingPost?'auto':undefined}}>{postPreparation}<div className="studio-workspace-view" data-active={!preparing&&!referencesOpen&&s.workflow.view!=='posts'&&!preparingPost} hidden={preparingPost} style={{height:'100%',minHeight:0}}><GuidedWorkspace chat={chats} artwork={artwork} intro={intro} onManual={()=>local.change(value=>updateWorkflow(value,{view:'studio'}))}/></div></div>
    </div>
  </>;

  return (
    <StudioShell
      stage={stage}
      projectTitle={projectDetails.title}
      accountLabel={accountLabel}
      localAccount={localAccount}
      onSignOut={onSignOut ? signOutSafely : undefined}
      onOpenProfile={()=>{exploration.pause();setExplorationRequested(false);onOpenProfile();}}
      canOpenStudio
      onTabChange={() => {setDrawer(null);nextStage("studio");}}
      onNewProject={async () => {try {await local.flush();if(active.current) onCreateNew();} catch {setNotice("Não foi possível preservar o projeto antes de sair.");}}}
      onNavigate={async value => {
        if(value !== "projects") return nextStage(value);
        try {await local.flush();if(active.current) onBack();}
        catch {setNotice("Não foi possível preservar o projeto antes de sair.");}
      }}
      onReview={() => nextStage("review")}
      guided
      sidebar={!preparing?<StudioNavigation projectTitle={projectDetails.title} onRenameProject={renameProject} actions={[
        {id:'posts',label:'Posts do projeto',disabled:creatingPost||deletingPost,onClick:showPosts,current:!currentSettings&&s.workflow.view==='posts'&&stage==='studio'},
        {id:'project',label:'Configurações do projeto',disabled:creatingPost||deletingPost,onClick:()=>setSettings('context')},
        ...(intro&&draft?[{id:'post' as const,label:'Configurações do Post',onClick:()=>setPostSettingsOpen(true)}]:[]),
        {id:'delete',label:'Excluir projeto',disabled:creatingPost||deletingPost||saving||Boolean(pendingTurn)||exploration.phase==='generating'||referenceTransition||!project.revision,onClick:()=>{exploration.pause();setExplorationRequested(false);onRequestDelete();}},
      ]}/>:undefined}
      projectId={project.id}
      projects={projects}
      onOpenProject={async target => {
        try { await local.flush(); if(active.current) onOpenProject(target); }
        catch { setNotice("Não foi possível preservar este projeto antes de trocar."); }
      }}
      canvas={canvas}
      overlays={
        <>
          {accountOverlays}
          <div hidden>{renderChat('references',false,false,true)}</div>
          {postDeleteTarget&&<StudioDialog title="Excluir post?" onClose={()=>{if(!deletingPost)setPostDeleteTarget(null);}}><p>Excluir “{postDeleteTarget.name}” da lista de posts deste projeto?</p><p>As imagens e o histórico já registrados são preservados.</p>{postDeleteError&&<p role="alert">{postDeleteError}</p>}<div className="guided-actions"><button type="button" className="studio-button-secondary" disabled={deletingPost} onClick={()=>setPostDeleteTarget(null)}>Cancelar</button><button type="button" className="studio-button" disabled={deletingPost} onClick={()=>{void confirmPostDeletion();}}>{deletingPost?'Excluindo…':'Excluir post'}</button></div></StudioDialog>}
          {currentSettings&&currentSettings!=='references'&&<StudioDialog title="Configurações do projeto" className="studio-modal-framed" closeLabel="Fechar configurações" onClose={closeSettings}><nav className="guided-settings-tabs" aria-label="Configurações">{settingsSections.map(([tab,label])=><button type="button" className="studio-button-secondary" key={tab} aria-pressed={currentSettings===tab} onClick={()=>{void(async()=>{setDrawer(null);if(tab==='references')setReferenceScope('references');setSettings(tab);})();}}>{label}</button>)}</nav>{currentSettings==='context'?<><p>Ideia inicial: {idea||'Ainda não informada'}</p><ContextStrip state={s} onBrief={patch=>local.change(value=>updateBrief(value,patch))} onFacts={facts=>local.change(value=>updateOfferFacts(value,facts))}/></>:currentSettings==='ai'?aiPanel:currentSettings==='direction'?directionPanel:currentSettings==='materials'?basesPanel:<><p>Histórico preservado da versão anterior. Novos pedidos são feitos na conversa de cada post.</p><div className="guided-reference-chat">{renderChat(undefined,false,true)}</div></>}</StudioDialog>}
          {postSettingsOpen&&draft&&<StudioDialog title="Configurações do Post" closeLabel="Fechar configurações do post" onClose={()=>setPostSettingsOpen(false)}><PostSettings value={postContext(s,draft.pieceId)} legacyAction={s.brief.action} onChange={patch=>local.change(value=>updatePostContext(value,draft.pieceId,patch))}/>{s.posts[draft.pieceId]?.direction.criteria.length>0&&<StudioDirection direction={s.posts[draft.pieceId].direction} references={references.filter(reference=>effectiveReferences(s,draft.pieceId).some(item=>item.id===reference.id))} onPropose={criterion=>local.change(value=>addPostCriterion(value,draft.pieceId,criterion))} onDecide={decision=>local.change(value=>decidePostCriterion(value,draft.pieceId,decision))}/>}</StudioDialog>}
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

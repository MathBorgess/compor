"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import StudioShell, { StudioPanel, type StudioStage, type StudioDrawer } from "./studio-shell";
import {useProjectNameDisclosure} from "./project-name-tooltip";
import PersonaStep from "./persona-step";
import StudioDirection from "./studio-direction";
import StudioEditor from "./studio-editor";
import StudioReview from "./studio-review";
import VariantCards from "./studio-variant-cards";
import { useStudioState } from "./use-studio-state";
import {PreparationSteps,ProjectQuestions,ProjectAI,ProjectPosts,GuidedWorkspace,GuidedArtPreview} from './studio-guided';
import {ReviewDisclosureBadge} from './image-review-disclosure';
import {updateWorkflow,conversationMessages,postIds,removePostFromList,prepareReferenceWorkspace} from '../lib/studio-workflow';
import {createStudioJourneyController,type SaveDraftInput} from '../lib/studio-journey-controller';
import StudioNavigation from './studio-navigation';
import {postMutationSchema,postNameSchema,type PostRecord} from '../lib/post-catalog';
import PostSettings from './studio-post-settings';
import ReferencePanel from './studio-reference-panel';
import {addPostCriterion,decidePostCriterion,freezeCreationContext,conversationContext,effectiveReferences,postContext,postFormatOf,postTargetFrameCountOf,updatePostContext,selectScopedReference} from '../lib/studio-post-context';
import {postFormatOption} from '../lib/studio-post-formats';
import ContextStrip from "./context-strip";
import ReferenceExploration from "./reference-exploration";
import type { ExploredReference } from "../lib/reference-exploration-contract";
import { recordReferenceSelection } from "../lib/reference-selection";
import { StudioStorageError } from '../lib/studio-storage.ts';
import {readSavedFrameImage,prepareSavedFrameImages,publishSavedFrameImage} from '../lib/piece-version-frame-assets';
import {carouselArtId,carouselCompositionNotice,carouselPreviewId,carouselPlanFor,composeCarousel} from '../lib/studio-carousel-client';
import {sha256Hex} from '../lib/browser-bytes.ts';
import {samePieceContent,setDraftCarouselArt,setDraftCarouselRender} from '../lib/studio-state.ts';
import {bindVersionImage, lookupVersionImage, publishVersionPng, readVersionImage} from '../lib/piece-version-image.ts';
import {fetchPrivateImage} from '../lib/private-image-fetch.ts';
import {composeStudioPng} from '../lib/studio-compose.ts';
import {studioImageDimensions} from '../lib/studio-image.ts';
import {createReferenceSelectionCoordinator,type ReferenceAdoptionReview} from '../lib/reference-selection-coordinator.ts';
import {assertReferenceVisualCapability,createReferenceVisualAuthority,type VisualAuthorityScope} from '../lib/reference-visual-authority.ts';
import type {VisualInputManifest} from '@compor/agents-api/visual-input-contract';
import type { ApprovedReference } from "../lib/web-contracts";
import ExplorationGallery from "./exploration-gallery";
import ReferenceSelectionTray from "./reference-selection-tray";
import { useExplorationLoop } from "./use-exploration-loop";
import {useParallelExploration} from './use-parallel-exploration';
import {releaseObjectUrl} from './release-object-url.ts';
import {parallelExplorationContext} from '../lib/parallel-exploration-context';
import {ParallelExplorationProgress} from './parallel-exploration-progress';
import ParallelExplorationRecovery from './parallel-exploration-recovery';
import type { CredentialSource } from "./use-ai-credentials";
import { selectedExplorationKey } from "../lib/exploration-batch";
import {confirmedExploration,recordCompletedExploration,prepareExplorationDraft} from "../lib/exploration-draft";
import { recordVisualFeedback,recordGeneratedComment } from "../lib/studio-visual-feedback";
import { recordReferenceRound } from "../lib/studio-reference-round";
import { referenceDiscoverySubject, studioProjectIdea } from "../lib/studio-project-idea";
import {
  updateBrief,
  updateBrandVoice,
  setPostFormat,
  setDraftFrames,
  updateDraftFrame,
  reorderDraftFrames,
  updatePersona,
  updateOfferFacts,
  addCreativeCriterion,
  recordCreativeDecision,
  createPost,
  changeStudioState,
  selectDraft,
  getCurrentDraft,
  setCreativeField,
  removeCreativeField,
  addMark,
  removeMark,
  approveDraft,
  recordActionReceipt,
  resolveProjectTitle,
  STUDIO_LIMITS,
} from "../lib/studio-state.ts";
import { createStudioTools, type StudioModelContext } from "../lib/studio-tools.ts";
import StudioChat, { type InitialPostRequest } from "./studio-chat";
import StudioDialog from "./studio-dialog";
import StudioLoading from "./studio-loading";
import { rootRoute, useStudioRoute, type StudioRoute } from "../lib/studio-route";
import StudioProfile from "./studio-profile";
import StudioAssets from "./studio-assets";

import * as z from '../lib/schema.ts';
import { projectsSchema, projectResponseSchema, type Project, type PieceVersion, type ImageSelection } from './studio-ui-types';
import { versionsSchema, versionSchema } from '../lib/studio-piece-contract';
import type { StudioState, StudioReference, ActionResult, PieceFrame, PieceContent, StudioDraft } from '../lib/studio-domain';
import type { ActionInputByName, StudioActionName, StudioAction } from '@compor/agents-api/studio-chat-tools';
declare global { interface Document { readonly modelContext?: StudioModelContext } }
type StudioHandlers = {[Name in StudioActionName]:(input:ActionInputByName[Name], context?:{signal?:AbortSignal;conversationId?:string})=>Promise<ActionResult>};
const carouselSaveHint='Componha as lâminas na revisão antes de salvar esta versão.';
type StudioAppProps={userId:string;hasApiKey:boolean;canUseAI?:boolean;credentialSource?:CredentialSource;credentialEpoch?:number;defaultAvailable?:boolean;parallelAvailable?:boolean;selectedVisualsAvailable?:boolean;selectedVisualsRequired?:boolean;referenceAuthorityEnabled?:boolean;carouselRenderAvailable?:boolean;onUseAI?:()=>void;onPauseAI?:()=>void;getApiKey:()=>string;keyInput:ReactNode;onRemoveKey:()=>void;initialObjective:string;recoveryBanner?:ReactNode;isAuthenticated:()=>boolean;awaitConfirmedIdentity?:()=>Promise<boolean>;developerMode?:boolean;accountLabel?:string;localAccount?:boolean;onSignOut?:()=>void|Promise<void>};
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
function ResumeProjectTitle({title}:{title:string}) {
  const name=useProjectNameDisclosure(title);
  return <><h2 {...name.handlers()} id="resume-title" title={title}>{title}</h2>{name.tooltip}</>;
}
function ProjectListCard({project,disabled,deleteDisabled,onOpen,onDelete}:{project:Project;disabled:boolean;deleteDisabled:boolean;onOpen:()=>void;onDelete:()=>void}) {
  const name=useProjectNameDisclosure(project.title);
  return <div className="studio-project-entry">
    <button {...name.handlers()} className="studio-project-card" title={project.title} disabled={disabled} onClick={event=>{if(name.holdActivation(event.detail))return;onOpen();}}><strong id={`project-title-${project.id}`} className="studio-truncate">{project.title}</strong><span>Abrir projeto</span></button>
    {name.tooltip}
    <button type="button" className="studio-project-delete" title="Excluir projeto" aria-label="Excluir projeto" aria-describedby={`project-title-${project.id}`} disabled={deleteDisabled} onClick={onDelete}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button>
  </div>;
}
const settingsSections=[['context','Contexto'],['ai','IA'],['references','Referências'],['direction','Marca e direção'],['materials','Materiais e versões'],['history','Histórico anterior']] as const;

export default function StudioApp({
  userId,
  hasApiKey,
  canUseAI = hasApiKey,
  credentialSource = "byok",
  credentialEpoch = 0,
  defaultAvailable = false,
  parallelAvailable = false,
  selectedVisualsAvailable = false,
  selectedVisualsRequired = false,
  referenceAuthorityEnabled = false,
  carouselRenderAvailable = false,
  onUseAI,
  onPauseAI,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  recoveryBanner,
  isAuthenticated,
  awaitConfirmedIdentity,
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
      const response = await fetch("/api/projects", { cache: "no-store", signal: AbortSignal.timeout(15000) });
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
      const result=z.discriminatedUnion('status',[
        z.strictObject({status:z.literal('deleted'),projectId:z.string()}),
        z.strictObject({status:z.literal('pending')}),
      ]).safeParse(await response.json());
      if(n!==seq.current||!isAuthenticated())return;
      if(response.status===409&&result.success&&result.data.status==='pending'){
        setDeleteError('Conclua ou verifique o pedido pendente antes de excluir este projeto.');
        return;
      }
      if(!response.ok||!result.success||result.data.status!=='deleted'||result.data.projectId!==target.id)throw Error('unconfirmed');
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
        awaitConfirmedIdentity={awaitConfirmedIdentity}
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
        parallelAvailable={parallelAvailable}
        selectedVisualsAvailable={selectedVisualsAvailable}
        selectedVisualsRequired={selectedVisualsRequired}
        referenceAuthorityEnabled={referenceAuthorityEnabled}
        carouselRenderAvailable={carouselRenderAvailable}
        onUseAI={onUseAI}
        onPauseAI={onPauseAI}
        getApiKey={getApiKey}
        keyInput={keyInput}
        onRemoveKey={onRemoveKey}
        initialObjective=""
        initialPrepare={createdProjectId===selected.id}
      />
    );
  if (!route || (route.projectId && state !== "error"))
    return <StudioLoading>Abrindo seu espaço de criação…</StudioLoading>;
  return (
    <StudioShell
      stage="projects"
      onOpenProfile={()=>{void openProfile();}}
      overlays={accountOverlays}
      accountLabel={accountLabel}
      localAccount={localAccount}
      onSignOut={onSignOut}
      onNewProject={hasProjects ? () =>
        document.getElementById("studio-project-name")?.focus()
      : undefined}
    >
      {recoveryBanner}

      <div className="studio-home" data-empty={hasProjects?undefined:'true'}>
      {resume&&<section className="studio-home-resume" aria-labelledby="resume-title">
        <div className="studio-home-resume-art" aria-hidden="true"><span/><span/><span/></div>
        <div className="studio-home-resume-body">
          <p className="studio-home-eyebrow">{resume.opened?'Aberto por último':'Mais recente'}</p>
          <ResumeProjectTitle title={resume.project.title}/>
          {resume.created&&<p className="studio-home-meta">Criado em {resume.created}</p>}
          <button type="button" className="studio-button" disabled={state==='deleting'} onClick={() => openProject(resume.project)}>Continuar projeto</button>
        </div>
      </section>}
      <section className="studio-recent-projects" aria-label="Conversas e projetos anteriores">
        <h2>{hasProjects?'Todos os projetos':'Seus projetos'}</h2>
        {state === "loading" && <p role="status">Carregando seus projetos…</p>}{state === "ready" && projects.length===0 && <p>Seus projetos aparecerão aqui. Comece com uma ideia acima.</p>}
        <div className="studio-project-grid">
          {projects.map(project => <ProjectListCard key={project.id} project={project} disabled={state==='deleting'} deleteDisabled={state!=='ready'||!project.revision} onOpen={() => openProject(project)} onDelete={() => {void requestDeletion(project);}} />)}
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
  parallelAvailable = false,
  selectedVisualsAvailable = false,
  selectedVisualsRequired = false,
  referenceAuthorityEnabled = false,
  carouselRenderAvailable = false,
  onUseAI,
  onPauseAI,
  getApiKey,
  keyInput,
  onRemoveKey,
  initialObjective,
  initialPrepare,
  isAuthenticated,
  awaitConfirmedIdentity,
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
  const [serialInspection,setSerialInspection]=useState<{scope:string;message:string}|null>(null);
  const currentReferenceScope=useRef(referenceScope);currentReferenceScope.current=referenceScope;
  const [referencesModalKind,setReferencesModalKind]=useState<'project'|'post'|null>(null);
  const [chatMinimized,setChatMinimized]=useState(false);
  const [referenceWaits,setReferenceWaits]=useState<Record<string,boolean>>({});
  const reportReferenceWait=useCallback((conversationId:string,waiting:boolean)=>setReferenceWaits(current=>current[conversationId]===waiting?current:{...current,[conversationId]:waiting}),[]);
  const [referenceChatTarget,setReferenceChatTarget]=useState<HTMLDivElement|null>(null);
  const [postSettingsOpen,setPostSettingsOpen]=useState(false);
  const [postRecords,setPostRecords]=useState<PostRecord[]>([]);
  const postRecordsRef=useRef<PostRecord[]>([]);postRecordsRef.current=postRecords;
  const [creatingPost,setCreatingPost]=useState(false),[deletingPost,setDeletingPost]=useState(false);
  const [initialPostRequest,setInitialPostRequest]=useState<InitialPostRequest|null>(null);
  const [postDeleteTarget,setPostDeleteTarget]=useState<{pieceId:string;name:string}|null>(null),[postDeleteError,setPostDeleteError]=useState('');
  const [explorationRequested,setExplorationRequested]=useState(false);
  const [recoveredCompletions,setRecoveredCompletions]=useState(0);
  const [proposalCheck,setProposalCheck]=useState<number|null>(null);
  const [parallelGesture,setParallelGesture]=useState<{source:CredentialSource;epoch:number;scope:string}|null>(null);
  const previousParallelAvailable=useRef(parallelAvailable);
  const [referenceTransition,setReferenceTransition]=useState(false);
  const referenceTransitionLock=useRef(false);
  const [referenceUploading,setReferenceUploading]=useState(false);
  const [referenceUploadFeedback,setReferenceUploadFeedback]=useState<{scope:string;message:string}|null>(null);
  const referenceUploadLock=useRef(false);
  const [visitedPosts,setVisitedPosts]=useState<string[]>([]);
  const projectAIChosen=Boolean(s&&s.workflow.aiPreference!=='none'&&s.workflow.aiPreference===credentialSource);
  const canUseProjectAI=canUseAI&&projectAIChosen;
  const visualUnavailable=selectedVisualsRequired&&!selectedVisualsAvailable;
  const hasApiKey = credentialActive && projectAIChosen && (credentialSource !== "default" || projectIntent);
  const credentialSeen = useRef(credentialEpoch);
  const [stageRestored, setStageRestored] = useState(false);
  const [stage, setStage] = useState<StudioStage>("studio"),
    [versionsLoaded, setVersionsLoaded] = useState(false),
    [versions, setVersions] = useState<PieceVersion[]>([]),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [base, setBase] = useState<Blob|null>(null),
    [previewVersions, setPreviewVersions] = useState<Record<string,boolean>>({}),
    [activeFrameId, setActiveFrameId] = useState<string|null>(null),
    [frameBlobs, setFrameBlobs] = useState<Record<string,Blob>>({}),
    [chatPromptRequest, setChatPromptRequest] = useState<{conversationId:string;text:string;nonce:number}|null>(null),
    [referenceImages, setReferenceImages] = useState<{manifest:string;generation:number;items:(StudioReference & {url:string})[]}|null>(null),
    [proposal, setProposal] = useState<{prompt:string}|null>(null),
    [dialog, setDialog] = useState<Confirmation|null>(null),
    [projectDetails, setProjectDetails] = useState(project),
    [drawer, setDrawer] = useState<StudioDrawer>(null),
    [viewingArt, setViewingArt] = useState(false),
    [panelRequest, setPanelRequest] = useState<{id:string;nonce:number}|null>(null);
  const carouselRequest=useRef<AbortController|null>(null);
  const carouselArtBusy=useRef(false);
  const [uploadingCarouselArt,setUploadingCarouselArt]=useState(false);
  const [composingCarousel,setComposingCarousel]=useState(false);
  const versionBusy=saving||composingCarousel||uploadingCarouselArt;
  const [loadedCarousel,setLoadedCarousel]=useState<string|null>(null);
  const referenceManifest = s ? JSON.stringify({userId, projectId:project.id, references:s.references}) : null;
  const references = referenceImages?.manifest === referenceManifest ? referenceImages.items : [];
  const referenceUrls=useRef(new Map<string,number>()),referenceUrlGeneration=useRef(0),referenceUrlCleanup=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    if(referenceUrlCleanup.current!==null){clearTimeout(referenceUrlCleanup.current);referenceUrlCleanup.current=null;}
    return()=>{referenceUrlCleanup.current=setTimeout(()=>{for(const url of referenceUrls.current.keys())releaseObjectUrl(url);referenceUrls.current.clear();},0);};
  },[]);
  useEffect(()=>{if(!referenceImages)return;for(const [url,generation] of referenceUrls.current){if(generation<referenceImages.generation){releaseObjectUrl(url);referenceUrls.current.delete(url);}}},[referenceImages]);
  const stateRef = useRef<StudioState|null>(null),
    versionRef = useRef<PieceVersion[]>([]),
    toolsRef = useRef<ReturnType<typeof createStudioTools>|null>(null),
    confirmResolver = useRef<((value:boolean)=>void)|null>(null),
    active = useRef(true),
    saveLock = useRef(false),
    creationLock = useRef(false),
    baseLoadGeneration=useRef(0),
    versionsReadSequence=useRef(0),
    proposalRequest=useRef({scope:'',sequence:0,pending:false});
  const isStudioActive=()=>active.current&&isAuthenticated();
  const authenticatedFetch:typeof fetch=(input,init)=>isStudioActive()
    ? fetch(input,init) : Promise.reject(Error('studio_scope_changed'));
  const [authorityStatus,setAuthorityStatus]=useState<'checking'|'ready'|'pending'|'conflict'|'unavailable'>('checking');
  const [authorityReview,setAuthorityReview]=useState<ReferenceAdoptionReview|null>(null);
  const authorityCurrent=useRef<'checking'|'ready'|'pending'|'conflict'|'unavailable'>('checking'),authorityLock=useRef(false);
  function reportAuthority(status:typeof authorityCurrent.current){authorityCurrent.current=status;if(active.current)setAuthorityStatus(status);}
  useEffect(()=>{
    if(!referenceAuthorityEnabled){reportAuthority('ready');return;}
    if(session.loading)return;
    let live=true;reportAuthority('checking');
    void (async()=>{try{await session.ensureStored();const store=session.storage.current;if(!store)throw Error('storage');const coordinator=createReferenceSelectionCoordinator({store});let result=await coordinator.readiness({userId,projectId:project.id});if(result.status==='ready'||result.status==='unavailable')result=await coordinator.observe({userId,projectId:project.id});if(live)reportAuthority(result.status);}catch{if(live)reportAuthority('unavailable');}})();
    return()=>{live=false;};
  },[referenceAuthorityEnabled,session.loading,userId,project.id]);
  async function checkReferenceAuthority(){
    if(!referenceAuthorityEnabled)return true;
    if(authorityLock.current||authorityCurrent.current!=='ready'||!active.current||!isAuthenticated())return false;
    try{await session.flush();const store=session.storage.current;if(!store)throw Error('storage');const result=await createReferenceSelectionCoordinator({store}).readiness({userId,projectId:project.id});if(!active.current||authorityLock.current||!isAuthenticated())return false;reportAuthority(result.status);return result.status==='ready';}catch{reportAuthority('unavailable');return false;}
  }
  function visualAuthority(scope:VisualAuthorityScope){
    return createReferenceVisualAuthority({isCurrent:()=>active.current&&isAuthenticated()&&scope.userId===userId&&scope.projectId===project.id&&session.get()?.userId===userId&&session.get()?.projectId===project.id});
  }
  async function createVisualAuthoritySnapshot(scope:VisualAuthorityScope,manifest:VisualInputManifest){
    if(!await checkReferenceAuthority())throw Error('Consulte a seleção de referências antes de continuar.');
    const store=session.storage.current;if(!store)throw Error('reference_authority_unavailable');
    const status=await createReferenceSelectionCoordinator({store}).readiness({userId,projectId:project.id});
    if(status.status!=='ready'||authorityLock.current)throw Error('reference_authority_unavailable');
    try{await visualAuthority(scope).create(scope,manifest,status.revision);}catch(error){if(error instanceof Error&&error.message==='reference_authority_conflict')reportAuthority('conflict');throw error;}
  }
  async function visualAuthorityHeaders(scope:VisualAuthorityScope,manifest:VisualInputManifest){if(!await checkReferenceAuthority())throw Error('reference_authority_unavailable');const headers=await visualAuthority(scope).headers(scope,manifest);if(!await checkReferenceAuthority())throw Error('reference_authority_unavailable');assertReferenceVisualCapability(userId,manifest,headers);return headers;}
  async function coordinateSelection(selection:{kind:'select';reference:StudioReference;target:string}|{kind:'unselect';id:string;target:string}){
    if(!referenceAuthorityEnabled){const result=selection.kind==='select'?journey.selectReference(selection.reference,selection.target):journey.unselectReference(selection.id,selection.target);if(!result)throw Error('studio_unavailable');await session.flush();return;}
    if(authorityLock.current||authorityCurrent.current!=='ready'||!isAuthenticated())throw Error('reference_authority_unavailable');
    authorityLock.current=true;reportAuthority('pending');
    let completed=false;
    try{const result=await session.coordinateReference(selection,()=>active.current&&isAuthenticated());completed=true;reportAuthority(result.status);if(result.status!=='ready')throw Error('reference_authority_unconfirmed');}
    catch(error){if(!completed)reportAuthority('unavailable');throw error;}
    finally{authorityLock.current=false;}
  }
  async function inspectAuthority(){
    if(authorityLock.current)return;
    authorityLock.current=true;reportAuthority('checking');
    try{
      await session.ensureStored();
      const store=session.storage.current;
      if(!store||!active.current||!isAuthenticated())throw Error('reference_authority_unavailable');
      const coordinator=createReferenceSelectionCoordinator({store});
      const scope={userId,projectId:project.id};
      let result=await coordinator.reconcile(scope);
      if(result.status==='ready'||result.status==='unavailable')result=await coordinator.observe(scope);
      reportAuthority(result.status);
    }catch{reportAuthority('unavailable');}finally{authorityLock.current=false;}
  }
  async function fenceAuthorityPending(){
    if(authorityLock.current)return;authorityLock.current=true;
    try{const store=session.storage.current;if(!store)throw Error();const result=await createReferenceSelectionCoordinator({store}).fencePending({userId,projectId:project.id});reportAuthority(result.status);}catch{reportAuthority('unavailable');}finally{authorityLock.current=false;}
  }
  async function previewAuthorityAdoption(){
    if(authorityLock.current)return;authorityLock.current=true;
    try{await session.flush();const store=session.storage.current;if(!store)throw Error();const result=await createReferenceSelectionCoordinator({store}).previewAdoption({userId,projectId:project.id});if(result.status==='review')setAuthorityReview(result.review);else reportAuthority(result.status);}catch{reportAuthority('unavailable');}finally{authorityLock.current=false;}
  }
  async function confirmAuthorityAdoption(){
    if(authorityLock.current||!authorityReview)return;authorityLock.current=true;reportAuthority('pending');
    try{await session.flush();const store=session.storage.current;if(!store)throw Error();const result=await createReferenceSelectionCoordinator({store}).adoptCurrent({userId,projectId:project.id},authorityReview);setAuthorityReview(null);reportAuthority(result.status);}catch{reportAuthority('unavailable');}finally{authorityLock.current=false;}
  }
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
  // ADR 0059: a aba Referências das configurações e "Escolher mais referências" abrem a bancada em janela modal.
  const referencesModal=referencesModalKind!==null&&currentSettings==='references'&&s?.workflow.phase!=='references';
  useEffect(()=>{if(draft)setVisitedPosts(ids=>ids.includes(draft.pieceId)?ids:[...ids,draft.pieceId]);},[draft?.pieceId]);
  useEffect(()=>{if(!referencesOpen){setExplorationRequested(false);}},[referencesOpen]);
  const idea = studioProjectIdea(s,initialObjective);
  async function onExplorationCompleted(imageId:string,ordinal:number,conversationId:string,creationContext?:StudioState['drafts'][number]['creationContext']){
    if(!active.current||!isAuthenticated())throw Error("studio_unavailable");
    const state=local.get();
    if(state.workflow.latestExplorations?.[conversationId]?.imageId!==imageId){
      const candidate=await confirmedExploration(project.id,imageId);
      if(!active.current||!isAuthenticated())throw Error("studio_unavailable");
      local.change(value=>recordCompletedExploration(value,conversationId,{...candidate,...(creationContext?{creationContext}:{})}));
    }
    await local.flush();
  }
  const parallel=useParallelExploration({userId,projectId:project.id,conversationId:referenceScope,state:s?conversationContext(s,referenceScope):null,getState:()=>{const value=session.get();return value?conversationContext(value,referenceScope):null;},source:credentialSource,credentialEpoch,hasApiKey,getApiKey,isAuthenticated,available:parallelAvailable&&!visualUnavailable&&(!referenceAuthorityEnabled||authorityStatus==='ready'),selectedVisualsAvailable,selectedVisualsRequired,...(referenceAuthorityEnabled?{checkReferenceAuthority,createVisualAuthoritySnapshot,visualAuthorityHeaders}:{}),loadReference:id=>local.storage.current?.getReference({userId,projectId:project.id},id)??Promise.resolve(null),visible:stageRestored&&(stage==='studio'||currentSettings==='references')&&referencesOpen,idea:referenceScope==='references'?idea:s?postContext(s,referenceScope).message||idea:idea,onCompleted:onExplorationCompleted});
  const usingParallel=parallelAvailable&&!parallel.legacyPending;
  const proposalScope=JSON.stringify([userId,project.id,credentialSource,credentialEpoch,referenceScope,referencesOpen,usingParallel,selectedVisualsAvailable,selectedVisualsRequired]);
  if(proposalRequest.current.scope!==proposalScope)proposalRequest.current={scope:proposalScope,sequence:proposalRequest.current.sequence+1,pending:false};
  const legacyExploration = useExplorationLoop({ userId, projectId: project.id, state: s?conversationContext(s,referenceScope):null, getState: ()=>{const value=session.get();return value?conversationContext(value,referenceScope):null;}, conversationId:referenceScope, hasApiKey, canUseAI:canUseProjectAI, getApiKey, credentialSource, credentialEpoch, isAuthenticated, idea:referenceScope==='references'?idea:s?postContext(s,referenceScope).message||idea:idea, enabled: !referenceAuthorityEnabled && !selectedVisualsRequired && !usingParallel && !(previousParallelAvailable.current&&!parallelAvailable) && stageRestored && (stage === "studio" || currentSettings === "references") && referencesOpen && explorationRequested, onCompleted:onExplorationCompleted });
  useEffect(()=>{if(previousParallelAvailable.current&&!parallelAvailable){setParallelGesture(null);setExplorationRequested(false);parallel.pause();}previousParallelAvailable.current=parallelAvailable;},[parallelAvailable]);
  useEffect(()=>{if(!parallelAvailable||!parallel.legacyPending||!legacyExploration.blocked)return;try{if(localStorage.getItem(`compor-exploration-pending:${userId}`)===null){parallel.clearLegacyPending();setExplorationRequested(false);}}catch{/* Preserve the legacy guard when storage is unavailable. */}},[parallelAvailable,parallel.legacyPending,legacyExploration.blocked,userId]);
  const exploration=usingParallel?{...parallel,blocked:parallel.phase==='blocked',parallelBlocked:false,awaitingAnswer:explorationRequested?false:legacyExploration.awaitingAnswer,resuming:false,resumeError:null,progress:null,resume:parallel.start}:legacyExploration;
  const pendingTurn=s?.adjustments.find(item=>!['completed','failed'].includes(item.status));
  const checkingProposal=proposalCheck===proposalRequest.current.sequence;
  const proposalsRunning=explorationRequested&&exploration.running&&!exploration.paused&&!exploration.blocked&&(usingParallel||!exploration.awaitingFeedback);
  const proposalsLocked=referencesOpen&&(checkingProposal||parallelGesture!==null||proposalsRunning&&exploration.phase!=='waiting');
  const parallelStart=useRef(parallel.start);parallelStart.current=parallel.start;
  useEffect(()=>{
    const gesture=parallelGesture;
    if(!gesture)return;
    if(!usingParallel||!referencesOpen||gesture.source!==credentialSource||gesture.epoch!==credentialEpoch||gesture.scope!==referenceScope){setParallelGesture(null);return;}
    if(hasApiKey&&explorationRequested&&parallel.epochReady){setParallelGesture(null);void parallelStart.current();}
  },[parallelGesture,usingParallel,referencesOpen,credentialSource,credentialEpoch,referenceScope,hasApiKey,explorationRequested,parallel.epochReady]);
  function requestProposals(){
    if(proposalsLocked||pendingTurn||usingParallel&&parallel.running)return;
    if(visualUnavailable){setNotice('O envio das imagens selecionadas está indisponível. Você pode continuar editando e consultar tentativas anteriores.');return;}
    if(selectedVisualsRequired&&!usingParallel){setNotice('A exploração com imagens selecionadas está indisponível. Consulte tentativas anteriores ou continue editando.');return;}
    if(proposalRequest.current.pending||!referencesOpen||!active.current||!isAuthenticated()||document.visibilityState!=='visible'||!document.hasFocus())return;
    const sequence=proposalRequest.current.sequence;proposalRequest.current.pending=true;
    setProposalCheck(sequence);
    const valid=()=>proposalRequest.current.sequence===sequence&&active.current&&isAuthenticated()&&document.visibilityState==='visible'&&document.hasFocus();
    void (async()=>{try{const allowed=await checkReferenceAuthority();if(!valid())return;if(!allowed){setNotice('Consulte a seleção de referências antes de pedir novas propostas.');return;}if(usingParallel)setParallelGesture({source:credentialSource,epoch:credentialEpoch,scope:referenceScope});activateAI();setExplorationRequested(true);if(!usingParallel)void exploration.resume();}finally{if(proposalRequest.current.sequence===sequence){proposalRequest.current.pending=false;setProposalCheck(null);}}})();
  }
  async function inspectLegacyExploration(){
    const scope=referenceScope;setSerialInspection({scope,message:'Consultando tentativa anterior…'});
    try{
      const {inspectSerialPending}=await import('../lib/exploration-pending.ts');
      const result=await inspectSerialPending({storage:localStorage,userId,projectId:project.id,conversationId:scope});
      if(active.current&&currentReferenceScope.current===scope)setSerialInspection({scope,message:result});
    }catch{if(active.current&&currentReferenceScope.current===scope)setSerialInspection({scope,message:'Não foi possível consultar a tentativa anterior. O recibo permanece preservado.'});}
  }
  async function getReplacementReferences(){
    const scope=referenceScope,value=session.get();if(!value)throw Error('context_unavailable');
    const selected=conversationContext(value,scope).references.filter(reference=>reference.source!==undefined);
    const storage=local.storage.current;if(!storage)throw Error('visual_storage_unavailable');
    const references=await Promise.all(selected.map(async reference=>{
      const stored=await storage.getReference({userId,projectId:project.id},reference.id);
      if(!stored||JSON.stringify(stored.metadata)!==JSON.stringify(reference))throw Error('visual_reference_changed');
      return stored;
    }));
    if(!active.current||currentReferenceScope.current!==scope||!isAuthenticated())throw Error('visual_context_changed');
    return references;
  }
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
    let live = true,published=false;
    const urls:string[] = [];
    const generation=++referenceUrlGeneration.current;
    const storage=local.storage.current;
    Promise.all(
      s.references.map(async (ref) => {
        const value = await storage.getReference(
          { userId, projectId: project.id },
          ref.id,
        );
        if (!value || !live) return null;
        const url = URL.createObjectURL(value.file);
        urls.push(url);referenceUrls.current.set(url,generation);
        return { ...ref, url };
      }),
    )
      .then((items) => {
        if (live){published=true;setReferenceImages({manifest:referenceManifest,generation,items:items.filter((item): item is StudioReference & {url:string} => item !== null)});}
      })
      .catch(() => {
        if (live){live=false;urls.forEach(url=>{URL.revokeObjectURL(url);referenceUrls.current.delete(url);});
          setNotice(
            "Não foi possível recuperar as referências deste navegador.",
          );}
      });
    return () => {
      live = false;
      if(!published)urls.forEach(url=>{URL.revokeObjectURL(url);referenceUrls.current.delete(url);});
    };
  }, [referenceManifest, project.id, userId]);
  async function workingImage(pieceId:string, baseVersion:number) {
    const storage=local.storage.current;
    if(!storage)return null;
    const scope={userId, projectId:project.id};
    if(baseVersion>=1){
      const preview=await storage.getDraftAsset(scope,{pieceId, baseVersion, kind:'preview'});
      if(preview){
        if(active.current)setPreviewVersions(current=>current[`${pieceId}:${baseVersion}`]?current:{...current,[`${pieceId}:${baseVersion}`]:true});
        return preview.file;
      }
    }
    return (await storage.getDraftAsset(scope,{pieceId, baseVersion, kind:'base'}))?.file??null;
  }
  async function cacheSavedImage(pieceId:string, version:number, file:Blob, frameId?:string) {
    const storage=local.storage.current;
    if(!storage||version<1)return;
    try{await storage.putDraftAsset({userId, projectId:project.id, pieceId, baseVersion:version, kind:'base', frameId, file});}
    catch(error){if(!(error instanceof StudioStorageError)||error.code!=='studio_draft_asset_exists')throw error;}
  }
  async function canonicalImage(pieceId:string, version:number) {
    const assetId=await readVersionImage({projectId:project.id, pieceId, version});
    if(!assetId)return null;
    const blob=await fetchPrivateImage(new URLSearchParams({projectId:project.id, pieceId, version:String(version), assetId}));
    await cacheSavedImage(pieceId, version, blob);
    return blob;
  }
  async function workingFrameImage(pieceId:string, baseVersion:number, frame:PieceFrame, content?:PieceContent) {
    const storage=local.storage.current;
    if(!storage)return null;
    if(content?.carouselPlan){
      const panel=content.carouselRender?.frames.find(item=>item.frameId===frame.id);
      if(!panel)return null;
      const address={pieceId,baseVersion,kind:'preview' as const,frameId:await carouselPreviewId(frame.id,panel.sha256)};
      const scope={userId,projectId:project.id};
      const preview=await storage.getDraftAsset(scope,address);
      if(preview?.file.type==='image/jpeg' && await sha256Hex(await preview.file.arrayBuffer())===panel.sha256)return preview.file;
      if(baseVersion<1||!frame.assetId)return null;
      return readSavedFrameImage({projectId:project.id,pieceId,version:baseVersion,frameId:frame.id,assetId:frame.assetId,expectedSha256:panel.sha256});
    }
    const stored=await storage.getDraftAsset({userId,projectId:project.id}, {
      pieceId,baseVersion,kind:'base',frameId:frame.id,
    });
    if(stored)return stored.file;
    if(baseVersion<1||!frame.assetId)return null;
    const file=await readSavedFrameImage({projectId:project.id,pieceId,version:baseVersion,frameId:frame.id,assetId:frame.assetId});
    if(file)await cacheSavedImage(pieceId,baseVersion,file,frame.id).catch(()=>{});
    return file;
  }
  async function carouselArtAddress(pieceId:string,frameId:string,sha256:string) {
    return {pieceId,baseVersion:0,kind:'art-layer' as const,frameId:await carouselArtId(frameId,sha256)};
  }
  async function changeCarouselArt(source:StudioDraft,frameId:string,file?:File) {
    const storage=local.storage.current;
    if (!storage||carouselArtBusy.current||carouselRequest.current||saveLock.current)return;
    carouselArtBusy.current=true;
    setUploadingCarouselArt(true);
    const sameSource=()=>{
      if(!isStudioActive())return false;
      const selected=getCurrentDraft(local.get());
      return selected?.pieceId===source.pieceId&&selected.baseVersion===source.baseVersion&&
        selected.expectedLatestVersion===source.expectedLatestVersion&&samePieceContent(selected.content,source.content);
    };
    const showNotice=(message:string)=>{
      if(isStudioActive()&&local.get().selection?.pieceId===source.pieceId)setNotice(message);
    };
    try {
      if (!isAuthenticated()) await awaitConfirmedIdentity?.();
      if (!sameSource()) throw Error('studio_scope_changed');
      let artSha256:string|null=null;
      if (file) {
        if (!file.size||file.size>4*1024*1024)throw Error('carousel_art_too_large');
        artSha256=await sha256Hex(await file.arrayBuffer());
        const scope={userId,projectId:project.id};
        const address=await carouselArtAddress(source.pieceId,frameId,artSha256);
        if (!sameSource())throw Error('studio_scope_changed');
        try {
          await storage.putDraftAsset({...scope,...address,file,ifAbsent:true});
        } catch (error) {
          if (!(error instanceof StudioStorageError)||error.code!=='studio_draft_asset_exists')throw error;
          const known=await storage.getDraftAsset(scope,address);
          if (!known||await sha256Hex(await known.file.arrayBuffer())!==artSha256)throw error;
        }
      }
      if (!sameSource()||saveLock.current)throw Error('studio_scope_changed');
      local.change(value=>setDraftCarouselArt(value,{pieceId:source.pieceId,baseVersion:source.baseVersion,frameId,artSha256}));
      await local.flush();
      showNotice('');
    }catch {
      showNotice('Confira a seleção e escolha um PNG ou JPEG de até 4 MiB.');
    }finally{
      carouselArtBusy.current=false;
      if(active.current)setUploadingCarouselArt(false);
    }
  }
  async function requestCarouselComposition(source:StudioDraft) {
    const storage=local.storage.current;
    if(!carouselRenderAvailable||!storage||carouselRequest.current||carouselArtBusy.current||saveLock.current||!isStudioActive())return;
    const controller=new AbortController();
    const checkAccess=()=>{
      controller.signal.throwIfAborted();
      if(!isStudioActive())throw Error('studio_scope_changed');
    };
    carouselRequest.current=controller;
    setComposingCarousel(true);setNotice('');
    try{
      const plan=carouselPlanFor(source.content);
      if(!plan)throw Error('carousel_plan_invalid');
      const {receipt,images}=await composeCarousel(project.id,plan,controller.signal,async(frameId,sha256)=>{
        const address=await carouselArtAddress(source.pieceId,frameId,sha256);
        const art=await storage.getDraftAsset({userId,projectId:project.id},address);
        checkAccess();
        return art?.file??null;
      },authenticatedFetch);
      checkAccess();
      for(const image of images){
        const frameId=await carouselPreviewId(image.frameId,image.sha256);
        checkAccess();
        await storage.putDraftAsset({userId,projectId:project.id,pieceId:source.pieceId,baseVersion:source.baseVersion,
          kind:'preview',frameId,file:image.file});
      }
      checkAccess();
      local.change(value=>setDraftCarouselRender(value,source,receipt));
      await local.flush();
    }catch(error){
      if(isStudioActive()&&!controller.signal.aborted){
        setNotice(carouselCompositionNotice(error));
      }
    }finally{
      if(carouselRequest.current===controller)carouselRequest.current=null;
      if(active.current)setComposingCarousel(false);
    }
  }
  useEffect(()=>()=>carouselRequest.current?.abort(),[draft?.pieceId,draft?.baseVersion]);
  const receiptKey=draft?.content.carouselRender
    ? [draft.pieceId,draft.baseVersion,draft.content.carouselRender.planSha256,...draft.content.carouselRender.frames.map(frame=>frame.sha256)].join(':')
    : null;
  const visibleFrameBlobs=!draft?.content.carouselPlan || (receiptKey&&loadedCarousel===receiptKey) ? frameBlobs : {};
  const draftFrameIds = (draft?.content.frames ?? []).map(frame => frame.id).join(',');
  const draftFrameAssets = (draft?.content.frames ?? []).map(frame => frame.assetId ?? '').join(',');
  useEffect(() => {
    const frames = draft?.content.frames ?? [];
    if (!frames.length) {
      setActiveFrameId(null);
      setFrameBlobs({});
      return;
    }
    setActiveFrameId(current => current && frames.some(frame => frame.id === current) ? current : frames[0].id);
  }, [draft?.pieceId, draft?.baseVersion, draftFrameIds]);
  useEffect(() => {
    setBase(null);
    setFrameBlobs({});
    const loadGeneration=++baseLoadGeneration.current;
    if (!draft || !local.storage.current) return;
    let live = true;
    const pieceId=draft.pieceId, baseVersion=draft.baseVersion;
    if(!draft.content.carouselPlan) workingImage(pieceId, baseVersion)
      .then(async file=>{
        if(!live||loadGeneration!==baseLoadGeneration.current)return;
        if(file){setBase(file);return;}
        if(baseVersion<1)return;
        const remote=await canonicalImage(pieceId, baseVersion);
        if(live&&loadGeneration===baseLoadGeneration.current&&remote)setBase(remote);
      })
      .catch(() => {
        if (live&&loadGeneration===baseLoadGeneration.current)
          setNotice("Não foi possível recuperar a imagem desta versão.");
      });
    const frames = draft.content.frames ?? [];
    if (frames.length) {
      Promise.allSettled(frames.map(async frame => {
        const file=await workingFrameImage(pieceId,baseVersion,frame,draft.content);
        return {id:frame.id,file};
      })).then(entries => {
        if(!live)return;
        const map:Record<string,Blob>={};
        for(const entry of entries){
          if(entry.status==='fulfilled'&&entry.value.file)map[entry.value.id]=entry.value.file;
        }
        if(draft.content.carouselPlan){
          setFrameBlobs(map);
          setLoadedCarousel(receiptKey);
          const cover=frames.find(frame=>frame.position===1);
          if(cover)setBase(map[cover.id]??null);
        }else setFrameBlobs(current=>({...map,...current}));
        if(entries.some(entry=>entry.status==='rejected'))setNotice('Não foi possível verificar todas as lâminas desta versão.');
      });
    }
    return () => {
      live = false;
    };
  }, [draft?.pieceId, draft?.baseVersion, draftFrameIds, draftFrameAssets, draft?.content.carouselPlan!==undefined, receiptKey]);
  async function useBase({ blob, pieceId, version, frameId, assetId, creationContext }:ImageSelection) {
    baseLoadGeneration.current++;
    try {
      if(!local.storage.current)throw Error("Armazenamento indisponível.");
      const storage=local.storage.current;
      const scope={userId, projectId:project.id};
      if(local.get().drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===version)?.content.carouselPlan)
        throw Error('Use a composição do carrossel para criar as lâminas deste plano.');
      let shown=blob;
      if (frameId) {
        await storage.putDraftAsset({
          ...scope,
          pieceId,
          baseVersion: version,
          kind: "base",
          frameId,
          file: blob,
        });
        const targetDraft = local.get().drafts.find(item => item.pieceId === pieceId && item.baseVersion === version);
        const targetFrame = targetDraft?.content.frames?.find(item => item.id === frameId);
        if (targetFrame?.position === 1) {
          if (assetId && version >= 1) {
            const bound = await bindVersionImage({ projectId: project.id, pieceId, version, assetId });
            if (bound === 'unknown') throw Error('vínculo indisponível');
            if (bound === 'conflict') {
              const existing = await storage.getDraftAsset(scope, { pieceId, baseVersion: version, kind: 'base' });
              if (!existing) throw Error('imagem já vinculada');
              shown = existing.file;
            } else await cacheSavedImage(pieceId, version, blob);
          } else {
            await storage.putDraftAsset({ ...scope, pieceId, baseVersion: version, kind: version >= 1 ? 'preview' : 'base', file: blob });
            if(version>=1)setPreviewVersions(current=>({...current,[`${pieceId}:${version}`]:true}));
          }
        }
        if (targetDraft && targetFrame && assetId) {
          local.change(value => updateDraftFrame(value, { pieceId, baseVersion: version, frameId, patch: { assetId } }));
        }
      } else if(assetId&&version>=1){
        const bound=await bindVersionImage({projectId:project.id, pieceId, version, assetId});
        if(bound==='unknown')throw Error('vínculo indisponível');
        if(bound==='conflict'){
          const existing=await storage.getDraftAsset(scope,{pieceId, baseVersion:version, kind:'base'});
          if(!existing)throw Error('imagem já vinculada');
          shown=existing.file;
        }else await cacheSavedImage(pieceId, version, blob);
      }else{
        await storage.putDraftAsset({...scope, pieceId, baseVersion:version, kind:version>=1?'preview':'base', file:blob});
        if(version>=1)setPreviewVersions(current=>({...current,[`${pieceId}:${version}`]:true}));
      }
      if(local.get().drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===version)){
        local.change(value=>freezeCreationContext(value,pieceId,version,creationContext??{postContext:postContext(value,pieceId),references:[]}));
        await local.flush();
      }
      const current = getCurrentDraft(local.get());
      if (
        active.current &&
        current?.pieceId === pieceId &&
        current.baseVersion === version
      ) {
        if (frameId) {
          setFrameBlobs(prev => ({ ...prev, [frameId]: blob }));
          if (current.content.frames?.find(item => item.id === frameId)?.position === 1) setBase(shown);
        } else {
          setBase(shown);
        }
      }
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
  function setSettings(value:typeof settingsTab,modal:'project'|'post'|null=null){if(value==='references')setStage('studio');setReferencesModalKind(value==='references'?modal:null);setSettingsTab(value);}
  function closeSettings(){setSettings(null);setDrawer(null);}
  function isRemoved(pieceId:string){return Boolean(session.get()?.posts[pieceId]?.deleted||postRecordsRef.current.some(post=>post.pieceId===pieceId&&post.deleted));}
  const journey=createStudioJourneyController({
    getState:local.get,change:local.change,flush:local.flush,fetchImpl:authenticatedFetch,
    isActive:isStudioActive,isRemoved,
    locks:{creation:creationLock,save:saveLock},
  });
  function newPost(pieceId:string = crypto.randomUUID(),fromAgent=false) {
    if(isRemoved(pieceId))throw Error("Post excluído.");
    closeSettings();
    if(fromAgent)exploration.pause();
    journey.preparePost(pieceId,{fromAgent,...(referencesOpen?{referenceScope}:{})});
    setBase(null);setViewingArt(false);setStage('studio');
  }
  async function confirmPostCreation(generate=false){
    if(creatingPost||creationLock.current)return;
    const starting=local.get();
    const reviewed=starting.workflow.pendingPost;
    if(generate&&(!reviewed?.initial||!reviewed.objective.trim()||!reviewed.message.trim()||!canGenerateFirstPost))return;
    setCreatingPost(true);setNotice('');
    const result=await journey.confirmPost({
      onPostCreated:post=>{++versionsReadSequence.current;setPostRecords(previous=>[...previous.filter(item=>item.pieceId!==post.pieceId),post]);},
      retainReferenceProposal,
    });
    if(!active.current)return;
    if(result.status==='superseded')setNotice(`O post “${result.post.name}” foi criado. Sua preparação mais recente foi preservada.`);
    else if(result.status==='unknown')setNotice('Não foi possível confirmar a criação do post. Sua preparação foi mantida. Tente novamente para verificar o mesmo pedido.');
    else if(result.status==='created'){
      if(result.retained.result==='retained')setNotice('A última proposta do Compor está preservada como v0 deste post.');
      if(generate&&reviewed){
        const {pieceId,objective,message,action}=reviewed;
        function isCurrent(){
          const value=session.get();
          if(!active.current||!isAuthenticated()||!value||value.selection?.pieceId!==pieceId||
            value.workflow.view!=='compose'&&value.workflow.view!=='studio')return false;
          const settings=postContext(value,pieceId);
          return settings.objective===objective&&settings.message===message&&settings.action===action&&
            value.brief.offer===starting.brief.offer&&value.brief.audience===starting.brief.audience;
        }
        let claimed=false;
        setInitialPostRequest({
          pieceId,credentialSource,credentialEpoch,isCurrent,
          claim(){
            if(claimed)return false;
            claimed=true;
            setInitialPostRequest(null);
            return true;
          },
        });
        setChatMinimized(false);
      }
    }
    setCreatingPost(false);
  }
  async function confirmPostDeletion(){
    if(!postDeleteTarget||deletingPost)return;
    const {pieceId}=postDeleteTarget;
    if(local.get().adjustments.some(turn=>turn.context.pieceId===pieceId&&!['completed','failed'].includes(turn.status))){setPostDeleteError('Conclua ou verifique o pedido pendente antes de excluir este post.');return;}
    setDeletingPost(true);setPostDeleteError('');
    try{
      await local.flush();
      const response=await fetch('/api/posts',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,pieceId})});
      const result=postMutationSchema.parse(await response.json());
      if(!active.current||!isAuthenticated())return;
      if(response.status===409&&result.status==='pending'){
        setPostDeleteError('Conclua ou verifique o pedido pendente antes de excluir este post.');
        return;
      }
      if(!response.ok||result.status!=='deleted'||result.post.projectId!==project.id||result.post.pieceId!==pieceId||!result.post.deleted)throw Error('unconfirmed');
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
    if(!journey.openVersion(version,versionRef.current))return;
    setSettings(null);setDrawer(null);setViewingArt(false);setStage("studio");
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
  async function saveCurrent(args?:SaveDraftInput):Promise<ActionResult> {
    const selected=getCurrentDraft(local.get());
    if(!selected||saveLock.current||carouselRequest.current||carouselArtBusy.current)throw Error("save_unavailable");
    setSaving(true);setNotice("");
    try {
      const outcome=await journey.saveCurrent({
        readVersions:refreshVersions,
        copyDraftAsset:async(scope,source,target)=>{
          const storage=local.storage.current;
          if(!storage||!isStudioActive())throw Error('storage_unavailable');
          return storage.copyDraftAsset(scope,source,target);
        },
        prepareVersionImage:async input=>{
          const storage=local.storage.current;
          if(!storage||input.userId!==userId||input.projectId!==project.id)return {status:'unknown'};
          const scope={userId:input.userId, projectId:input.projectId};
          const {projectId,pieceId,version}=input;
          const governed=input.content.carouselPlan!==undefined;
          const frameLookup=(!args||governed)&&input.content.format==='carousel'&&input.content.frames?.length
            ? await lookupVersionImage({projectId,pieceId,version})
            : null;
          if(frameLookup?.status==='unknown'||(governed&&frameLookup?.status!=='enabled'))return {status:'unknown'};
          if(frameLookup?.status==='enabled'){
            const baseVersion=input.source.baseVersion;
            const prepared=await prepareSavedFrameImages({
              version:{projectId,pieceId,version},
              content:input.content,
              readFrame:async frame=>{
                const file=await workingFrameImage(pieceId,baseVersion,frame,input.content);
                if(governed)return file;
                if(file)return file;
                if(baseVersion>=1&&frame.assetId?.[14]==='5')throw Error('frame_image_unconfirmed');
                if(frame.position!==1)return null;
                return await workingImage(pieceId,baseVersion) ?? (baseVersion>=1?await canonicalImage(pieceId,baseVersion):null);
              },
            });
            if(prepared.status!=='ready')return prepared;
            return {status:'ready',content:prepared.content,publish:async savedVersion=>{
              const firstFrame=prepared.content.frames.find(frame=>frame.position===1);
              let cover:{assetId:string;file:Blob}|null=null;
              for(const image of prepared.images){
                const file=await publishSavedFrameImage(image,authenticatedFetch);
                if(!file||!isStudioActive())return 'unknown';
                if(!governed)await cacheSavedImage(pieceId,savedVersion,file,image.address.frameId).catch(()=>{});
                if(image.address.frameId===firstFrame?.id)cover={assetId:image.address.assetId,file};
              }
              if(cover&&!governed){
                if(await bindVersionImage({projectId,pieceId,version:savedVersion,assetId:cover.assetId,fetchImpl:authenticatedFetch})!=='published'||!isStudioActive())return 'unknown';
                await cacheSavedImage(pieceId,savedVersion,cover.file).catch(()=>{});
              }
              return 'published';
            }};
          }
          const preview=input.source.baseVersion>=1?await storage.getDraftAsset(scope,{...input.source, kind:'preview'}):null;
          const source=preview??await storage.getDraftAsset(scope, input.source);
          if(!source)return {status:'absent'};
          const link=frameLookup??await lookupVersionImage({projectId,pieceId,version});
          if(link.status==='unknown')return {status:'unknown'};
          if(link.status==='disabled')return {status:'ready',publish:async savedVersion=>{
            if(!isStudioActive())return 'unknown';
            await cacheSavedImage(pieceId,savedVersion,source.file);
            return 'published';
          }};
          if(link.status==='enabled'&&link.assetId){
            const query=new URLSearchParams({projectId,pieceId,version:String(version),assetId:link.assetId});
            return {status:'ready',publish:async savedVersion=>{
              const file=await fetchPrivateImage(query,{fetch:authenticatedFetch,signal:AbortSignal.timeout(30000)});
              if(!isStudioActive())return 'unknown';
              await cacheSavedImage(pieceId,savedVersion,file);
              return 'published';
            }};
          }
          let png:Blob;
          try{
            await studioImageDimensions(source.file,{maxDimension:2048,maxPixels:2048**2});
            png=await composeStudioPng({base:source.file});
          }catch{return {status:'image_unsupported'};}
          if(png.size>4*1024*1024)return {status:'image_unsupported'};
          return {status:'ready',publish:async savedVersion=>{
            const published=await publishVersionPng({projectId,pieceId,version:savedVersion,png,fetchImpl:authenticatedFetch});
            if(published.status==='unknown'||!isStudioActive())return 'unknown';
            await cacheSavedImage(pieceId,savedVersion,published.file);
            return published.status;
          }};
        },
        newEventId:()=>crypto.randomUUID(),
        onVersionsChanging:()=>{versionsReadSequence.current++;},
        onVersionSaved:version=>setVersions(items=>[...items.filter(item=>item.piece_id!==version.piece_id||item.version!==version.version),version]),
      },args);
      const notices={
        saved:'Nova versão salva.',
        composition_required:carouselSaveHint,
        recovered:'Recuperamos a versão que já havia sido salva. Seu rascunho foi preservado; solicite a geração novamente.',
        conflict:'Outra versão foi salva. Seu rascunho foi preservado; consulte o histórico antes de continuar.',
        image_unsupported:'Seu rascunho foi preservado. Para salvar a versão, use uma imagem de até 2048 × 2048 pixels que resulte em um PNG de até 4 MB.',
        unknown:'O resultado do salvamento é desconhecido. Seu rascunho continua nesta aba; consulte as versões antes de repetir.',
        inactive:'',
      };
      if(outcome.notice!=='inactive')setNotice(notices[outcome.notice]);
      return outcome.result;
    } finally {if(active.current)setSaving(false);}
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
        ...(carouselRenderAvailable?{carouselCompositionAvailable:true}:{}),
      };
    },
    compor_editar_briefing: async (args,context) => {
      const target=context?.conversationId??local.get().selection?.pieceId;
      local.change(value=>target&&target!=='references'&&['offer','action'].includes(args.field)?updatePostContext(value,target,{[args.field==='offer'?'message':'action']:args.value}):updateBrief(value,{[args.field]:args.value}));
      return { status: "completed", local: true };
    },
    compor_editar_voz: async (args) => {
      local.change(value => updateBrandVoice(value, { [args.field]: args.value }));
      return { status: "completed", local: true };
    },
    compor_definir_formato: async (args) => {
      local.change(value => setPostFormat(value, args.pieceId, args.format, args.frameCount));
      return { status: "completed", local: true, pieceId: args.pieceId };
    },
    compor_definir_plano_laminas: async (args) => {
      const d = getCurrentDraft(local.get());
      if (!d || d.pieceId !== args.pieceId || d.baseVersion !== args.baseVersion) throw Error("context_changed");
      const next = local.change(value => setDraftFrames(value, {
        pieceId: args.pieceId,
        baseVersion: args.baseVersion,
        visualInvariants: args.visualInvariants,
        frames: args.frames,
        ...(carouselRenderAvailable&&args.compositionMode?{
          compositionMode:args.compositionMode,compositionTokens:args.compositionTokens,
        }:{}),
      }));
      const firstId = next?.drafts.find(item => item.pieceId === args.pieceId && item.baseVersion === args.baseVersion)?.content.frames?.[0]?.id;
      if (firstId) setActiveFrameId(firstId);
      return { status: "completed", local: true, pieceId: args.pieceId, baseVersion: args.baseVersion };
    },
    compor_editar_lamina: async (args) => {
      const d = getCurrentDraft(local.get());
      if (!d || d.pieceId !== args.pieceId || d.baseVersion !== args.baseVersion) throw Error("context_changed");
      local.change(value => updateDraftFrame(value, {
        pieceId: args.pieceId,
        baseVersion: args.baseVersion,
        frameId: args.frameId,
        patch: { [args.field]: args.value },
      }));
      return { status: "completed", local: true, pieceId: args.pieceId, baseVersion: args.baseVersion };
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
      journey.editDraft({field:args.field,value:args.value,captionOrigin:"agent"});
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
        compor_editar_voz: args => handlersRef.current.compor_editar_voz(args),
        compor_definir_formato: args => handlersRef.current.compor_definir_formato(args),
        compor_definir_plano_laminas: args => handlersRef.current.compor_definir_plano_laminas(args),
        compor_editar_lamina: args => handlersRef.current.compor_editar_lamina(args),
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
    if(!files.length||referenceTransitionLock.current||referenceUploadLock.current)return;
    const target=referenceScope;
    referenceUploadLock.current=true;
    setReferenceUploading(true);
    setReferenceUploadFeedback(null);
    let added=0;
    let message='';
    try {
      for(const file of files){
        await storeSelectedReference({kind:'local-upload'},file,target);
        added++;
      }
      message=added===1?'Imagem adicionada à seleção.':`${added} imagens adicionadas à seleção.`;
    } catch(error) {
      if(error instanceof StudioStorageError&&error.code==='studio_reference_invalid')message='Não foi possível abrir um dos arquivos. Escolha um PNG ou JPEG válido de até 8 MB.';
      else if(error instanceof StudioStorageError&&error.code==='studio_storage_quota')message='O armazenamento de referências atingiu o limite neste navegador.';
      else if(error instanceof Error&&error.message==='studio_state_limit')message='Este projeto já tem 20 imagens. Retire uma da seleção antes de enviar outra.';
      else if(error instanceof Error&&error.message==='reference_authority_unconfirmed')message='O envio ainda precisa de confirmação. Consulte a seleção antes de enviar a imagem novamente.';
      else if(error instanceof Error&&error.message==='reference_authority_unavailable')message='O envio foi interrompido enquanto a seleção precisa de confirmação.';
      else if(error instanceof Error&&error.message==='studio_scope_changed')message='O envio foi interrompido. Confirme a conta e abra novamente a seleção de referências.';
      else message='Não foi possível salvar a imagem no armazenamento deste navegador.';
      if(added)message=`${added} de ${files.length} imagens adicionadas. ${message}`;
    } finally {
      referenceUploadLock.current=false;
      if(active.current){setReferenceUploading(false);setReferenceUploadFeedback({scope:target,message});}
    }
  }
  async function storeSelectedReference(source:StudioReference['source'],file:File,target=referenceScope) {
    // A native file picker can deliver change while focus is revalidating the account.
    async function confirmTarget(){
      const confirmed=isAuthenticated()||await awaitConfirmedIdentity?.();
      if(!confirmed||!active.current||!isAuthenticated()||currentReferenceScope.current!==target)throw Error('studio_scope_changed');
    }
    await confirmTarget();
    const storage=local.storage.current;
    if(!storage)throw Error('studio_storage_unavailable');
    const scope={userId,projectId:project.id};
    if(!await checkReferenceAuthority())throw Error('reference_authority_unavailable');
    await confirmTarget();
    if(local.get().references.length>=STUDIO_LIMITS.references)throw Error('studio_state_limit');
    const metadata=await storage.putReference({...scope,id:crypto.randomUUID(),file,source});
    try {
      await confirmTarget();
      const current=local.get();
      if(current.projectId!==project.id || current.userId!==userId)throw Error('studio_scope_changed');
      await coordinateSelection({kind:'select',reference:metadata,target});
    } catch(error) {
      // A committed local selection may still have an unresolved receipt. Keep its bytes.
      try{
        const persisted=await storage.load(scope);
        if(!persisted?.references.some(reference=>reference.id===metadata.id)&&!session.get()?.references.some(reference=>reference.id===metadata.id))await storage.removeReference(scope,metadata.id);
      }catch{}
      throw error;
    }
    await local.flush();
    try { recordReferenceRound(conversationContext(local.get(),referenceScope)); } catch {}
  }
  async function useExploredReference(reference:ExploredReference,file:File) {
    if(!isAuthenticated()||!await checkReferenceAuthority())throw Error('studio_unavailable');
    const existing=local.get().references.find(item=>item.source&&'originUrl' in item.source&&item.source.originUrl===reference.originUrl);
    if(existing){await selectExistingReference(existing,referenceScope,reference);return;}
    const target=referenceScope;
    await recordReferenceSelection({userId,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),reference,commit:()=>storeSelectedReference({originUrl:reference.originUrl,board:reference.board,title:reference.title},file,target)});
  }
  async function useGeneratedReference(imageId:string,file:File,ordinal?:number) {
    if(!await checkReferenceAuthority())throw Error('reference_authority_unavailable');
    const existing=local.get().references.find(item=>item.source&&'kind' in item.source&&item.source.kind==='generated'&&item.source.imageId===imageId);
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
    if(!await checkReferenceAuthority())throw Error('reference_authority_unavailable');
    const source=reference.source;
    const commit=async()=>{await coordinateSelection({kind:'select',reference,target});recordReferenceRound(conversationContext(local.get(),target));};
    if(source&&'originUrl' in source&&pin){await recordReferenceSelection({userId,projectId:project.id,...(target!=='references'?{pieceId:target}:{}),reference:pin,commit});return;}
    if(source&&('originUrl' in source||source.kind==='generated')){
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
      await coordinateSelection({kind:'select',reference,target:scope});
      try { recordReferenceRound(conversationContext(local.get(),scope)); } catch {}
    } catch { if(active.current)setNotice('Não foi possível salvar a seleção.'); }
  }
  async function removeFile(id:string):Promise<boolean> {
    const scope=referenceScope,before=local.get(),reference=before.references.find(item=>item.id===id);
    if(!reference)return false;
    if(referenceAuthorityEnabled){
      try{await coordinateSelection({kind:'unselect',id,target:scope});recordReferenceRound(conversationContext(local.get(),scope));if(!local.get().references.some(item=>item.id===id))await local.storage.current?.removeReference({userId,projectId:project.id},id);if(active.current)setNotice('Referência retirada da seleção.');return true;}
      catch{if(active.current)setNotice('Não foi possível confirmar a alteração. Consulte o estado da seleção antes de continuar.');return false;}
    }
    journey.unselectReference(id,scope);
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
  if (local.loading || !s || !stageRestored)
    return <StudioLoading>Abrindo seu espaço de criação…</StudioLoading>;
  const scopedReferences=effectiveReferences(s,referenceScope);
  const selectedGeneratedIds = scopedReferences.flatMap(reference => reference.source && 'kind' in reference.source && reference.source.kind === 'generated' ? [reference.source.imageId] : []);
  const selectedOrigins = scopedReferences.flatMap(reference => reference.source && 'originUrl' in reference.source ? [reference.source.originUrl] : []);
  const activeFormat = draft ? postFormatOf(s, draft.pieceId) : 'single';
  const activeFormatOption = postFormatOption(activeFormat);
  const activeFrames = draft?.content.frames ?? [];
  const carouselPlan=draft?.content.carouselPlan;
  const compositionPending=Boolean(carouselPlan&&!draft?.content.carouselRender);
  const artSlide=carouselPlan?.slides.find(slide=>slide.frameId===activeFrameId);
  const canAttachArt=carouselRenderAvailable&&artSlide&&artSlide.layout!=='cta_closing'&&!artSlide.diagram;
  const triggerChatAction = (text: string) => {
    if (!draft) return;
    setChatMinimized(false);
    setChatPromptRequest({ conversationId: draft.pieceId, text, nonce: Date.now() });
  };
  const hasLocalPreview=Boolean(draft&&draft.baseVersion>=1&&previewVersions[`${draft.pieceId}:${draft.baseVersion}`]);
  const editor = (
    <StudioEditor guided
      panelRequest={panelRequest}
      format={activeFormat}
      frames={activeFrames}
      activeFrameId={activeFrameId}
      frameBlobs={visibleFrameBlobs}
      canTriggerAI={canUseProjectAI}
      hasLocalPreview={hasLocalPreview}
      onSelectFrame={setActiveFrameId}
      onUpdateFrame={(frameId, patch) => {
        if (!draft) return;
        local.change(value => updateDraftFrame(value, { pieceId: draft.pieceId, baseVersion: draft.baseVersion, frameId, patch }));
      }}
      onAddFrame={carouselPlan ? undefined : () => {
        if (!draft || !activeFormatOption.multiFrame || activeFrames.length >= activeFormatOption.maxFrames) return;
        local.change(value => setPostFormat(value, draft.pieceId, activeFormat, activeFrames.length + 1));
      }}
      onRemoveFrame={carouselPlan ? undefined : frameId => {
        if (!draft || !activeFormatOption.multiFrame || activeFrames.length <= activeFormatOption.minFrames) return;
        const remaining = activeFrames.filter(item => item.id !== frameId).sort((a, b) => a.position - b.position).map((item, idx) => ({ ...item, position: idx + 1 }));
        local.change(value => setDraftFrames(value, { pieceId: draft.pieceId, baseVersion: draft.baseVersion, frames: remaining }));
      }}
      onReorderFrame={(fromIndex, toIndex) => {
        if (!draft) return;
        local.change(value => reorderDraftFrames(value, { pieceId: draft.pieceId, baseVersion: draft.baseVersion, fromIndex, toIndex }));
      }}
      onRefineCopy={() => {
        if (!draft) return;
        const multi = activeFormat === 'carousel' || activeFormat === 'collection';
        triggerChatAction(multi
          ? `Revise e aprimore os textos das lâminas deste ${activeFormatOption.label.toLowerCase()} usando copy-na-imagem (gancho direct response na capa, complementos com continuidade e adequação ao meu perfil/tom). Proponha até 3 opções de gancho para a capa e ajustes nos complementos sem gerar imagem ainda.`
          : `Revise e aprimore o texto desta imagem (${activeFormatOption.label} ${activeFormatOption.ratioLabel}) usando copy-na-imagem com foco em gancho, direct response e adequação ao meu perfil/tom de voz. Proponha até 3 opções de gancho sem gerar imagem ainda.`);
      }}
      onGenerateRemainingFrames={draft?.content.carouselPlan ? undefined : () => {
        if (!draft) return;
        const pendingPositions = [...activeFrames].sort((a, b) => a.position - b.position).slice(1).filter(item => !frameBlobs[item.id]).map(item => item.position);
        if (!pendingPositions.length) return;
        triggerChatAction(`A Lâmina 1 (âncora visual) está aprovada como referência de estilo. Gere a próxima lâmina pendente (${pendingPositions.join(', ')}) mantendo a coesão visual da Lâmina 1 e os textos revisados de cada lâmina.`);
      }}
      panels={[
        {id:"base",label:carouselPlan?"Arte da lâmina":"Imagem-base",
          title:carouselPlan?"Anexar arte à composição":"Usar uma imagem-base própria",
          className:"guided-base-upload",content:!carouselPlan||canAttachArt?<>
            <label>
              {carouselPlan?"Arquivo PNG ou JPEG da lâmina":"Imagem-base PNG ou JPEG"}
              <input key={artSlide?.frameId} type="file" accept="image/png,image/jpeg" disabled={Boolean(carouselPlan)&&versionBusy} onChange={event=>{
              const file=event.target.files?.[0];
              if(file&&draft){
                if(artSlide)void changeCarouselArt(draft,artSlide.frameId,file);
                else void useBase({blob:file,pieceId:draft.pieceId,version:draft.baseVersion,...(activeFrameId?{frameId:activeFrameId}:{})});
              }
              event.target.value='';
              }}/>
            </label>
            {artSlide?.artSha256&&draft&&<button type="button" disabled={versionBusy} onClick={()=>{void changeCarouselArt(draft,artSlide.frameId);}}>Remover arte da lâmina</button>}
          </>:<p>Escolha uma lâmina com espaço para arte.</p>},
        {id:"versions",label:"Versões",title:"Versões e variantes deste post",className:"guided-versions",content:draft && <VariantCards userId={userId} projectId={project.id} pieceId={draft.pieceId} versions={versions} selectedVersion={draft.baseVersion} assetRevision={base} onOpenVersion={openVersion} loadLocal={async version=>{
          const storage=local.storage.current;
          if(!storage)return null;
          if(version.content.carouselPlan){
            const cover=version.content.frames?.find(frame=>frame.position===1);
            if(!cover?.assetId||version.project_id!==project.id||!isStudioActive())return null;
            const jpeg=await workingFrameImage(version.piece_id,version.version,cover,version.content);
            return jpeg&&isStudioActive()?{file:jpeg}:null;
          }
          const localImage=await storage.getDraftAsset({userId,projectId:project.id},{pieceId:version.piece_id,baseVersion:version.version,kind:'base'});
          if(localImage)return localImage;
          const remote=await canonicalImage(version.piece_id, version.version);
          return remote?{file:remote}:null;
        }} onUseImage={useBase} />},
      ]}
      draft={draft}
      brief={s.brief}
      base={base}
      onViewArt={() => {setDrawer(null);setViewingArt(true);}}
      marks={s.marks.filter(
        (m) =>
          m.pieceId === draft?.pieceId && m.baseVersion === draft?.baseVersion,
      )}
      onEdit={(field, value) =>
        journey.editDraft({field,value})
      }
      onSetField={field => local.change(state => setCreativeField(state, field))}
      onRemoveField={id => local.change(state => removeCreativeField(state, id))}
      onMark={(mark) =>
        local.change((value) =>
          addMark(value, { ...mark, id: crypto.randomUUID() }),
        )
      }
      onRemoveMark={(id) => local.change((value) => removeMark(value, id))}
      onApprove={() => { void approveCurrentDraft(); }}
    />
  );
  async function approveCurrentDraft() {
    const selected = getCurrentDraft(local.get());
    const version = versionRef.current.find(
      (v) =>
        v.piece_id === selected?.pieceId &&
        v.version === selected?.baseVersion,
    );
    const hasPreview = Boolean(
      selected &&
        selected.baseVersion >= 1 &&
        previewVersions[`${selected.pieceId}:${selected.baseVersion}`],
    );
    if (!selected || selected.dirty || hasPreview || !version) {
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
            return 'kind' in source ? source.kind==='generated'?[{kind:'generated',projectId:source.projectId,imageId:source.imageId}]:[] : [{kind:'pinterest',originUrl:source.originUrl,board:source.board}];
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
  }
  const parallelRecovery=referencesOpen&&(!usingParallel||!explorationRequested||parallel.phase==='blocked'||parallel.paused||parallel.awaitingFeedback)&&<ParallelExplorationRecovery {...(referenceAuthorityEnabled?{createVisualAuthoritySnapshot,visualAuthorityHeaders}:{})} userId={userId} projectId={project.id} conversationId={referenceScope} credentialSource={credentialSource} credentialEpoch={credentialEpoch} replacementAvailable={usingParallel&&!visualUnavailable} allowReplacement={!referenceUploading&&usingParallel&&!visualUnavailable&&(!referenceAuthorityEnabled||authorityStatus==='ready')&&canUseProjectAI&&parallel.ready&&Boolean(s&&!s.adjustments.some(item=>!['completed','failed'].includes(item.status)))} getReplacementReferences={getReplacementReferences} generationFingerprint={s?JSON.stringify({idea,post:referenceScope==='references'?null:postContext(s,referenceScope),brief:s.brief,persona:s.persona,direction:s.direction,offerFacts:s.offerFacts,references:s.references}):undefined} getReplacementContext={async()=>{const value=session.get();if(!value)throw Error('context_unavailable');const state=conversationContext(value,referenceScope);const currentIdea=referenceScope==='references'?idea:postContext(state,referenceScope).message||idea;return parallelExplorationContext(state,project.id,referenceScope,currentIdea);}} getApiKey={getApiKey} isAuthenticated={isAuthenticated} onCompleted={async (...args)=>{await onExplorationCompleted(...args);if(active.current)setRecoveredCompletions(value=>value+1);}} onContinuePlan={!pendingTurn&&!referenceUploading&&canUseProjectAI&&usingParallel&&!parallel.running&&!visualUnavailable&&(!referenceAuthorityEnabled||authorityStatus==='ready')&&parallel.ready&&parallel.epochReady?requestProposals:undefined}/>;
  const explorationRecovery=<>{!exploration.parallelBlocked&&(exploration.awaitingFeedback ? <div className="studio-message studio-exploration-recovery" data-role="assistant"><p>Mostrei duas rodadas de propostas. Você já está satisfeito com alguma delas? Conte o que achou ou peça mais opções.</p>{exploration.resumeError && <p role="alert">{exploration.resumeError}</p>}{canUseProjectAI && <button type="button" className="studio-button-secondary" disabled={exploration.resuming} onClick={requestProposals}>{exploration.resuming?'Retomando…':'Gerar mais propostas'}</button>}</div> : exploration.blocked ? <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{canUseProjectAI && <button type="button" onClick={requestProposals}>Consultar e retomar</button>}</div> : exploration.awaitingAnswer && <div className="studio-exploration-recovery"><p role="status">{exploration.status}</p>{canUseProjectAI && <button type="button" className="studio-button-secondary" onClick={requestProposals}>Gerar mais propostas</button>}</div>)}</>;
  const renderChat = (conversationId:string|undefined,intro=false,readOnly=false,referenceWorkbench=false) => (
    <StudioChat key={`${userId}:${project.id}:${conversationId??"legacy"}`} conversationId={conversationId} selectedVisualsAvailable={selectedVisualsAvailable} selectedVisualsRequired={selectedVisualsRequired} referenceAuthorityBlocked={referenceAuthorityEnabled&&authorityStatus!=='ready'} {...(referenceAuthorityEnabled?{checkReferenceAuthority,createVisualAuthoritySnapshot,visualAuthorityHeaders}:{})} portalTarget={conversationId===referenceScope&&referencesOpen?referenceChatTarget:null} intro={intro&&!(conversationId===referenceScope&&referenceChatTarget)} readOnly={readOnly} referenceWorkbench={referenceWorkbench||Boolean(conversationId===referenceScope&&referencesOpen)} allowReferenceAnalysis={referencesOpen&&!proposalsLocked&&conversationId===referenceScope} onReferenceWait={reportReferenceWait} onRevealArt={conversationId&&conversationId!=='references'?()=>setChatMinimized(true):undefined}
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
      activeFrameId={conversationId === draft?.pieceId ? activeFrameId : null}
      externalPrompt={chatPromptRequest && chatPromptRequest.conversationId === conversationId ? { text: chatPromptRequest.text, nonce: chatPromptRequest.nonce } : null}
      initialMessage=""
      initialPostRequest={initialPostRequest&&initialPostRequest.pieceId===conversationId?initialPostRequest:undefined}
      connection={<p className="studio-hint">{canUseProjectAI?sourceLabel:'Escolha uma IA nas configurações para conversar, ou continue no editor sem IA.'}</p>}

      loadBase={async ({pieceId,baseVersion,frameId}) => {
        const storage=local.storage.current;
        if(!storage)return null;
        const scope={userId,projectId:project.id};
        if(frameId){
          const frameAsset=await storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'base',frameId});
          if(frameAsset)return frameAsset;
        }
        if(baseVersion>=1){
          const preview=await storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'preview'});
          if(preview)return preview;
        }
        return storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'base'});
      }}
      loadAnchor={async ({pieceId,baseVersion}, anchorFrameId) => {
        const storage=local.storage.current;
        if(!storage)return null;
        const scope={userId,projectId:project.id};
        return await storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'base',frameId:anchorFrameId})
          ?? (baseVersion>=1 ? await storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'preview'}) : null)
          ?? await storage.getDraftAsset(scope,{pieceId,baseVersion,kind:'base'});
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
              {draft&&s.workflow.view!=='posts'&&<button type="button" className="studio-button-secondary" onClick={()=>{closeSettings();nextStage('studio');local.change(value=>updateWorkflow(value,{view:'studio'}));setPanelRequest({id:'versions',nonce:Date.now()});}}>Ver versões deste post</button>}
              <button type="button" className="studio-button-secondary" onClick={()=>{void refreshVersions().catch(()=>setNotice('Não foi possível atualizar as versões.'));}}>Atualizar versões</button>
            </div>
            {draft&&s.workflow.view!=='posts'&&<StudioAssets
              userId={userId}
              projectId={project.id}
              pieceId={draft.pieceId}
              version={draft.baseVersion}
              canSave={draft.baseVersion > 0 && !draft.dirty && !hasLocalPreview}
              canonicalStorageActive={draft.baseVersion > 0 && !draft.dirty && !hasLocalPreview}
              preview={base}
              onUseImage={useBase}
            />}
          </div>
      </>);
  const directionPanel=(<>
          <section className="studio-brand-voice" aria-label="Voz da marca">
            <h3>Voz da marca (opcional)</h3>
            <p className="studio-hint">Orienta o tom dos textos na imagem e das legendas sem alterar fatos declarados.</p>
            <label>
              Tom e registro do perfil
              <input
                maxLength={1000}
                value={s.brandVoice?.tone ?? ''}
                placeholder="Ex.: direto, técnico sem jargão vazio, conversa de bastidor"
                onChange={event => local.change(state => updateBrandVoice(state, { tone: event.target.value }))}
              />
            </label>
            <label>
              Exemplos de frases com a sua cara
              <textarea
                rows={2}
                maxLength={1000}
                value={s.brandVoice?.examples ?? ''}
                placeholder="Cole 1 ou 2 frases reais que você costuma escrever."
                onChange={event => local.change(state => updateBrandVoice(state, { examples: event.target.value }))}
              />
            </label>
            <label>
              Palavras, clichês ou estilos a evitar
              <input
                maxLength={1000}
                value={s.brandVoice?.avoid ?? ''}
                placeholder="Ex.: destrave, revolucione, promessas exageradas"
                onChange={event => local.change(state => updateBrandVoice(state, { avoid: event.target.value }))}
              />
            </label>
          </section>
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
  const isCleanSaved=Boolean(draft&&!draft.dirty&&!hasLocalPreview&&draft.baseVersion>=1&&!compositionPending);
  const postVersionLabel=isCleanSaved&&draft?.approval.status==="approved"?"★ Pronto para postar":isCleanSaved?`Salvo · v${draft?.baseVersion}`:draft?.creationContext?.explorationSource?"v0 · Em criação":"Em criação";
  const hasReadyArt=Boolean(base||(activeFrames.length>0&&activeFrames.every(frame=>Boolean(visibleFrameBlobs[frame.id]))));
  const hasReadyCaption=Boolean(draft?.content.caption?.trim());
  // ADR 0056: nome do post, versão e ações ficam no topo do próprio post; a barra superior é fixa.
  const artwork=(<div className="studio-post-workspace">
          <div className="studio-post-workspace-header">
            <div className="studio-post-identity"><h2 title={postTitle}>{postTitle}</h2><span className="studio-badge" data-status={isCleanSaved&&draft?.approval.status==="approved"?"approved":isCleanSaved?"saved":"draft"}>{postVersionLabel}</span>{draft&&<span className="studio-badge studio-badge-format">{activeFormatOption.label} · {activeFormatOption.ratioLabel}</span>}<span className="studio-readiness-pills" aria-label="Prontidão do post"><span data-done={hasReadyArt?'true':undefined}>{hasReadyArt?'✓':'○'} Arte</span><span data-done={hasReadyCaption?'true':undefined}>{hasReadyCaption?'✓':'○'} Legenda</span><span data-done={isCleanSaved?'true':undefined}>{isCleanSaved?'✓':'○'} Salvo</span></span></div>
            <div className="studio-post-actions" role="toolbar" aria-label="Ações deste post"><button type="button" className="studio-button-secondary" aria-label="Escolher mais referências" title="Escolher mais referências" onClick={()=>{setReferenceScope(draft?.pieceId??'references');setDrawer(null);setSettings('references','post');}}><PostActionIcon path="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1 1 0 1 0 0-.01"/>Referências</button>
            <button type="button" className="studio-button-secondary" aria-label="Configurações do Post" title="Configurações do Post" onClick={()=>setPostSettingsOpen(true)}><PostActionIcon path="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"/>Configurações</button>
            <button type="button" className="studio-button-secondary" aria-label="Revisar post" title="Revisar post" disabled={s.workflow.view==='prepare-post'} onClick={()=>nextStage('review')}><PostActionIcon path="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"/>Revisar</button>
            <button type="button" className="studio-button" data-save-state={saving?'saving':isCleanSaved?'saved':'unsaved'} aria-label={saving?undefined:'Salvar versão'} aria-describedby={compositionPending?'studio-carousel-save-hint':undefined} title="Salvar versão" disabled={versionBusy||compositionPending||isCleanSaved||s.workflow.view==='prepare-post'} onClick={()=>{void saveCurrent();}}><PostActionIcon path="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>{saving?'Salvando…':isCleanSaved?`Salvo · v${draft?.baseVersion} ✓`:'Salvar'}</button></div></div>

          {compositionPending&&<p id="studio-carousel-save-hint" className="studio-hint">{carouselSaveHint}</p>}
          <div className="guided-artwork-editor">
          {editor}
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
  async function finishReferences(close=true) {
    if(referenceTransitionLock.current||referenceUploadLock.current)return false;
    referenceTransitionLock.current=true;setReferenceTransition(true);exploration.pause();
    try {
      const value=local.get(),selected=getCurrentDraft(value);
      const defer=preparing||!selected||selected.pieceId===value.workflow.referencePieceId||value.workflow.view==='posts'||value.workflow.view==='prepare-post';
      if(defer){
        if(value.workflow.latestExplorations?.[referenceScope])local.change(state=>updateWorkflow(state,{referenceHandoff:referenceScope}));
        if(preparing){
          setSettings('references');
          journey.updateWorkflow({phase:'ready'});
          if(value.workflow.pendingPost)journey.updateWorkflow({view:'prepare-post'});
          else journey.preparePost(crypto.randomUUID(),{initial:true});
        }
        await local.flush();
      } else {
        const retained=await retainReferenceProposal(referenceScope);
        if(retained.result==='retained')setNotice('A última proposta do Compor está preservada como v0 deste post.');
      }
      if(!active.current||!isAuthenticated())return false;
      if(close){
        closeSettings();
        requestAnimationFrame(()=>{const name=document.querySelector<HTMLInputElement>('.guided-post-preparation-fields input');if(name)name.focus();else document.querySelector<HTMLButtonElement>('.studio-post-actions button')?.focus();});
      }
      return true;
    } catch {setNotice('Não foi possível preservar a proposta para o post. Suas referências continuam aqui; tente continuar novamente.');return false;}
    finally {referenceTransitionLock.current=false;if(active.current)setReferenceTransition(false);}
  }
  const nextReferences=()=>local.change(value=>updateWorkflow(value,{phase:'references'}));
  const selectionBlocked=referenceAuthorityEnabled&&authorityStatus!=='ready';
  const authorityPanel=selectionBlocked&&<div className="reference-workbench-block studio-exploration-recovery" aria-label="Estado da seleção de referências">
    <p role="status">{authorityStatus==='checking'?'Verificando a seleção de referências…':authorityStatus==='pending'?'A confirmação da seleção está pendente. Consulte a tentativa para liberar os envios e as propostas.':authorityStatus==='conflict'?'A seleção deste navegador diverge da seleção confirmada. Revise as duas para liberar os envios e as propostas.':'Não foi possível verificar a seleção de referências. Consulte a confirmação para liberar os envios e as propostas.'}</p>
    {authorityStatus!=='checking'&&!referenceUploading&&<button type="button" className="studio-button-secondary" onClick={()=>void inspectAuthority()}>Consultar confirmação</button>}
    {authorityStatus==='pending'&&!referenceUploading&&<button type="button" className="studio-button-secondary" onClick={()=>void fenceAuthorityPending()}>Encerrar tentativa de alteração pendente</button>}
    {authorityStatus==='conflict'&&!authorityReview&&<button type="button" className="studio-button-secondary" onClick={()=>void previewAuthorityAdoption()}>Revisar seleção deste navegador</button>}
    {authorityReview&&<section aria-label="Revisão da seleção local"><p>Confirme se deseja publicar a seleção deste navegador no lugar da seleção remota revisada. Qualquer alteração concorrente impede a publicação.</p><h3>Seleção remota · revisão {authorityReview.remote.revision}</h3><ul>{authorityReview.remote.state.references.map(reference=>{const posts=authorityReview.remote.state.posts.filter(post=>post.referenceIds.includes(reference.id)).map(post=>post.pieceId),excluded=authorityReview.remote.state.posts.filter(post=>post.excludedReferenceIds.includes(reference.id)).map(post=>post.pieceId);return <li key={reference.id}>{reference.id} · {reference.inputOrigin==='local-upload'?'upload':reference.inputOrigin==='external'?'externa':'gerada'} · {authorityReview.remote.state.projectReferenceIds.includes(reference.id)?'selecionada no projeto':'não selecionada no projeto'}{posts.length?` · posts: ${posts.join(', ')}`:''}{excluded.length?` · excluída dos posts: ${excluded.join(', ')}`:''}</li>;})}</ul><p>Somente na seleção remota: {authorityReview.remote.state.references.filter(item=>!authorityReview.selection.references.some(reference=>reference.id===item.id)).map(item=>item.id).join(', ')||'nenhuma'}.</p><p>Somente neste navegador: {authorityReview.selection.references.filter(item=>!authorityReview.remote.state.references.some(reference=>reference.id===item.id)).map(item=>item.id).join(', ')||'nenhuma'}.</p><h3>Seleção deste navegador</h3><p>Itens de origem desconhecida não serão incluídos.</p><ul>{authorityReview.selection.references.map(reference=>{const posts=authorityReview.selection.posts.filter(post=>post.referenceIds.includes(reference.id)).map(post=>s.posts[post.pieceId]?.name||post.pieceId),excluded=authorityReview.selection.posts.filter(post=>post.excludedReferenceIds.includes(reference.id)).map(post=>s.posts[post.pieceId]?.name||post.pieceId);return <li key={reference.id}>{s.references.find(item=>item.id.toLowerCase()===reference.id)?.name??reference.id} ({reference.id}) · {reference.inputOrigin==='local-upload'?'upload':reference.inputOrigin==='external'?'externa':'gerada'} · {authorityReview.selection.projectReferenceIds.includes(reference.id)?'selecionada no projeto':'não selecionada no projeto'}{posts.length?` · posts: ${posts.join(', ')}`:''}{excluded.length?` · excluída dos posts: ${excluded.join(', ')}`:''}</li>;})}</ul>{authorityReview.unknownSelected.length>0&&<p>Não incluídas por origem desconhecida: {authorityReview.unknownSelected.map(item=>item.name).join(', ')}.</p>}<button type="button" onClick={()=>void confirmAuthorityAdoption()}>Confirmar seleção revisada</button><button type="button" onClick={()=>setAuthorityReview(null)}>Cancelar</button></section>}
  </div>;
  const aiPanel=<ProjectAI continueLabel={preparing?'Continuar para referências':returnToWorkspaceLabel} preference={s.workflow.aiPreference} source={credentialSource} available={defaultAvailable} canUseAI={canUseAI} keyInput={keyInput} onDefault={()=>{if(credentialSource==='byok')onRemoveKey();local.change(value=>updateWorkflow(value,{aiPreference:'default'}));activateAI();}} onOwn={()=>local.change(value=>updateWorkflow(value,{aiPreference:'byok'}))} onRemove={()=>{onRemoveKey();setProjectIntent(false);exploration.pause();}} onContinue={preparing?nextReferences:closeSettings} onSkip={()=>{continueWithoutAI();if(preparing)nextReferences();else closeSettings();}} onBack={()=>preparing?local.change(value=>updateWorkflow(value,{phase:'context'})):closeSettings()}/>;
  const proposalBlock=(()=>{
    if(referenceUploading)return undefined;
    if(visualUnavailable||selectedVisualsRequired&&!usingParallel)return {
      message:parallel.legacyPending?'Consulte a exploração anterior antes de pedir propostas.':'A exploração com imagens selecionadas está indisponível agora.',
      action:{label:'Consultar tentativa sequencial',run:()=>void inspectLegacyExploration()},
    };
    if(selectionBlocked)return undefined;
    if(pendingTurn)return {message:'Aguarde ou consulte o pedido em andamento antes de pedir propostas.'};
    if(!canUseProjectAI)return {
      message:'Escolha uma IA para pedir propostas.',
      action:{label:'Escolher IA',run:()=>{if(preparing)local.change(value=>updateWorkflow(value,{phase:'ai'}));else setSettings('ai');}},
    };
    if(usingParallel&&!parallel.ready)return {
      message:parallel.audienceConflict?'Resolva a divergência de público para pedir propostas.':'Informe a ideia ou oferta do projeto para pedir propostas.',
      action:{label:'Revisar contexto',run:()=>{if(preparing)local.change(value=>updateWorkflow(value,{phase:'context'}));else setSettings('context');}},
    };
    if(usingParallel&&parallel.epochStatus==='unavailable')return {
      message:'Não foi possível verificar a disponibilidade da exploração.',
      action:{label:'Verificar disponibilidade',run:parallel.recheckEpoch},
    };
    if(usingParallel&&!parallel.epochReady)return {message:'Verificando a disponibilidade da exploração…'};
    if(usingParallel&&parallel.running&&(parallel.paused||parallel.phase==='blocked'))return {message:'Concluindo a pausa da tentativa anterior…'};
    return undefined;
  })();
  const confirmedProposals=parallel.progress?.children.filter(item=>item.status==='completed').length??0;
  const proposalDisclosure=usingParallel&&selectedVisualsAvailable&&scopedReferences.some(reference=>reference.source)
    ? <>
        <p>{`As imagens selecionadas, ou cópias otimizadas, são enviadas à OpenAI no planejamento. Os uploads escolhidos são usados nas três imagens. ${referenceAuthorityEnabled?'O agente pode escolher quais referências externas autorizadas e imagens geradas selecionadas também usará. ':''}A sessão do agente mantém estado e não usa retenção zero.`}</p>
        <ReviewDisclosureBadge compact />
      </>
    : <ReviewDisclosureBadge compact />;
  const referencePanel=<ReferencePanel entry={preparing?'preparation':draft&&referenceScope!=='references'?'post':'project'} projectTitle={projectDetails.title} selectionCount={scopedReferences.length} selectionWaiting={Boolean(referenceWaits[referenceScope])} needsResponse={exploration.awaitingAnswer||exploration.awaitingFeedback} projectWide={referenceScope==='references'} continueDisabled={referenceTransition||referenceUploading}
    onUpload={files=>{void addFiles(files);}} uploadDisabled={referenceTransition||referenceUploading||selectionBlocked} uploadStatus={referenceUploading?'Adicionando imagens à seleção…':referenceUploadFeedback?.scope===referenceScope?referenceUploadFeedback.message:undefined} selectionStatus={authorityPanel} recovery={parallelRecovery}
    onRequestProposals={requestProposals} proposalsDisabled={referenceTransition||referenceUploading||selectionBlocked||Boolean(proposalBlock)||proposalsRunning} proposalBlock={proposalBlock} proposalDisclosure={proposalDisclosure} proposalsRunning={proposalsRunning} proposalsLocked={proposalsLocked} onPauseProposals={()=>{proposalRequest.current.sequence++;proposalRequest.current.pending=false;setProposalCheck(null);setParallelGesture(null);exploration.pause();}} proposalPhase={exploration.phase} proposalProgress={exploration.progress} proposalStatus={referenceTransition?'Preservando a proposta para o post…':serialInspection?.scope===referenceScope&&proposalBlock?serialInspection.message:checkingProposal||parallelGesture!==null?'Verificando as condições para gerar propostas…':proposalsLocked&&usingParallel&&confirmedProposals>0?`${confirmedProposals} de 3 imagens confirmadas.`:explorationRequested?exploration.status:undefined} onScope={!preparing&&draft?wide=>{if(referenceUploadLock.current)return;exploration.pause();setExplorationRequested(false);setReferenceScope(wide?'references':draft.pieceId);}:undefined}
    selection={<>{referenceAuthorityEnabled&&!selectionBlocked&&<p>Seleção de referências confirmada.</p>}<ReferenceSelectionTray items={scopedReferences.map(reference=>({...reference,url:references.find(item=>item.id===reference.id)?.url,scopeLabel:s.projectReferenceIds.includes(reference.id)?'Do projeto':'Deste post',removeLabel:referenceScope==='references'?'Remover do projeto':s.projectReferenceIds.includes(reference.id)?'Deixar de usar neste post':'Remover deste post',...(referenceScope!=='references'&&!s.projectReferenceIds.includes(reference.id)?{onShare:()=>{void selectExistingReference(reference,'references').catch(()=>setNotice('Não foi possível confirmar o compartilhamento.'));}}:{})}))} availableShared={referenceScope==='references'?[]:s.references.filter(reference=>s.projectReferenceIds.includes(reference.id)&&!scopedReferences.some(item=>item.id===reference.id)).map(reference=>({...reference,url:references.find(item=>item.id===reference.id)?.url}))} onUseShared={referenceScope==='references'?undefined:useSharedReference} limit={STUDIO_LIMITS.references} onRemove={async id=>{await removeFile(id);}}/></>}
    search={sourceControl=><ReferenceExploration authorityConsentRequired={referenceAuthorityEnabled} sourceControl={sourceControl} key={referenceScope} userId={userId} projectId={project.id} idea={referenceDiscoverySubject(s,referenceScope==='references'?idea:postContext(s,referenceScope).message||idea)} postFormat={referenceScope==='references'?undefined:activeFormat} selectedOrigins={selectedOrigins} onUseReference={useExploredReference} onRemoveReference={async originUrl=>{const reference=effectiveReferences(local.get(),referenceScope).find(item=>item.source&&'originUrl' in item.source&&item.source.originUrl===originUrl);if(!reference||!await removeFile(reference.id))throw Error('reference_removal_not_confirmed');}}/>}
    proposals={<section className="reference-workbench-proposals">{usingParallel&&parallel.progress&&<ParallelExplorationProgress progress={parallel.progress}/>}<ExplorationGallery projectId={project.id} completed={exploration.completed+recoveredCompletions} phase={exploration.phase} countdown={exploration.countdown} onUseReference={useGeneratedReference} selectedIds={selectedGeneratedIds} onRemoveReference={async imageId=>{const reference=effectiveReferences(local.get(),referenceScope).find(item=>item.source&&'kind' in item.source&&item.source.kind==='generated'&&item.source.imageId===imageId);if(!reference||!await removeFile(reference.id))throw Error('reference_removal_not_confirmed');}}/></section>}
    conversation={<>{explorationRecovery}<div className="guided-reference-chat"><div className="guided-reference-post-chat" ref={setReferenceChatTarget}/></div></>}
    onBack={preparing?()=>local.change(value=>updateWorkflow(value,{phase:'ai'})):undefined} onContinue={()=>{void finishReferences();}} continueLabel={preparing?(scopedReferences.length?'Preparar primeiro post':'Continuar sem referências'):s.workflow.view==='prepare-post'?'Voltar ao pedido':returnToWorkspaceLabel}/>;
  const intro=s.workflow.view==='compose'&&!draft?.baseVersion&&!base&&!conversationMessages(s,draft?.pieceId).some(message=>message.role==='user');
  const chatIds=[...new Set([...visitedPosts,...(draft?[draft.pieceId]:[])])].filter(id=>id!==s.workflow.referencePieceId);
  const chats=chatIds.map(id=><div className="guided-conversation" key={id} hidden={id!==draft?.pieceId}>{renderChat(id,id===draft?.pieceId&&intro)}</div>);
  const showPosts=()=>{closeSettings();setPostSettingsOpen(false);nextStage('studio');local.change(value=>updateWorkflow(value,{view:'posts'}));};
  const pendingPost=s.workflow.pendingPost;
  const preparingPost=s.workflow.view==='prepare-post';
  const viewingPendingConversation=Boolean(pendingTurn&&draft&&pendingTurn.context.conversationId===draft.pieceId&&s.workflow.view!=='posts'&&!preparingPost&&(!chatMinimized||intro));
  const preparedValue=pendingPost??(draft?postContext(s,draft.pieceId):{objective:'',message:'',action:''});
  const preparedName=pendingPost?.name??(draft?s.posts[draft.pieceId]?.name??'':'');
  const preparedFormat=pendingPost?.format??(draft?postFormatOf(s,draft.pieceId):'single');
  const preparedFrameCount=pendingPost?.targetFrameCount??(draft?postTargetFrameCountOf(s,draft.pieceId):1);
  const changePreparation=journey.changePreparation;
  const validPostName=postNameSchema.safeParse(preparedName).success;
  const initialPost=Boolean(pendingPost?.initial);
  const canGenerateFirstPost=canUseProjectAI&&!visualUnavailable&&(!referenceAuthorityEnabled||authorityStatus==='ready')&&!pendingTurn;
  const POST_ANGLE_STARTERS:[string,string,string][]=[
    ['+ Quebrar objeção','Quebrar objeção comum do público','Mostre por que a dúvida mais comum sobre '+(s.brief.offer.trim()||'o tema do projeto')+' não precisa travar quem está começando.'],
    ['+ Bastidores','Mostrar bastidores e processo real','Compartilhe um detalhe real de bastidor sobre '+(s.brief.offer.trim()||'este projeto')+' para gerar proximidade.'],
    ['+ Benefício prático','Destacar um benefício prático imediato','Explique um ganho prático que a pessoa percebe logo no início com '+(s.brief.offer.trim()||'a oferta')+'.'],
    ['+ Últimas vagas','Chamada direta com urgência real','Convide quem acompanhou até aqui para garantir participação com condição clara.'],
  ];
  const postPreparation=preparingPost&&(
    <section className="studio-panel guided-question" aria-labelledby="post-preparation-title">
      <p className="studio-eyebrow">PREPARAR POST</p>
      <h2 id="post-preparation-title">{initialPost?'Vamos preparar o primeiro post':'Vamos preparar este post'}</h2>
      <p>{initialPost?'Revise o nome e a mensagem sugeridos, escolha o formato e informe o objetivo deste post. O público do projeto já faz parte do contexto.':'Escolha um nome para organizar esta peça e defina o formato e o que ela deve comunicar.'}</p>
      {!initialPost&&<div className="guided-context-examples" aria-label="Continue sua divulgação"><span>Continue sua divulgação:</span>{POST_ANGLE_STARTERS.map(([label,objective,message])=><button key={label} type="button" className="studio-button-secondary guided-chip" onClick={()=>changePreparation({objective,message})}>{label}</button>)}</div>}
      <form onSubmit={event=>{event.preventDefault();void confirmPostCreation();}}>
        <fieldset className="guided-post-preparation-fields" disabled={creatingPost}>
          <label>Nome do post<input required maxLength={200} value={preparedName} placeholder="Ex.: Live gratuita — Porcentagem no ENEM" onChange={event=>changePreparation({name:event.target.value})}/></label>
          <PostSettings preparing value={preparedValue} format={preparedFormat} targetFrameCount={preparedFrameCount} legacyAction={s.brief.action} onChange={changePreparation}/>
          <p className="studio-hint">A chamada para ação é opcional.</p>
          {initialPost&&canGenerateFirstPost&&<ReviewDisclosureBadge compact />}
          <div className="guided-actions">
            <button type="button" className="studio-button-secondary" onClick={()=>{journey.cancelPreparation();showPosts();}}>Cancelar</button>
            <button type="submit" className={initialPost&&canGenerateFirstPost?'studio-button-secondary':'studio-button'} disabled={!validPostName}>{creatingPost?'Criando post…':'Continuar para criação'}</button>
            {initialPost&&canGenerateFirstPost&&<button type="button" className="studio-button" disabled={!validPostName||!preparedValue.objective.trim()||!preparedValue.message.trim()} onClick={()=>{void confirmPostCreation(true);}}>Gerar primeiro post</button>}
          </div>
        </fieldset>
      </form>
    </section>
  );

  const canvas=<>
    {referencesOpen&&!referencesModal&&referencePanel}
    <div className="studio-workspace-host" hidden={referencesOpen&&!referencesModal}>
      {pendingTurn&&!preparing&&!viewingPendingConversation&&<p className="studio-hint" role="status">Há um pedido ainda não confirmado. <button type="button" onClick={()=>{if(!pendingTurn.context.conversationId){setSettings('history');}else if(pendingTurn.context.conversationId==='references'){setReferenceScope('references');setSettings('references');}else{setChatMinimized(false);openPost(pendingTurn.context.pieceId);}}}>Abrir a conversa desse pedido</button></p>}
      {preparing&&s.workflow.phase!=='references'&&<><PreparationSteps phase={s.workflow.phase}/>{s.workflow.phase==='context'?<ProjectQuestions state={s} defaultAvailable={defaultAvailable} canSkipToPost={defaultAvailable||canUseAI} aiBadgeLabel={credentialSource==='byok'&&canUseAI?'✦ Sua chave OpenAI conectada':defaultAvailable?'✦ IA do Compor incluída':undefined} onChange={patch=>local.change(value=>updateWorkflow(updateBrief(value,patch),{contextStarted:true}))} onStep={contextStep=>local.change(value=>updateWorkflow(value,{contextStep}))} onContinue={()=>local.change(value=>updateWorkflow(value,{phase:'ai'}))} onSkipToPost={()=>{local.change(value=>updateWorkflow(value,{aiPreference:credentialSource,phase:'ready'}));journey.preparePost(crypto.randomUUID(),{initial:true,initialProjectTitle:projectDetails.title});}}/>:aiPanel}</>}
      {!preparing&&s.workflow.view==='posts'&&<ProjectPosts state={s} versions={versions} posts={postRecords} loadThumbnail={async(pieceId,version)=>await workingImage(pieceId,version)??(version>=1?await canonicalImage(pieceId,version).catch(()=>null):null)} onOpen={openPost} onNew={()=>newPost()} onDelete={(pieceId,name)=>{setPostDeleteError('');setPostDeleteTarget({pieceId,name});}}/>}
      <div className="guided-post-host" hidden={preparing||s.workflow.view==='posts'} style={{height:'100%',minHeight:0,overflowY:preparingPost?'auto':undefined}}>{postPreparation}<div className="studio-workspace-view" data-active={!preparing&&!referencesOpen&&s.workflow.view!=='posts'&&!preparingPost} hidden={preparingPost} style={{height:'100%',minHeight:0}}><GuidedWorkspace chat={chats} artwork={artwork} intro={intro} chatMinimized={chatMinimized} onChatMinimizedChange={setChatMinimized} onManual={()=>local.change(value=>updateWorkflow(value,{view:'studio'}))}/></div></div>
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
      navigationLocked={proposalsLocked}
      sidebar={!preparing?<StudioNavigation locked={proposalsLocked} projectTitle={projectDetails.title} onRenameProject={renameProject} actions={[
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
          {referencesModal&&referencesModalKind==='post'&&<StudioDialog title="Referências deste post" className="studio-modal-framed reference-post-modal" closeLabel="Fechar referências do post" closeDisabled={proposalsLocked} onClose={()=>{void finishReferences();}}>{referencePanel}</StudioDialog>}
          {currentSettings&&(currentSettings!=='references'||referencesModal&&referencesModalKind==='project')&&<StudioDialog title="Configurações do projeto" className="studio-modal-framed" closeLabel="Fechar configurações" closeDisabled={proposalsLocked} onClose={()=>{if(currentSettings==='references')void finishReferences();else closeSettings();}}><nav className="guided-settings-tabs" aria-label="Configurações" inert={proposalsLocked}>{settingsSections.map(([tab,label])=><button type="button" className="studio-button-secondary" key={tab} aria-pressed={currentSettings===tab} onClick={()=>{void(async()=>{if(currentSettings==='references'&&tab!=='references'&&!await finishReferences(false))return;setDrawer(null);if(tab==='references')setReferenceScope('references');setSettings(tab,'project');})();}}>{label}</button>)}</nav>{currentSettings==='context'?<><p>Ideia inicial: {idea||'Ainda não informada'}</p><ContextStrip state={s} onBrief={patch=>local.change(value=>updateBrief(value,patch))} onFacts={facts=>local.change(value=>updateOfferFacts(value,facts))}/></>:currentSettings==='ai'?aiPanel:currentSettings==='direction'?directionPanel:currentSettings==='materials'?basesPanel:currentSettings==='references'?referencePanel:<><p>Histórico preservado da versão anterior. Novos pedidos são feitos na conversa de cada post.</p><div className="guided-reference-chat">{renderChat(undefined,false,true)}</div></>}</StudioDialog>}
          {postSettingsOpen&&draft&&<StudioDialog title="Configurações do Post" closeLabel="Fechar configurações do post" onClose={()=>setPostSettingsOpen(false)}><PostSettings value={postContext(s,draft.pieceId)} format={postFormatOf(s,draft.pieceId)} targetFrameCount={postTargetFrameCountOf(s,draft.pieceId)} legacyAction={s.brief.action} onChange={patch=>{
            const contextPatch:{objective?:string;message?:string;action?:string}={};
            if(patch.objective!==undefined)contextPatch.objective=patch.objective;
            if(patch.message!==undefined)contextPatch.message=patch.message;
            if(patch.action!==undefined)contextPatch.action=patch.action;
            if(Object.keys(contextPatch).length)journey.updatePostContext(draft.pieceId,contextPatch);
            if(patch.format!==undefined||patch.targetFrameCount!==undefined)journey.setPostFormat(draft.pieceId,patch.format??postFormatOf(s,draft.pieceId),patch.targetFrameCount);
          }}/>{s.posts[draft.pieceId]?.direction.criteria.length>0&&<StudioDirection direction={s.posts[draft.pieceId].direction} references={references.filter(reference=>effectiveReferences(s,draft.pieceId).some(item=>item.id===reference.id))} onPropose={criterion=>local.change(value=>addPostCriterion(value,draft.pieceId,criterion))} onDecide={decision=>local.change(value=>decidePostCriterion(value,draft.pieceId,decision))}/>}</StudioDialog>}
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
          <StudioReview
            title={projectDetails.title}
            downloadTitle={postTitle}
            postUrl={typeof window !== 'undefined' && openPieceId ? `${window.location.origin}/projetos/${encodeURIComponent(project.id)}/posts/${encodeURIComponent(openPieceId)}` : undefined}
            confirmedFacts={(s.offerFacts ?? []).filter(fact => fact.status === 'confirmed' && fact.value.trim().length > 0)}
            draft={draft}
            base={base}
            format={activeFormat}
            frames={activeFrames}
            frameBlobs={visibleFrameBlobs}
            saving={saving}
            composing={composingCarousel}
            uploadingArt={uploadingCarouselArt}
            hasLocalPreview={hasLocalPreview}
            onCompose={carouselRenderAvailable&&draft?.content.carouselPlan ? ()=>{void requestCarouselComposition(draft);} : undefined}
            onSave={() => {
              void saveCurrent().catch(() => setNotice('Não foi possível iniciar o salvamento desta versão.'));
            }}
            onApprove={() => { void approveCurrentDraft(); }}
          />
          <button type="button" className="studio-button-secondary" onClick={() => nextStage("studio")}>
            Pedir ajuste no estúdio
          </button>
        </StudioPanel>
      )}
    </StudioShell>
  );
}

function PostActionIcon({path}:{path:string}) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path}/></svg>;
}

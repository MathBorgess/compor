"use client";
import {useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import type {StudioState,Brief,StudioWorkflow} from '../lib/studio-domain';
import type {PieceVersion} from './studio-ui-types';
import type {PostRecord} from '../lib/post-catalog';
import {postIds} from '../lib/studio-workflow';
import {useObjectUrl} from './use-object-url.ts';
import {ReviewDisclosureBadge} from './image-review-disclosure';

const steps=['Contexto','IA','Referências'];
export function PreparationSteps({phase}:{phase:StudioWorkflow['phase']}) {
  const current=phase==='context'?0:phase==='ai'?1:2;
  return <nav className="guided-steps" aria-label="Preparação do projeto"><span>Preparar projeto</span><ol>{steps.map((label,index)=><li key={label} aria-current={index===current?'step':undefined}><span aria-hidden="true">{index+1}</span>{label}</li>)}</ol></nav>;
}
const CONTEXT_EXAMPLES:[string,string,string][]=[
  ['Mentoria ENEM','Mentoria de matemática prática para o ENEM, com resolução passo a passo.','Estudantes do ensino médio que travam em questões de matemática.'],
  ['Oficina de Cerâmica','Oficina presencial de cerâmica aos sábados para modelar a primeira peça.','Adultos iniciantes que buscam uma atividade criativa manual.'],
  ['Consultoria B2B','Consultoria de processos comerciais para estruturar vendas recorrentes.','Gestores de pequenas empresas de serviços B2B.'],
];
const questions:[keyof Brief,string,string,string][]=[
  ['offer','O que vamos divulgar?','Descreva o tema, produto ou serviço deste projeto. Não precisa escrever o pedido de um post agora.','Ex.: Mentoria de matemática para o ENEM ou oficina presencial aos sábados'],
  ['audience','Quem você quer alcançar?','Descreva para quem é essa divulgação. Você pode detalhar depois.','Ex.: Pessoas iniciantes que querem destravar na prática sem jargão'],
];
export function ProjectQuestions({state,defaultAvailable=false,onChange,onStep,onContinue,onSkipToPost}:{state:StudioState;defaultAvailable?:boolean;onChange:(patch:Partial<Brief>)=>void;onStep:(step:number)=>void;onContinue:()=>void;onSkipToPost?:()=>void}) {
  const index=Math.min(state.workflow.contextStep,questions.length-1);
  const field=useRef<HTMLTextAreaElement>(null),[name,title,help,placeholder]=questions[index];
  useEffect(()=>{field.current?.focus();},[index]);
  function next(){if(index<questions.length-1)onStep(index+1);else onContinue();}
  const hasOffer=Boolean(state.brief.offer.trim()),hasAudience=Boolean(state.brief.audience.trim());
  return <section className="studio-panel guided-question" aria-labelledby="context-question"><p className="studio-eyebrow">CONTEXTO DO PROJETO · {index+1} DE {questions.length}</p><h2 id="context-question">{title}</h2><p>{help}</p><div className="guided-context-examples" aria-label="Exemplos rápidos"><span>Preencher exemplo:</span>{CONTEXT_EXAMPLES.map(([label,offer,audience])=><button key={label} type="button" className="studio-button-secondary guided-chip" onClick={()=>onChange({offer,audience})}>{label}</button>)}</div><form onSubmit={event=>{event.preventDefault();next();}}><label className="studio-visually-hidden" htmlFor="project-context-answer">{title}</label><textarea ref={field} id="project-context-answer" rows={5} maxLength={4000} placeholder={placeholder} value={state.brief[name]} onChange={event=>onChange({[name]:event.target.value})}/><div className="studio-readiness-pills" aria-label="Resumo do contexto"><span data-done={hasOffer?'true':undefined}>{hasOffer?'✓':'○'} Oferta</span><span data-done={hasAudience?'true':undefined}>{hasAudience?'✓':'○'} Público</span>{defaultAvailable&&<span data-done="true">✦ IA do Compor incluída</span>}</div><div className="guided-actions">{index>0&&<button type="button" className="studio-button-secondary" onClick={()=>onStep(index-1)}>Voltar</button>}<button className="studio-button">{index<questions.length-1?'Continuar':'Continuar para a IA'}</button>{defaultAvailable&&onSkipToPost&&<button type="button" className="studio-button-secondary" onClick={onSkipToPost}>Ir direto para o 1º post →</button>}</div></form><p className="studio-hint">Essas informações orientam todos os posts do projeto. Você poderá revisá-las nas configurações.</p></section>;
}

type AIProps={preference:StudioWorkflow['aiPreference'];source:'default'|'byok';available:boolean;canUseAI:boolean;keyInput:ReactNode;continueLabel?:string;onDefault:()=>void;onOwn:()=>void;onRemove:()=>void;onContinue:()=>void;onSkip:()=>void;onBack:()=>void};
export function ProjectAI({preference,source,available,canUseAI,keyInput,continueLabel='Continuar para referências',onDefault,onOwn,onRemove,onContinue,onSkip,onBack}:AIProps) {
  const ready=preference==='default'?source==='default'&&available:preference==='byok'&&source==='byok'&&canUseAI;
  return <section className="studio-panel guided-question"><p className="studio-eyebrow">COMO VOCÊ QUER CRIAR</p><h2>Escolha sua IA</h2><p>Use o que o Compor oferece ou conecte sua própria chave OpenAI.</p><ReviewDisclosureBadge /><div className="guided-options"><button type="button" className="studio-project-card" aria-pressed={preference==='default'} disabled={!available} onClick={onDefault}><strong>Usar a IA do Compor</strong><span>{available?'Disponível para este projeto':'Indisponível no momento'}</span></button><button type="button" className="studio-project-card" aria-pressed={preference==='byok'} onClick={onOwn}><strong>Usar minha chave</strong><span>Conectar uma chave OpenAI</span></button></div>{preference==='byok'&&<div className="guided-key">{keyInput}{source==='byok'&&<button type="button" className="studio-button-secondary" onClick={onRemove}>Remover chave</button>}</div>}<p className="studio-hint">Escolher a IA não gera imagens. A criação começa quando você fizer um pedido.</p><div className="guided-actions"><button type="button" className="studio-button-secondary" onClick={onBack}>Voltar</button><button type="button" className="studio-button" disabled={!ready} onClick={onContinue}>{continueLabel}</button><button type="button" className="studio-button-secondary" onClick={onSkip}>Escolher depois</button></div></section>;
}
function PostCardThumb({pieceId,version,loadThumbnail}:{pieceId:string;version:number;loadThumbnail?:(pieceId:string,version:number)=>Promise<Blob|null>}) {
  const [blob,setBlob]=useState<Blob|null>(null);
  const loader=useRef(loadThumbnail);loader.current=loadThumbnail;
  useEffect(()=>{
    if(!loader.current){setBlob(null);return;}
    let live=true;
    loader.current(pieceId,version).then(file=>{if(live)setBlob(file);}).catch(()=>{if(live)setBlob(null);});
    return()=>{live=false;};
  },[pieceId,version]);
  const url=useObjectUrl(blob);
  if(!url)return null;
  return <span className="guided-post-card-thumb" aria-hidden="true"><img src={url} alt="" /></span>;
}

export function ProjectPosts({state,versions,posts,loadThumbnail,onOpen,onNew,onDelete}:{state:StudioState;versions:PieceVersion[];posts:PostRecord[];loadThumbnail?:(pieceId:string,version:number)=>Promise<Blob|null>;onOpen:(id:string)=>void;onNew:()=>void;onDelete:(id:string,name:string)=>void}) {
  const [feedView,setFeedView]=useState(false);
  const ids=[...new Set([...postIds(state),...versions.map(item=>item.piece_id),...posts.map(item=>item.pieceId)])].filter(id=>!state.posts[id]?.deleted&&!posts.some(post=>post.pieceId===id&&post.deleted));
  const items=ids.map((id,index)=>{
    const local=state.drafts.filter(item=>item.pieceId===id),saved=versions.filter(item=>item.piece_id===id),current=local.find(item=>item.baseVersion===state.workflow.selections[id])??local.at(-1),last=saved.toSorted((a,b)=>b.version-a.version)[0];
    const name=state.posts[id]?.name||posts.find(post=>post.pieceId===id)?.name||current?.content.headline||last?.content.headline||`Post ${index+1}`;
    const pending=state.adjustments.some(turn=>turn.context.pieceId===id&&!['completed','failed'].includes(turn.status));
    const approved=current?.approval.status==='approved'||last?.metadata?.approval.status==='approved';
    const cleanSaved=Boolean(!current?.dirty&&last);
    const statusLabel=state.posts[id]?.prepared===false?'Preparação em andamento':approved?'★ Pronto para postar':cleanSaved?`Salvo · v${last.version} (${saved.length} ${saved.length===1?'versão salva':'versões salvas'})`:'Em criação neste navegador';
    return {id,name,pending,approved,cleanSaved,statusLabel,thumbVersion:current?.baseVersion??last?.version??0,prepared:state.posts[id]?.prepared!==false};
  });
  const readyCount=items.filter(item=>item.approved).length;
  const inProgressCount=items.length-readyCount;
  return <section className="guided-posts"><div className="guided-heading"><div><h2>Posts do projeto</h2><p>Cada post tem seu nome, sua conversa e suas versões.</p>{items.length>0&&<p className="guided-posts-summary" role="status">{readyCount} {readyCount===1?'pronto para postar':'prontos para postar'} · {inProgressCount} em criação</p>}</div><div className="guided-actions">{items.length>1&&<div className="guided-view-toggle" role="group" aria-label="Visualização dos posts"><button type="button" className="studio-button-secondary guided-chip" aria-pressed={!feedView} onClick={()=>setFeedView(false)}>Cartões</button><button type="button" className="studio-button-secondary guided-chip" aria-pressed={feedView} onClick={()=>setFeedView(true)}>Grade do feed (3×)</button></div>}<button type="button" className="studio-button" onClick={onNew}>Criar novo post</button></div></div>{ids.length===0&&<p>Seu projeto está preparado e ainda não tem posts. Clique em Criar novo post para preparar a primeira peça.</p>}<div className="studio-project-grid" data-view={feedView?'feed':'cards'}>{items.map(item=>(
    <div className="studio-project-entry" key={item.id}><button className="studio-project-card" onClick={()=>onOpen(item.id)} aria-current={state.selection?.pieceId===item.id?'true':undefined}><PostCardThumb pieceId={item.id} version={item.thumbVersion} loadThumbnail={loadThumbnail}/><strong id={`piece-title-${item.id}`} className="studio-truncate" title={item.name}>{item.name}</strong><span data-status={item.approved?'approved':item.cleanSaved?'saved':'draft'}>{item.statusLabel}</span><span>{!item.prepared?'Continuar preparação':'Abrir post e conversa'}</span></button><button type="button" className="studio-project-delete" aria-label="Excluir post" aria-describedby={`piece-title-${item.id}`} title={item.pending?'Conclua ou verifique o pedido pendente antes de excluir':'Excluir post'} disabled={item.pending} onClick={()=>onDelete(item.id,item.name)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button></div>
  ))}</div></section>;
}
export function GuidedWorkspace({chat,artwork,intro,onManual,chatMinimized,onChatMinimizedChange}:{chat:ReactNode;artwork:ReactNode;intro:boolean;onManual:()=>void;chatMinimized:boolean;onChatMinimizedChange:(value:boolean)=>void}) {
  const [width,setWidth]=useState(38);
  const root=useRef<HTMLDivElement>(null),drag=useRef(false),chatArea=useRef<HTMLElement>(null),launcher=useRef<HTMLButtonElement>(null),toggled=useRef(false);
  useEffect(()=>{if(!toggled.current)return;if(chatMinimized)launcher.current?.focus();else chatArea.current?.focus();},[chatMinimized]);
  const minimize=()=>{toggled.current=true;onChatMinimizedChange(true);};
  const reopen=()=>{toggled.current=true;onChatMinimizedChange(false);};
  const isMinimized=chatMinimized&&!intro;
  return <div ref={root} className="guided-workspace" data-view={intro?'intro':'editor'} data-chat={isMinimized?'minimized':'open'} style={{'--guided-chat-width':`${width}%`} as CSSProperties}>
    <section ref={chatArea} id="guided-post-chat" tabIndex={-1} className="guided-chat-area" aria-label="Conversa do post">
      {!intro&&<button type="button" className="guided-chat-minimize" aria-label="Minimizar conversa" title="Minimizar conversa" onClick={minimize}><span aria-hidden="true">−</span></button>}
      {chat}{intro&&<button type="button" className="studio-button-secondary guided-manual" onClick={onManual}>Começar sem IA, no editor</button>}
    </section>
    <div className="guided-divider" role="separator" tabIndex={0} aria-label="Divisão entre conversa e post" aria-orientation="vertical" aria-valuemin={28} aria-valuemax={65} aria-valuenow={width} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setWidth(value=>Math.max(28,Math.min(65,value+(event.key==='ArrowLeft'?-3:3))));}}} onPointerDown={event=>{drag.current=true;event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;const rect=root.current?.getBoundingClientRect();if(rect)setWidth(Math.max(28,Math.min(65,100*(event.clientX-rect.left)/rect.width)));}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}/>
    <section className="guided-post-area" aria-label="Criação do post">{artwork}</section>
    {isMinimized&&<button ref={launcher} type="button" className="guided-chat-launcher" aria-controls="guided-post-chat" aria-expanded="false" onClick={reopen}><span aria-hidden="true">●</span>Abrir conversa</button>}
  </div>;
}
export function GuidedArtPreview({image}:{image:Blob}) {
  const url=useObjectUrl(image),[zoom,setZoom]=useState(100);
  return <div className="guided-art-preview"><label>Zoom da arte {zoom}%<input type="range" min={25} max={200} step={5} value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><div>{url&&<img src={url} alt="Arte integral do post" style={{width:`${zoom}%`,maxWidth:'none'}}/>}</div></div>;
}

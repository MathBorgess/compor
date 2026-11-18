"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import StudioDialog from './studio-dialog';
import {profileResponseSchema,supersededProfileSignals,type ProfilePage,type ProfileProject,type ProfileSignal} from '../lib/profile-contract';
import {localProfileCriteria,type LocalProfileCriterion} from '../lib/profile-local';
import {createStudioStorage} from '../lib/studio-storage';

type LocalLearning={projectId:string;criteria:LocalProfileCriterion[];postNames:Record<string,string>;unavailable:boolean};
type View={status:'loading'}|{status:'error'}|{status:'ready';pages:ProfilePage[];local:LocalLearning[];loadingMore:boolean;error:boolean};
const actions={selected:'Referência escolhida',rejected:'Referência rejeitada',comment:'Comentário registrado'};
const choices={accept:'Aceito',reject:'Rejeitado',reopen:'Em aberto'};
const provenance={hypothesis:'Hipótese',creator_report:'Informado pela pessoa',buyer_report:'Relato do destinatário',public_source:'Fonte pública'};

function ProjectLearnings({project,signals,local}:{project:ProfileProject;signals:ProfileSignal[];local?:LocalLearning}) {
  const superseded=supersededProfileSignals(signals);
  return <details className="profile-project" data-project-id={project.id}>
    <summary><span>{project.title}</span>{project.deletedAt&&<small>Excluído da lista</small>}</summary>
    <div className="profile-project-content">
      <section aria-label={`Sinais de ${project.title}`}>
        <h3>Histórico de escolhas e comentários</h3>
        <p className="profile-storage-note">Salvo na sua conta. Os registros conservam o projeto e o post de origem.</p>
        {!signals.length?<p>Nenhuma escolha ou comentário registrado neste projeto.</p>:<ol className="profile-records">{signals.map(signal=><li key={`${signal.kind}:${signal.id}`} data-signal-id={signal.id} data-piece-id={signal.pieceId??undefined}>
          <div className="profile-record-heading"><strong>{actions[signal.action]}</strong><span>{signal.pieceId?`Post${local?.postNames[signal.pieceId]?` ${local.postNames[signal.pieceId]}`:' deste projeto'}`:'Neste projeto'}</span></div>
          <p>{signal.kind==='reference'?signal.title:'Proposta de imagem do Compor'}</p>
          {signal.comment&&<blockquote>{signal.comment}</blockquote>}
          <p className="profile-record-meta"><time dateTime={signal.createdAt}>{new Date(signal.createdAt).toLocaleDateString('pt-BR')}</time>{superseded.has(`${signal.kind}:${signal.projectId}:${signal.id}`)&&<span>Registro corrigido depois</span>}{signal.supersedes&&<span>Correção de um registro anterior</span>}</p>
          {signal.kind==='reference'&&<a href={signal.originUrl} target="_blank" rel="noopener noreferrer">Ver origem no Pinterest</a>}
        </li>)}</ol>}
      </section>
      <section aria-label={`Critérios de ${project.title}`}>
        <h3>Critérios e decisões</h3>
        <p className="profile-storage-note">Neste navegador. Esses critérios não são sincronizados com outros dispositivos.</p>
        {!local?<p role="status">Lendo critérios deste navegador…</p>:local.unavailable?<p role="alert">Critérios locais indisponíveis. Feche e abra o perfil para tentar novamente.</p>:!local.criteria.length?<p>Nenhum critério salvo neste navegador para este projeto.</p>:<ul className="profile-records">{local.criteria.map(item=><li key={`${item.pieceId??'project'}:${item.criterion.id}`}>
          <div className="profile-record-heading"><strong>{item.criterion.statement}</strong><span>{choices[item.choice]}</span></div>
          <p>{item.pieceId?`Post${item.postName?` ${item.postName}`:''}`:'Projeto'} · {item.criterion.dimension==='visual'?'Visual':'Mensagem'} · {item.criterion.viewpoint==='creator'?'Visão do criador':'Visão do destinatário'}</p>
          <p>{provenance[item.criterion.provenance]}{item.criterion.source?` · ${item.criterion.source}`:''}</p>
          {item.reason&&<p>Motivo da decisão: {item.reason}</p>}
          <details><summary>Exemplo e contraexemplo</summary><p>Exemplo: {item.criterion.example.description}</p><p>Contraexemplo: {item.criterion.counterexample.description}</p></details>
        </li>)}</ul>}
      </section>
    </div>
  </details>;
}

export default function StudioProfile({userId,isAuthenticated,onClose}:{userId:string;isAuthenticated:()=>boolean;onClose:()=>void}) {
  const [view,setView]=useState<View>({status:'loading'});
  const epoch=useRef(0),busy=useRef(false),controller=useRef<AbortController|null>(null);
  const auth=useRef(isAuthenticated);auth.current=isAuthenticated;
  const load=useCallback(async(offset=0)=>{
    if(busy.current||!auth.current())return;
    busy.current=true;
    const sequence=epoch.current,abort=new AbortController();controller.current=abort;
    if(offset===0)setView({status:'loading'});
    else setView(current=>current.status==='ready'?{...current,loadingMore:true,error:false}:current);
    const active=()=>sequence===epoch.current&&!abort.signal.aborted&&auth.current();
    try{
      const response=await fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offset}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw Error('profile_unavailable');
      const page=profileResponseSchema.parse(await response.json());
      if(page.userId!==userId)throw Error('invalid_profile_owner');
      if(!active())return;
      setView(current=>({status:'ready',pages:offset&&current.status==='ready'?[...current.pages,page]:[page],local:offset&&current.status==='ready'?current.local:[],loadingMore:true,error:false}));
      const storage=createStudioStorage();
      try{
        for(const project of page.projects){
          if(!active())break;
          let local:LocalLearning;
          try{const state=await storage.load({userId,projectId:project.id});local={projectId:project.id,criteria:state?localProfileCriteria(state,userId,project.id):[],postNames:state?Object.fromEntries(Object.entries(state.posts).map(([id,post])=>[id,post.name])):{},unavailable:false};}
          catch{local={projectId:project.id,criteria:[],postNames:{},unavailable:true};}
          if(active())setView(current=>current.status==='ready'?{...current,local:[...current.local,local]}:current);
        }
      }finally{storage.close();}
    }catch{
      if(active())setView(current=>offset&&current.status==='ready'?{...current,loadingMore:false,error:true}:{status:'error'});
    }finally{if(sequence===epoch.current){busy.current=false;if(active())setView(current=>current.status==='ready'?{...current,loadingMore:false}:current);}}
  },[userId]);
  useEffect(()=>{epoch.current++;busy.current=false;void load();return()=>{epoch.current++;controller.current?.abort();};},[load]);
  const pages=view.status==='ready'?view.pages:[];
  const nextOffset=pages.at(-1)?.nextOffset??null;
  const projects=[...new Map(pages.flatMap(page=>page.projects).map(project=>[project.id,project])).values()];
  const signals=[...new Map(pages.flatMap(page=>page.signals).map(signal=>[`${signal.kind}:${signal.id}`,signal])).values()];
  return <StudioDialog title="Seu perfil" closeLabel="Fechar perfil" className="studio-profile" onClose={onClose}>
    <p>Aprendizados preservados, inclusive de projetos excluídos.</p>
    <p>Uma escolha não confirma um gosto geral. Preços, datas e público continuam vinculados ao projeto.</p>
    {view.status==='loading'&&<p role="status">Carregando seu perfil…</p>}
    {view.status==='error'&&<div role="alert"><p>Não foi possível carregar seu perfil. Nenhum aprendizado foi apagado.</p><button type="button" onClick={()=>void load()}>Tentar novamente</button></div>}
    {view.status==='ready'&&<>
      {!projects.length&&<p>Os aprendizados dos seus projetos aparecerão aqui.</p>}
      {pages.some(page=>page.limitedSources.length>0)&&<p role="status">Esta página mostra até 500 registros recentes de cada fonte. Registros anteriores permanecem armazenados e não foram apagados.</p>}
      {projects.map(project=><ProjectLearnings key={project.id} project={project} signals={signals.filter(signal=>signal.projectId===project.id)} local={view.local.find(local=>local.projectId===project.id)}/>)}
      {view.error&&<p role="alert">Não foi possível carregar mais projetos. Tente novamente.</p>}
      {nextOffset!==null&&<button type="button" disabled={view.loadingMore} onClick={()=>void load(nextOffset)}>{view.loadingMore?'Carregando projetos…':view.error?'Tentar carregar mais projetos':'Carregar mais projetos'}</button>}
    </>}
  </StudioDialog>;
}

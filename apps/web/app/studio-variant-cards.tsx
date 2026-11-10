"use client";

import {useEffect,useId,useRef,useState} from 'react';
import {groupVariants} from '../lib/studio-variants';
import {fetchPrivateImage} from '../lib/private-image-fetch';
import type {StoredImage} from '../lib/studio-domain';
import type {ImageSelection,PieceVersion} from './studio-ui-types';
import AssetRecovery from './asset-recovery';
import './studio-variant-cards.css';

type Props={userId:string;projectId:string;pieceId:string;versions:PieceVersion[];selectedVersion:number;assetRevision?:Blob|null;onOpenVersion:(version:PieceVersion)=>void|Promise<void>;loadLocal:(version:PieceVersion)=>Promise<StoredImage|null|undefined>;onUseImage:(image:ImageSelection)=>Promise<boolean>};
const labels={style:'Estilo',composition:'Composição',hook:'Gancho'};

export default function VariantCards(props:Props) {
  const groups=groupVariants(props.versions,props.pieceId);
  if(!groups.length)return null;
  return <section className="studio-variants" aria-label="Variantes deste post">
    <h2>Explore as variantes</h2>
    <div className="studio-variant-grid">{groups.map((group,index)=><VariantCard key={`${props.userId}:${props.projectId}:${group.root.piece_id}:${group.root.version}`} {...props} group={group} index={index} />)}</div>
  </section>;
}

function VariantCard({group,index,...props}:Props&{group:ReturnType<typeof groupVariants<PieceVersion>>[number];index:number}) {
  const versionId=useId();
  const selected=group.versions.some(item=>item.version===props.selectedVersion);
  return <article className="studio-variant-card" data-selected={selected} aria-label={`Variante ${index+1}`}>
    <h3>{index===0?'Primeira direção':`Variante ${index+1}`}{group.dimension?` · ${labels[group.dimension]}`:''}</h3>
    <VersionImage {...props} version={group.latest} />
    <p>{group.latest.metadata?(group.latest.metadata.approval.status==='approved'?'Aprovada':'Aguardando aprovação')+' · ':''}Versão {group.latest.version}</p>
    <button type="button" aria-pressed={selected} onClick={()=>void props.onOpenVersion(group.latest)}>Abrir variante {index+1}</button>
    <label htmlFor={versionId}>Versões da variante {index+1}</label>
    <select id={versionId} value={selected?props.selectedVersion:group.latest.version} onChange={event=>{
      const version=group.versions.find(item=>item.version===Number(event.target.value));if(version)void props.onOpenVersion(version);
    }}>{group.versions.toReversed().map(version=><option key={version.version} value={version.version}>Versão {version.version}{version.version===group.latest.version?' · mais recente':''}</option>)}</select>
  </article>;
}

function VersionImage({userId,projectId,version,assetRevision,loadLocal,onUseImage}:Pick<Props,'userId'|'projectId'|'assetRevision'|'loadLocal'|'onUseImage'>&{version:PieceVersion}) {
  const frame=useRef<HTMLDivElement>(null),loader=useRef(loadLocal);
  loader.current=loadLocal;
  const [visible,setVisible]=useState(false);
  const [asset,setAsset]=useState<{scope:string;blob:Blob}|null>(null);
  const [image,setImage]=useState<{blob:Blob;url:string}|null>(null);
  const [recovery,setRecovery]=useState(false);
  const [candidate,setCandidate]=useState<{scope:string;blob:Blob;url:string;decoded:boolean}|null>(null);
  const [notice,setNotice]=useState('');
  const [recovering,setRecovering]=useState(false);
  const sequence=useRef(0),localSequence=useRef(0),read=useRef<AbortController|null>(null);
  const scope=`${userId}:${projectId}:${version.piece_id}:${version.version}`;
  const blob=asset?.scope===scope?asset.blob:null,url=image?.blob===blob?image.url:null;
  useEffect(()=>{
    if(!frame.current)return;
    if(!('IntersectionObserver' in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'240px'});
    observer.observe(frame.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible)return;
    let live=true;const serial=++localSequence.current;
    loader.current(version).then(value=>{if(live&&serial===localSequence.current)setAsset(value?{scope,blob:value.file}:null);}).catch(()=>{if(live)setNotice('Não foi possível recuperar a imagem neste navegador.');});
    return()=>{live=false;};
  },[visible,scope,assetRevision]);
  useEffect(()=>{
    if(!blob){setImage(null);return;}
    const object=URL.createObjectURL(blob);setImage({blob,url:object});return()=>URL.revokeObjectURL(object);
  },[blob]);
  useEffect(()=>{
    setRecovery(false);setCandidate(null);setNotice('');setRecovering(false);sequence.current++;
    return()=>{sequence.current++;read.current?.abort();};
  },[scope]);
  useEffect(()=>()=>{if(candidate)URL.revokeObjectURL(candidate.url);},[candidate?.url]);
  async function select(assetId:string){
    const current=++sequence.current;read.current?.abort();const controller=new AbortController();read.current=controller;
    setCandidate(null);setNotice('Consultando a imagem selecionada…');
    try{
      const found=await fetchPrivateImage(new URLSearchParams({projectId,pieceId:version.piece_id,version:String(version.version),assetId}),{signal:controller.signal});
      if(current!==sequence.current||controller.signal.aborted)return;
      setCandidate({scope,blob:found,url:URL.createObjectURL(found),decoded:false});setNotice('');
    }catch{if(current===sequence.current&&!controller.signal.aborted)setNotice('Não foi possível confirmar esta imagem.');}
  }
  async function useCandidate(){
    if(!candidate?.decoded||candidate.scope!==scope||recovering)return;
    const current=sequence.current,selected=candidate;localSequence.current++;setRecovering(true);
    try{
      if(await onUseImage({blob:selected.blob,pieceId:version.piece_id,version:version.version})&&current===sequence.current){setAsset({scope,blob:selected.blob});setCandidate(null);setRecovery(false);setNotice('Imagem recuperada nesta versão.');}
    }catch{if(current===sequence.current)setNotice('Não foi possível preservar esta imagem.');}
    finally{if(current===sequence.current)setRecovering(false);}
  }
  return <div ref={frame} className="studio-variant-image">
    {url?<img src={url} alt={`Arte da versão ${version.version}`} loading="lazy" />:<p>Imagem da versão {version.version} ainda não disponível neste navegador.</p>}
    {!blob&&<button type="button" onClick={()=>setRecovery(value=>!value)}>Recuperar imagem da versão {version.version}</button>}
    {recovery&&<AssetRecovery userId={userId} projectId={projectId} pieceId={version.piece_id} version={version.version} onSelect={assetId=>void select(assetId)} />}
    {candidate&&candidate.scope===scope&&<div><p>Origem desconhecida. Confira a imagem antes de usá-la nesta versão.</p><img src={candidate.url} alt={`Imagem recuperada para a versão ${version.version}`} onLoad={()=>setCandidate(value=>value===candidate?{...value,decoded:true}:value)} onError={()=>{setCandidate(null);setNotice('A imagem recuperada não pôde ser exibida.');}} /><button type="button" disabled={!candidate.decoded||recovering} onClick={()=>void useCandidate()}>Usar imagem nesta versão</button></div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

'use client';
import {useEffect,useId,useRef,useState} from 'react';
import AssetRecovery from './asset-recovery';
import {fetchPrivateImage} from '../lib/private-image-fetch.ts';

import { uuid, markerSchema, storedImageSchema, type ImageSelection } from './studio-ui-types';
type AssetScope={userId:string;projectId:string;pieceId:string;version:number};
type AssetsProps=AssetScope & {canSave:boolean;preview:Blob|{blob:Blob}|null;onUseImage:(image:ImageSelection)=>Promise<boolean>};
type Upload={state:'loading'|'idle'|'unknown'|'unavailable'|'saved'|'saved_previous'|'error'|'too_large'|'invalid'|'validating'|'pending';assetId:string|null};
type Review={state:'idle';assetId?:never}|{state:'loading'|'unverified'|'invalid';assetId:string}|{state:'found';assetId:string;blob:Blob;url:string;decoded:boolean};
const MAX_UPLOAD=4*1024*1024;
const validScope=({userId,projectId,pieceId,version}:AssetScope)=>typeof userId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(userId)&&uuid(projectId)&&uuid(pieceId)&&Number.isSafeInteger(version)&&version>0&&version<=2147483647;
const readMarker=(key:string)=>{const raw=sessionStorage.getItem(key);if(raw===null)return null;const value=markerSchema.parse(JSON.parse(raw));if(!value||Object.keys(value).join(',')!=='assetId'||!uuid(value.assetId))throw Error('invalid marker');return value.assetId;};
function clearMarker(key:string,assetId:string){if(readMarker(key)!==assetId)return false;sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw Error('storage unavailable');return true;}

// Scope changes remount the state and abort all prior reads. Stored markers are
// only references; every read/write is authorized again by the server.
export default function StudioAssets(props:AssetsProps){
 if(!validScope(props))return <p>Salve a versão da peça para guardar ou recuperar imagens.</p>;
 return <ScopedAssets key={`${props.userId}:${props.projectId}:${props.pieceId}:${props.version}`} {...props}/>;
}

function ScopedAssets({userId,projectId,pieceId,version,canSave,preview,onUseImage}:AssetsProps){
 const png=preview instanceof Blob?preview:preview?.blob instanceof Blob?preview.blob:null;
 const markerKey=`compor-studio-image-upload:${userId}:${projectId}:${pieceId}:${version}`;
 const permissionId=useId(),riskId=useId();
 const [authorizedImage,setAuthorizedImage]=useState<Blob|null>(null),[upload,setUpload]=useState<Upload>({state:'loading',assetId:null});
 const authorized=png!==null&&authorizedImage===png;
 const [selection,setSelection]=useState<{assetId:string;origin:string;serial:number}|null>(null),[review,setReview]=useState<Review>({state:'idle'}),[listRevision,setListRevision]=useState(0);
 const [acknowledged,setAcknowledged]=useState(false),[useStateMessage,setUseStateMessage]=useState('');
 const mounted=useRef(false),uploadLock=useRef(false),sequence=useRef(0),current=useRef({png,authorized,canSave});
 current.current={png,authorized,canSave};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
 useEffect(()=>{
  try{const assetId=readMarker(markerKey);setUpload(assetId?{state:'unknown',assetId}:{state:'idle',assetId:null});}
  catch{setUpload({state:'unavailable',assetId:null});}
 },[markerKey]);
 useEffect(()=>{setUpload(old=>['saved','saved_previous','error','too_large','invalid'].includes(old.state)?{state:'idle',assetId:null}:old);},[png]);
 useEffect(()=>{
  const serial=++sequence.current;setAcknowledged(false);setUseStateMessage('');
  if(!selection){setReview({state:'idle'});return;}
  const controller=new AbortController();let url:string|undefined;
  setReview({state:'loading',assetId:selection.assetId});
  const query=new URLSearchParams({projectId,pieceId,version:String(version),assetId:selection.assetId});
  fetchPrivateImage(query,{signal:controller.signal}).then(blob=>{
   if(controller.signal.aborted||serial!==sequence.current)return;
   url=URL.createObjectURL(blob);setReview({state:'found',assetId:selection.assetId,blob,url,decoded:false});
  }).catch(()=>{if(!controller.signal.aborted&&serial===sequence.current)setReview({state:'unverified',assetId:selection.assetId});});
  return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
 },[selection,projectId,pieceId,version]);
 function select(assetId:unknown,origin='listed'){
  if(!uuid(assetId))return;
  setSelection(old=>({assetId,origin,serial:(old?.serial??0)+1}));
 }
 async function save(){
  if(!png||!authorized||!canSave||uploadLock.current||['loading','validating','pending','unknown','unavailable'].includes(upload.state))return;
  if(png.size>MAX_UPLOAD){setUpload({state:'too_large',assetId:null});return;}
  if(png.type!=='image/png'||!png.size){setUpload({state:'invalid',assetId:null});return;}
  uploadLock.current=true;setUpload({state:'validating',assetId:null});
  let assetId:string|undefined,dispatched=false;
  try{
   const bytes=new Uint8Array(await png.slice(0,8).arrayBuffer());
   if(![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)){if(mounted.current)setUpload({state:'invalid',assetId:null});return;}
   if(!mounted.current||current.current.png!==png||!current.current.authorized||!current.current.canSave){if(mounted.current)setUpload({state:'idle',assetId:null});return;}
   // Another mounted view may already have submitted this scope. Never
   // overwrite its reference, including after an uncertain response.
   const existing=readMarker(markerKey);if(existing){setUpload({state:'unknown',assetId:existing});return;}
   assetId=crypto.randomUUID();const marker=JSON.stringify({assetId});sessionStorage.setItem(markerKey,marker);
   if(sessionStorage.getItem(markerKey)!==marker)throw Error('storage unavailable');
   setUpload({state:'pending',assetId});dispatched=true;
   const query=new URLSearchParams({projectId,pieceId,version:String(version),assetId});
   const response=await fetch(`/api/images?${query}`,{method:'POST',headers:{'content-type':'image/png'},body:png,cache:'no-store'});
   const result=storedImageSchema.safeParse(await response.json().catch(()=>null));
   const stored=response.status===201&&result.success&&result.data.status==='stored'&&result.data.assetId===assetId;
   const rejected=[400,401,403,404,413].includes(response.status);
   if(stored||rejected){
    if(!clearMarker(markerKey,assetId)){if(mounted.current)setUpload({state:'unavailable',assetId});return;}
    if(mounted.current){setUpload({state:stored?(current.current.png===png?'saved':'saved_previous'):'error',assetId:stored?assetId:null});if(stored)setListRevision(old=>old+1);}
   }else if(mounted.current)setUpload({state:'unknown',assetId});
  }catch{if(mounted.current)setUpload({state:dispatched?'unknown':'unavailable',assetId:assetId??null});}
  finally{uploadLock.current=false;}
 }
 function release(){
  if(upload.state!=='unknown'||!upload.assetId||!acknowledged||review.assetId!==upload.assetId||!['found','unverified','invalid'].includes(review.state))return;
  try{if(!clearMarker(markerKey,upload.assetId))throw Error('changed marker');setUpload({state:'idle',assetId:null});setAuthorizedImage(null);current.current.authorized=false;setSelection(null);}
  catch{setUpload({state:'unavailable',assetId:upload.assetId});}
 }
 async function useImage(){
  if(review.state!=='found'||!review.decoded||typeof onUseImage!=='function')return;
  const selected=review,serial=sequence.current;setUseStateMessage('');
  try{await onUseImage({blob:selected.blob,pieceId,version});if(mounted.current&&serial===sequence.current)setUseStateMessage('Imagem selecionada para a composição.');}
  catch{if(mounted.current&&serial===sequence.current)setUseStateMessage('Não foi possível usar a imagem. Confira a composição.');}
 }
 const blocked=['loading','validating','pending','unknown','unavailable'].includes(upload.state);
 return <section className="studio-assets" aria-label="Imagens da versão">
  <h3>Imagem final no projeto</h3>
  <p>O PNG final só é guardado quando você confirma o envio para esta versão.</p>
  <label htmlFor={permissionId}><input id={permissionId} type="checkbox" checked={authorized} disabled={!png||!canSave||blocked} onChange={event=>{current.current.authorized=event.target.checked;setAuthorizedImage(event.target.checked?png:null);}}/>Tenho autorização para guardar esta imagem no projeto</label>
  <button type="button" disabled={!png||!canSave||!authorized||blocked} onClick={save}>Salvar PNG final no projeto</button>
  {!canSave&&<p>Salve a versão da peça antes de guardar o PNG final.</p>}
  {['pending','validating'].includes(upload.state)&&<p role="status">Enviando imagem…</p>}
  {upload.state==='saved'&&<p role="status">PNG final salvo na versão {version}.</p>}
  {upload.state==='saved_previous'&&<p role="status">O PNG enviado antes da troca foi salvo na versão {version}. A prévia atual ainda não foi salva.</p>}
  {upload.state==='too_large'&&<p role="alert">O PNG final deve ter no máximo 4 MiB.</p>}
  {upload.state==='invalid'&&<p role="alert">Escolha uma prévia PNG válida antes de salvar.</p>}
  {upload.state==='error'&&<p role="alert">O envio foi recusado. Confira a imagem e a sessão antes de tentar novamente.</p>}
  {upload.state==='unavailable'&&<p role="alert">Não foi possível preservar a referência do envio nesta aba. O envio está bloqueado para evitar repetição incerta.</p>}
  {upload.state==='unknown'&&<div>
   <p role="alert">O resultado do envio é desconhecido. Referência: {upload.assetId}. A imagem não será reenviada automaticamente.</p>
   <button type="button" disabled={review.state==='loading'} onClick={()=>select(upload.assetId,'pending')}>Consultar a mesma referência</button>
   {review.assetId===upload.assetId&&['found','unverified','invalid'].includes(review.state)&&<><label htmlFor={riskId}><input id={riskId} type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/>Entendo que o envio anterior pode ter sido concluído e um novo envio pode criar uma cópia.</label><button type="button" disabled={!acknowledged} onClick={release}>Permitir novo envio</button></>}
  </div>}
  <AssetRecovery key={listRevision} userId={userId} projectId={projectId} pieceId={pieceId} version={version} onSelect={assetId=>select(assetId)}/>
  {review.state==='loading'&&<p role="status">Consultando a imagem selecionada…</p>}
  {review.state==='unverified'&&<p role="alert">Não foi possível confirmar a imagem. Um envio anterior ainda pode ser concluído.</p>}
  {review.state==='invalid'&&<p role="alert">A imagem recuperada não pôde ser exibida. A referência continua com origem desconhecida.</p>}
  {review.state==='found'&&<div>
   <p>Origem desconhecida. Confira a imagem antes de usar; encontrar a referência não comprova sua origem ou integridade.</p>
   <img className="studio-asset-preview" src={review.url} alt="Imagem recuperada para revisão" onLoad={()=>setReview(old=>old===review&&old.state==='found'?{...old,decoded:true}:old)} onError={()=>setReview(old=>old===review&&old.state==='found'?{state:'invalid',assetId:old.assetId}:old)}/>
   <button type="button" disabled={!review.decoded||typeof onUseImage!=='function'} onClick={useImage}>Usar imagem na composição</button>
  </div>}
  {useStateMessage&&<p role="status">{useStateMessage}</p>}
 </section>;
}

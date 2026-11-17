import {validateVisualInputManifest, validateVisualReferenceSelection, parseVisualInputManifest, type LocalVisualInputManifest, type VisualInputManifest, type VisualMime} from '@compor/agents-api/visual-input-contract';
import {referenceSchema, type StudioReference} from './studio-domain.ts';
import type {StoredReference} from './studio-storage.ts';
import {studioImageDimensions, studioImageDimensionsMatch} from './studio-image.ts';

export type SelectedVisualInput = {manifest:VisualInputManifest;blobs:Blob[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=()=>Error('Não foi possível preparar as imagens selecionadas.');
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const hash=async(blob:Blob)=>hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));

/** Selection is supplied by the current conversation, not reconstructed from the library. */
export function selectedLocalUploads(references:readonly StudioReference[]):StudioReference[]{
  if(!Array.isArray(references)||references.length>20)throw invalid();
  const seen=new Set<string>();
  return references.filter(reference=>{
    if(!referenceSchema.safeParse(reference).success||!uuid.test(reference.id)||seen.has(reference.id.toLowerCase()))throw invalid();
    seen.add(reference.id.toLowerCase());
    return !!reference.source&&'kind' in reference.source&&reference.source.kind==='local-upload';
  });
}

async function optimize(file:Blob,maxBytes:number):Promise<{file:Blob;width:number;height:number}>{
  const image=await createImageBitmap(file),canvas=document.createElement('canvas');
  try{
    const context=canvas.getContext('2d');if(!context)throw invalid();
    let width=image.width,height=image.height;
    for(let attempt=0;attempt<16;attempt++){
      canvas.width=width;canvas.height=height;context.drawImage(image,0,0,width,height);
      const qualities=file.type==='image/jpeg'?[0.92,0.78,0.62,0.45]:[undefined];
      let size=0;
      for(const quality of qualities){
        const copy=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,file.type,quality));
        if(!copy||copy.type!==file.type||copy.size===0)throw invalid();
        if(copy.size<=maxBytes)return {file:copy,width,height};
        size=copy.size;
      }
      const scale=Math.max(0.4,Math.min(0.8,Math.sqrt(maxBytes/size)*0.85));
      const nextWidth=Math.max(1,Math.floor(width*scale)),nextHeight=Math.max(1,Math.floor(height*scale));
      if(nextWidth===width&&nextHeight===height)break;
      width=nextWidth;height=nextHeight;
    }
    throw Error('As imagens excedem o limite de envio. Reduza a seleção.');
  }finally{image.close();canvas.width=0;canvas.height=0;}
}

type PrepareOptions={references:readonly StudioReference[];loadReference:(id:string)=>Promise<StoredReference|null|undefined>;maxBytes?:number};
async function prepareVisualEntries(selected:StudioReference[],loadReference:PrepareOptions['loadReference'],maxBytes:number){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024)throw invalid();
  if(typeof loadReference!=='function')throw invalid();
  const sources=[];
  for(const reference of selected){
    const stored=await loadReference(reference.id),file=stored?.file;
    if(!stored||JSON.stringify(stored.metadata)!==JSON.stringify(reference)||!(file instanceof Blob)||file.type!==reference.mime||file.size!==reference.size||file.size<1||file.size>8*1024*1024)throw invalid();
    const dimensions=await studioImageDimensions(file),decoded=await createImageBitmap(file);
    try{if(!await studioImageDimensionsMatch(file,dimensions,decoded)||decoded.width!==reference.width||decoded.height!==reference.height)throw invalid();}
    finally{decoded.close();}
    sources.push({reference,file});
  }
  let remaining=maxBytes,count=sources.length;
  const budgets=sources.map(item=>item.file.size);
  for(const {size,index} of sources.map((item,index)=>({size:item.file.size,index})).sort((a,b)=>a.size-b.size)){const budget=Math.min(size,Math.floor(remaining/count));budgets[index]=budget;remaining-=budget;count--;}
  if(budgets.some(budget=>budget<1))throw invalid();
  const entries:Array<LocalVisualInputManifest['entries'][number]>=[],blobs:Blob[]=[];
  for(const [index,{reference,file}] of sources.entries()){
    const transport=file.size<=budgets[index]?{file,width:reference.width,height:reference.height}:await optimize(file,budgets[index]);
    const originalHash=await hash(file),transportHash=transport.file===file?originalHash:await hash(transport.file);
    entries.push({id:reference.id.toLowerCase(),ordinal:index+1,role:'reference',inputOrigin:'local-upload',original:{sha256:originalHash,mime:reference.mime,byteLength:file.size},transport:{sha256:transportHash,mime:reference.mime,byteLength:transport.file.size,width:transport.width,height:transport.height},transformation:transport.file===file?'none':'optimized-v1'});
    blobs.push(transport.file);
  }
  return {entries,blobs};
}

/** Freeze a single transport once; no credentials, URLs or base64 are retained. */
export async function prepareSelectedVisualInput({references,loadReference,maxBytes=2*1024*1024}:PrepareOptions):Promise<SelectedVisualInput>{
  const {entries,blobs}=await prepareVisualEntries(selectedLocalUploads(structuredClone(references)),loadReference,maxBytes);
  const manifest={version:1,policy:'optimized-v1',entries} as const;
  if(!validateVisualInputManifest(manifest))throw invalid();
  return {manifest,blobs};
}

/** Freeze the actual human selection as candidates; absence of provenance stays excluded. */
export async function prepareSelectedVisualCandidates({references,loadReference,maxBytes=2*1024*1024,projectId,externalConsent}:{references:readonly StudioReference[];loadReference:PrepareOptions['loadReference'];maxBytes?:number;projectId:string;externalConsent:boolean}):Promise<SelectedVisualInput>{
  if(!uuid.test(projectId)||typeof externalConsent!=='boolean')throw invalid();
  references=structuredClone(references);
  // Validate the full selection and reject duplicate IDs before inspecting origin.
  selectedLocalUploads(references);
  const selected=references.filter(reference=>{
    const source=reference.source;if(!source)return false;
    if('originUrl' in source){if(!externalConsent)throw Error('Autorize referências externas antes de incluí-las.');return true;}
    if(source.kind==='generated'&&source.projectId.toLowerCase()!==projectId.toLowerCase())throw invalid();
    return true;
  });
  const {entries,blobs}=await prepareVisualEntries(selected,loadReference,maxBytes);
  const candidateEntries=entries.map((entry,index)=>{
    const source=selected[index].source;
    if(!source)throw invalid();
    if('originUrl' in source)return {...entry,inputOrigin:'external' as const,source:{originUrl:source.originUrl,board:source.board}};
    if(source.kind==='generated')return {...entry,inputOrigin:'generated' as const,source:{projectId:source.projectId.toLowerCase(),imageId:source.imageId.toLowerCase()}};
    return {...entry,inputOrigin:'local-upload' as const,source:null};
  });
  const manifest={version:2,policy:'optimized-v1',externalConsent,entries:candidateEntries} as const;
  if(!validateVisualInputManifest(manifest))throw invalid();
  return {manifest,blobs};
}

/** Recheck persisted blobs every time before an effect; never silently replace an evicted blob. */
export async function validateVisualSnapshot(snapshot:SelectedVisualInput):Promise<void>{
  if(!snapshot||!validateVisualInputManifest(snapshot.manifest)||!Array.isArray(snapshot.blobs)||snapshot.blobs.length!==snapshot.manifest.entries.length||snapshot.blobs.length>20)throw invalid();
  let total=0;const ids=new Set<string>();
  for(const [index,entry] of snapshot.manifest.entries.entries()){
    const file=snapshot.blobs[index];
    if(!file||!(file instanceof Blob)||entry.ordinal!==index+1||entry.role!=='reference'||!uuid.test(entry.id)||ids.has(entry.id.toLowerCase())||file.type!==entry.transport.mime||file.size!==entry.transport.byteLength||file.size<1||await hash(file)!==entry.transport.sha256)throw invalid();
    ids.add(entry.id.toLowerCase());total+=file.size;if(total>2*1024*1024)throw invalid();
    const dimensions=await studioImageDimensions(file),decoded=await createImageBitmap(file);
    try{if(!await studioImageDimensionsMatch(file,dimensions,decoded)||decoded.width!==entry.transport.width||decoded.height!==entry.transport.height)throw invalid();}
    finally{decoded.close();}
  }
}

export async function visualInputImages(snapshot:SelectedVisualInput):Promise<{id:string;mime:VisualMime;data:string}[]>{
  await validateVisualSnapshot(snapshot);
  const images=[];
  for(const [index,entry] of snapshot.manifest.entries.entries()){
    const bytes=new Uint8Array(await snapshot.blobs[index].arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    images.push({id:entry.id,mime:entry.transport.mime,data:btoa(binary)});
  }
  return images;
}

/** The signed plan determines the subset; this function never rereads today's selection. */
export async function selectedVisualInputImages(input:SelectedVisualInput,ids:readonly string[]):Promise<{id:string;mime:VisualMime;data:string}[]>{
  const snapshot={manifest:parseVisualInputManifest(input.manifest),blobs:[...input.blobs]},selection=[...ids];
  if(!validateVisualReferenceSelection(snapshot.manifest,selection))throw invalid();
  await validateVisualSnapshot(snapshot);
  const wanted=new Set(selection),images=[];
  for(const [index,entry] of snapshot.manifest.entries.entries()){
    if(!wanted.has(entry.id))continue;
    const bytes=new Uint8Array(await snapshot.blobs[index].arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    images.push({id:entry.id,mime:entry.transport.mime,data:btoa(binary)});
  }
  return images;
}

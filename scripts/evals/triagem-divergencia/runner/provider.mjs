import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {createManagedExplorationPlanProvider} from '../../../../packages/agents-api/src/exploration-plan-provider.mjs';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {createImageHandler} from '../../../../packages/images-api/src/index.mjs';
import {parseVisualInput} from '../../../../packages/agents-api/src/visual-input.mjs';
import {parseCandidateOutput} from '../planner/candidate.mjs';
import {digest,fingerprint} from './ledger.mjs';

const pngDecoder=fileURLToPath(new URL('./validate-png.py',import.meta.url));
const python=process.env.COMPOR_EVAL_PYTHON||'python3';
const decoderOptions={timeout:30000,stdio:['pipe','ignore','ignore']};
let decoderReady=false;
function ensurePngDecoder(){
  if(decoderReady)return;
  const check=spawnSync(python,['-I','-B','-c','from PIL import Image, ImageFile'],decoderOptions);
  if(check.status!==0)throw Error('png_decoder_unavailable');
  decoderReady=true;
}
function validatePng(bytes){
  const result=spawnSync(python,['-I','-B',pngDecoder],{...decoderOptions,input:bytes});
  if(result.status!==0)throw Error('invalid_image_png');
}

const origin='https://api.openai.com';
const placeholder='sk-local-evaluation-only-no-provider-credential';
const sessionId=value=> typeof value==='string' && /^sess_[a-zA-Z0-9_-]{1,128}$/.test(value);
const requestId=res=>{const id=res.headers.get('x-request-id');return /^[A-Za-z0-9_-]{1,160}$/.test(id??'')?id:null;};
const counts=value=>Object.fromEntries(Object.entries(value??{}).filter(([,n])=>Number.isSafeInteger(n)&&n>=0));
function withCredential(init,key){
  const headers=new Headers(init.headers);
  if(headers.get('authorization')!=='Bearer '+placeholder||init.redirect!=='error')throw Error('unexpected_transport');
  headers.set('authorization','Bearer '+key);
  return {...init,headers};
}

export async function planCase({ledger,id,packet,instructions=null,key,fetchApi=fetch}){
  const {context,visualInput,referenceImages}=packet;
  parseVisualInput(visualInput,referenceImages);
  const binding={context,visualInput,instructions};
  let prior=ledger.get(id);
  if(prior && prior.binding!==fingerprint(binding))throw Error('plan_binding_changed');
  if(prior && !['submitted','bound'].includes(prior.state))return prior;
  if(prior && !sessionId(prior.result.sid))return prior;
  const provider=createManagedExplorationPlanProvider({apiKey:placeholder,fetch:async(url,init)=>{
    const u=new URL(url);
    if(u.origin!==origin||u.username||u.password||u.hash)throw Error('invalid_origin');
    const opts=withCredential(init,key);
    if(init.method==='POST'){
      if(u.pathname!=='/v1/agents/sessions'||u.search)throw Error('invalid_endpoint');
      const body=JSON.parse(init.body);
      if(instructions!==null)body.agent.instructions=instructions;
      opts.body=JSON.stringify(body);
      ledger.reserve(id,'plan',binding);
    }else {
      const base='/v1/agents/sessions/'+ledger.get(id)?.result.sid;
      const allowed=(u.pathname===base&&!u.search)||(u.pathname===base+'/turns'&&u.search==='?limit=100&order=desc')||
        (u.pathname.startsWith(base+'/turns/')&&/^turn_[A-Za-z0-9_-]+\/items$/.test(u.pathname.slice((base+'/turns/').length))&&u.search==='?limit=100&order=asc');
      if(init.method!=='GET'||!allowed)throw Error('invalid_read');
    }
    const response=await fetchApi(u,opts);
    if(init.method==='POST'){
      if(response.ok){
        const value=await response.clone().json();
        if(sessionId(value.id))ledger.update(id,'bound',{sid:value.id,requestId:requestId(response)});
      }else ledger.update(id,'rejected',{http:response.status,requestId:requestId(response)});
    }else if(response.ok&&u.pathname.endsWith('/'+ledger.get(id).result.sid)){
      const value=await response.clone().json();
      if(value.usage)ledger.update(id,'bound',{usage:counts(value.usage)});
    }
    return response;
  }});
  if(!prior){
    try{await provider.create({context,visualInput,referenceImages});}
    catch(error){if(!ledger.get(id))throw error;return ledger.get(id);}
  }
  prior=ledger.get(id);
  if(prior?.state!=='bound')return prior;
  const deadline=Date.now()+360000;
  while(Date.now()<deadline){
    let turn;
    try{turn=await provider.get({sessionId:prior.result.sid});}
    catch{await sleep(2800);continue;}
    if(turn.status==='running'){await sleep(2200);continue;}
    if(turn.status==='failed'){ledger.update(id,'rejected',{reason:'provider_turn_failed'});break;}
    const parsed=instructions===null?{plan:validateExplorationPlan(turn.plan,context,visualInput),referenceReadings:null}:parseCandidateOutput(turn.plan,context,visualInput);
    ledger.update(id,parsed?.plan?'complete':'invalid',{turnId:turn.turnId,raw:turn.plan,...(parsed?.plan?parsed:{})});
    break;
  }
  return ledger.get(id);
}

export async function imageSlot({ledger,id,prompt,images,file,key,fetchApi=fetch}){
  const settings={model:'gpt-image-2.6-flare',size:'1024x1280',quality:'auto',output_format:'png',n:1};
  const binding={settings,prompt,files:images.map(i=>({id:i.id,sha256:digest(Buffer.from(i.data,'base64'))}))};
  const prior=ledger.get(id);
  if(prior){
    if(prior.binding!==fingerprint(binding))throw Error('image_binding_changed');
    if(prior.state==='complete'){
      if(!existsSync(file))throw Error('stored_image_changed');
      const bytes=readFileSync(file);
      if(digest(bytes)!==prior.result.sha256)throw Error('stored_image_changed');
      ensurePngDecoder();
      validatePng(bytes);
    }
    return prior;
  }
  ensurePngDecoder();
  const handler=createImageHandler({authenticate:async()=>({userId:'synthetic-evaluation'}),fetch:async(url,init)=>{
    if(url!==origin+'/v1/images/'+(images.length?'edits':'generations')||init.method!=='POST')throw Error('invalid_image_transport');
    const opts=withCredential(init,key);
    const body=init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body);
    if(Object.entries(settings).some(([k,v])=>String(body[k])!==String(v))||body.prompt!==prompt)throw Error('image_parameters_changed');
    const files=init.body instanceof FormData?init.body.getAll('image[]'):[];
    if(files.length!==images.length)throw Error('image_count_changed');
    for(let i=0;i<files.length;i++){
      if(files[i].type!==images[i].mime||digest(Buffer.from(await files[i].arrayBuffer()))!==binding.files[i].sha256)throw Error('sent_image_changed');
    }
    ledger.reserve(id,'image',binding);
    const response=await fetchApi(url,opts);
    const meta={http:response.status,requestId:requestId(response)};
    if(!response.ok)ledger.update(id,'unknown',meta);
    else ledger.update(id,'bound',meta);
    return response;
  }});
  const response=await handler(new Request('http://localhost/eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:placeholder,authorizeGeneration:true,prompt,images:images.map(({mime,data})=>({mime,data}))})}));
  if(!response.ok){
    const saved=ledger.get(id);
    if(!saved)throw Error('unsent_invalid_image');
    if(['bound','submitted'].includes(saved.state))ledger.update(id,'unknown',{});
    return ledger.get(id);
  }
  const output=await response.json(),bytes=Buffer.from(output.imageBase64,'base64');
  try{validatePng(bytes);}
  catch(error){
    ledger.update(id,'unknown',{reason:'invalid_image_png'});
    throw error;
  }
  writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  ledger.update(id,'complete',{sha256:digest(bytes),bytes:bytes.length,usage:output.usage,promptHash:digest(prompt),referenceIds:images.map(x=>x.id),delivered:binding.files,settingsSha256:fingerprint(settings),model:settings.model});
  return ledger.get(id);
}

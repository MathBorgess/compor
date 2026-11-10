import {setTimeout as delay} from 'node:timers/promises';
import {once} from 'node:events';

export async function stopApp(child,{graceMs=5000}={}) {
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const graceful=once(child,'exit',{signal:AbortSignal.timeout(graceMs)});
  child.kill('SIGTERM');
  try{await graceful;return;}catch(error){
    if(!(error instanceof Error)||error.name!=='AbortError')throw error;
  }
  if(child.exitCode!==null||child.signalCode!==null)return;
  const stopped=once(child,'exit',{signal:AbortSignal.timeout(2000)});
  child.kill('SIGKILL');
  await stopped;
}

export async function waitForApp({url,child,signal,headers, nextApp=false,diagnostics=()=>'',timeoutMs=30000}) {
  const deadline=Date.now()+timeoutMs;
  const origin=new URL(url).origin;
  const requestSignal=()=>AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-Date.now())))]);
  async function read(target) {
    if(Date.now()>=deadline)throw Error('prazo de startup esgotado');
    const response=await fetch(target,{headers,signal:requestSignal(),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
    return response.text();
  }
  let observed='nenhuma resposta';
  while(Date.now()<deadline&&!signal.aborted&&child.exitCode===null&&child.signalCode===null){
    try{
      const body=await read(url);
      if(!nextApp)return;
      // The signed-out proxy is already HTTP 200 before the authenticated App Router and its assets compile.
      const assets=[...new Set([...body.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].flatMap(([,path])=>{
        const asset=new URL(path.replaceAll('&amp;','&'),url);
        return asset.origin===origin&&/^\/_next\/static\/.*\.(?:js|css)$/.test(asset.pathname)?[asset.href]:[];
      }))];
      if(!assets.some(asset=>new URL(asset).pathname.endsWith('.js')))observed='HTML do App Router não observado';
      else {
        const results=await Promise.allSettled(assets.map(read));
        const failed=results.find(result=>result.status==='rejected');
        if(failed)throw failed.reason;
        return;
      }
    }catch(error){observed=error instanceof Error?`${error.name}: ${error.message}`:'falha HTTP';}
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    await delay(Math.min(100,remaining),undefined,{signal});
  }
  throw Error(`Aplicação indisponível (${observed}; exit=${child.exitCode}; signal=${child.signalCode}). ${diagnostics()}`);
}

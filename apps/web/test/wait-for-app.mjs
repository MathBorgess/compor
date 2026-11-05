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

export async function waitForApp({url,child,signal,diagnostics=()=>'',timeoutMs=30000}) {
  const deadline=Date.now()+timeoutMs;
  let observed='nenhuma resposta';
  while(Date.now()<deadline&&!signal.aborted&&child.exitCode===null&&child.signalCode===null){
    const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-Date.now())))]);
    try{
      const response=await fetch(url,{signal:requestSignal});
      observed=`HTTP ${response.status}`;
      await response.body?.cancel();
      if(response.ok)return;
    }catch(error){observed=error instanceof Error?error.name:'falha HTTP';}
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    await delay(Math.min(100,remaining),undefined,{signal});
  }
  throw Error(`Aplicação indisponível (${observed}; exit=${child.exitCode}; signal=${child.signalCode}). ${diagnostics()}`);
}

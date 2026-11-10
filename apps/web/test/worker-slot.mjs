import {closeSync, mkdirSync, openSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function claimWorker(runRoot) {
  const leases=join(runRoot,'leases');
  mkdirSync(leases,{recursive:true});
  for(const slot of [0,1]) {
    const lease=join(leases,String(slot));
    let descriptor;
    try { descriptor=openSync(lease,'wx'); }
    catch(error) {
      if(error.code==='EEXIST')continue;
      throw error;
    }
    try { writeFileSync(descriptor,JSON.stringify({pid:process.pid})+'\n'); }
    catch(error) {
      try { closeSync(descriptor); }
      finally { rmSync(lease,{force:true}); }
      throw error;
    }
    closeSync(descriptor);
    let released=false;
    return {
      root:join(runRoot,'workers',String(slot)),
      slot,
      release() {
        if(released)return;
        rmSync(lease,{force:true});
        released=true;
      },
    };
  }
  throw Error('Nenhum worker de navegador livre (2 slots).');
}

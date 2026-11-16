import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {digestJson,sha256} from './contracts.mjs';

export function trustPath(root){return process.env.COMPOR_VERIFICATION_TRUST??join(homedir(),'.local/state/compor-verification',sha256(root).slice(0,20),'trusted-suite.json');}
export async function freezeSuite(root,source){
  const path=trustPath(root),entries=source.entries.filter(entry=>entry.path.startsWith('scripts/verification/'));
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const value={schemaVersion:'trusted-suite/v1',suiteDigest:digestJson(entries),entries,createdAt:new Date().toISOString()};
  // Explicit initial review operation. Never replace a baseline during prepare/run.
  await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});
  return {path,suiteDigest:value.suiteDigest};
}
export async function trustedSuite(root,source){
  const path=trustPath(root);
  const value=JSON.parse(await readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')throw Error('trusted_suite_missing: review the suite and use freeze-suite once');throw error;}));
  if(value.schemaVersion!=='trusted-suite/v1'||digestJson(value.entries)!==value.suiteDigest)throw Error('trusted_suite_invalid');
  if(source.suiteDigest!==value.suiteDigest)throw Error('trusted_suite_changed: evaluator changes require separate owner review and a new trust file');
  return {path,suiteDigest:value.suiteDigest};
}

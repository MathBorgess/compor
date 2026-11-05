import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const compiled=new Map();
export async function browserModuleSource(url){
  const path=fileURLToPath(url);
  if(!compiled.has(path))compiled.set(path,build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}).then(result=>result.outputFiles[0].text));
  return compiled.get(path);
}

import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,linkSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {plannerInstructions,assessDivergence,buildDivergenceReview} from '../planner/candidate.mjs';
import {openLedger,fingerprint,digest} from './ledger.mjs';
import {planCase,imageSlot} from './provider.mjs';

const read=file=>JSON.parse(readFileSync(file,'utf8'));
export function keep(file,value){
  const json=JSON.stringify(value,null,2)+'\n';
  if(existsSync(file)){
    if(readFileSync(file,'utf8')!==json)throw Error('artifact_changed: '+file);
    return;
  }
  const tmp=file+'.'+randomUUID()+'.tmp';
  writeFileSync(tmp,json,{flag:'wx',mode:0o600});
  try{linkSync(tmp,file);}finally{unlinkSync(tmp);}
}
export function getCorpusHash(){
  return fingerprint(cases.flatMap(c=>['with','without'].map(arm=>packet(c.id,arm))));
}
function getKey(){
  // Keys pass via stdin, or the local macOS pasteboard, never via argv, files or environment.
  let secret;
  try{
    secret=process.platform==='darwin'&&!process.env.COMPOR_EVAL_KEY_STDIN
      ?execFileSync('/usr/bin/pbpaste',{maxBuffer:4096,stdio:['ignore','pipe','ignore']}).toString().trim():readFileSync(0,'utf8').trim();
  }catch{throw Error('credential_input_unavailable');}
  if(!/^sk-[A-Za-z0-9_-]{20,300}$/.test(secret))throw Error('clipboard_or_stdin_has_no_key');
  return secret;
}
function safeRoot(value){
  if(!value)throw Error('explicit_evidence_directory_required');
  const dir=resolve(value);
  if(dir===homedir()||dir===process.cwd())throw Error('dedicated_directory_required');
  return dir;
}
function roundSpec(root,round){
  const file=join(root,'round-'+round,'revision.json');
  const spec=read(file);
  if(spec.round!==round||typeof spec.revision!=='string'||!spec.hypothesis||spec.corpus!==getCorpusHash())throw Error('invalid_revision');
  if(round===0){if(spec.revision!==''||spec.parentFeedback!==null)throw Error('invalid_baseline');}
  else{
    const previous=join(root,'round-'+(round-1),'feedback-development.json');
    if(spec.parentFeedback!==digest(readFileSync(previous)))throw Error('previous_feedback_changed');
  }
  return spec;
}
function experimentSources(){
  const root=fileURLToPath(new URL('../../../../',import.meta.url));
  const files=['packages/agents-api/src/agent-model.mjs','packages/agents-api/src/exploration-plan-provider.mjs',
    'packages/agents-api/src/visual-triage-instructions.mjs','packages/agents-api/src/exploration-plan-contract.mjs','packages/agents-api/src/visual-input.mjs','packages/agents-api/src/visual-input-contract.mjs',
    'packages/images-api/src/index.mjs',...['dataset/freeze.json','planner/candidate.mjs','plan-judge/round.mjs','plan-judge/group.mjs',
      'plan-judge/triage.mjs','plan-judge/strip.py','pixels/judge.py','metrics/index.mjs','metrics/report.mjs','runner/refine.py',
      'runner/validate-png.py','runner/provider.mjs'].map(file=>'scripts/evals/triagem-divergencia/'+file)];
  return Object.fromEntries(files.map(file=>[file,digest(readFileSync(join(root,file)))]));
}
function init(root,images){
  if(![60,180].includes(images))throw Error('provide_approved_image_allowance');
  mkdirSync(root,{recursive:true,mode:0o700});
  if(existsSync(join(root,'protocol.json')))throw Error('trial_already_initialized');
  const protocol={version:1,sources:experimentSources(),plans:60,images,caseIds:cases.map(c=>c.id),corpus:getCorpusHash(),pixelRounds:images===60?[0,5]:[0,1,2,3,4,5],paired:'same accepted with-plan prompts and original order, optional bytes removed'};
  keep(join(root,'protocol.json'),protocol);
  mkdirSync(join(root,'round-0'),{mode:0o700});
  keep(join(root,'round-0','revision.json'),{round:0,revision:'',hypothesis:'Control with the unchanged product planner.',parentFeedback:null,corpus:protocol.corpus});
}
export function matchedInputs(plan,entry){
  const optional=entry.rubric.optionalId;
  const selected=entry.referenceImages.filter(im=>plan.referenceIds.includes(im.id));
  if(!selected.some(im=>im.id===optional))return null;
  return {with:selected,without:selected.filter(im=>im.id!==optional)};
}
async function run(root,round,mode){
  if(!Number.isInteger(round)||round<0||round>5||!['plans','pixels'].includes(mode))throw Error('unknown_round');
  const protocol=read(join(root,'protocol.json')),spec=roundSpec(root,round);
  if(protocol.corpus!==getCorpusHash()||fingerprint(protocol.sources)!==fingerprint(experimentSources()))throw Error('frozen_experiment_changed');
  if(mode==='pixels'&&!protocol.pixelRounds.includes(round))throw Error('not_a_pixel_round');
  const db=openLedger(join(root,'receipts.sqlite'),protocol);
  const key=getKey(),roundDir=join(root,'round-'+round);
  try{
    for(const c of cases){
      const makeDir=arm=>{const dir=join(roundDir,c.id,arm);mkdirSync(dir,{recursive:true,mode:0o700});return dir;};
      if(mode==='plans'){
        for(const arm of ['with','without']){
          const dir=makeDir(arm),id=[round,c.id,arm,'plan'].join('/'),p=packet(c.id,arm);
          const saved=await planCase({ledger:db,id,packet:p,instructions:round===0?null:plannerInstructions(spec.revision),key});
          if(!saved||['bound','submitted'].includes(saved.state))throw Error('plan_uncertain_reconcile_same_receipt '+id);
          if(saved.result.http===401||saved.result.http===403||saved.result.http===429)throw Error('plan_credential_or_limit '+id);
          keep(join(dir,'plan.json'),{state:saved.state,plan:saved.result.plan??null,referenceReadings:saved.result.referenceReadings??null,raw:saved.result.raw??null,sid:saved.result.sid??null,usage:saved.result.usage??null});
          console.log(id,saved.state);
        }
      }else{
        const dir=makeDir('with'),source=read(join(dir,'plan.json')),review=read(join(dir,'review.json'));
        let reason=source.state==='complete'?'':'plan_unavailable';
        if(!reason && review.decision!=='admit')reason='held_before_dispatch';
        const entry=packet(c.id,'with');
        if(!reason){
          const saved=db.get([round,c.id,'with','plan'].join('/'));
          if(saved?.state!=='complete'||fingerprint(saved.result.plan)!==fingerprint(source.plan)||
              !validateCompletedExplorationPlan(source.plan,entry.context,entry.visualInput))throw Error('stored_dispatch_plan_changed');
          if(review.subject!==buildDivergenceReview(entry.context,source.plan).subject)throw Error('critic_receipt_mismatch');
          if(!review.critique || assessDivergence(entry.context,source.plan,review.critique).decision!=='admit')throw Error('unverified_critic_receipt');
        }
        const refs=reason?null:matchedInputs(source.plan,entry);
        if(!reason&&!refs)reason='identical_after_triage';
        if(reason){keep(join(roundDir,c.id,'ablation.json'),{state:'not-submitted',reason});continue;}
        for(const arm of ['with','without']){
          const target=makeDir(arm);
          const ids=source.plan.items.map(item=>[round,c.id,arm,item.position].join('/'));
          const prior=ids.map(id=>db.get(id));
          if(prior.some(r=>r)&&prior.some(r=>r?.state!=='complete'))throw Error('partial_lot_no_resubmit');
          if(prior.every(r=>!r)){
            let wait;
            while((wait=db.admitLot([round,c.id,arm].join('/'),ids))>0)await delay(wait);
          }
          const jobs=await Promise.allSettled(source.plan.items.map((item,i)=>imageSlot({ledger:db,id:ids[i],prompt:item.prompt,images:refs[arm],file:join(target,'art-'+item.position+'.png'),key})));
          if(jobs.some(j=>j.status!=='fulfilled'||j.value.state!=='complete'))throw Error('incomplete_image_lot '+ids.join(','));
          keep(join(target,'images.json'),jobs.map(j=>j.value.result));
          console.log(round,c.id,arm,'images 3/3');
        }
        keep(join(roundDir,c.id,'ablation.json'),{state:'complete',source:'with',optional:entry.rubric.optionalId,prompts:source.plan.items.map(i=>digest(i.prompt)),inputs:Object.fromEntries(Object.entries(refs).map(([a,imgs])=>[a,imgs.map(i=>({id:i.id,sha256:digest(Buffer.from(i.data,'base64'))}))]))});
      }
    }
  }finally{db.close();}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [command,dir,arg]=process.argv.slice(2),root=safeRoot(dir);
  if(command==='init')init(root,Number(arg));
  else await run(root,Number(arg),command);
}

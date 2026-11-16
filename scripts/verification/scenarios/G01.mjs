import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createFileStudioDriver} from '../shared-driver.mjs';
import {observeClock} from '../clock-probe.mjs';
import {PNG} from '../fixture-service.mjs';
import {getCurrentDraft,parseStudioState,prepareAdjustment,settleAdjustment,selectDraft,updateOfferFacts} from '../../../apps/web/lib/studio-state.ts';
import {effectiveReferences,postContext} from '../../../apps/web/lib/studio-post-context.ts';
import {recordCompletedExploration} from '../../../apps/web/lib/exploration-draft.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=value=>structuredClone(value);
const sqlId=value=>{if(typeof value!=='string'||!/^[0-9a-f-]{36}$/i.test(value))throw Error('invalid_observed_id');return `'${value}'::uuid`;};
const requireStatus=(response,status,stage)=>{if(response.status!==status)throw Error(`${stage}_http_${response.status}`);return response.body;};

export async function runG01(ctx){
  const observations={http:{},db:{},controller:{},providerLedger:{},files:{},errors:[]},files=[];
  const start=ctx.fixture.ledger.length;
  let stage='create-project',driver;
  try {
    const created=await ctx.request(ctx.actorA,'/api/projects',{method:'POST',body:{title:'Campanha sintética G01'}});
    observations.http.createProject=created;
    const project=requireStatus(created,201,stage).project,projectId=project.id;
    observations.identity={actor:ctx.actorA,projectId};
    const posts=()=>ctx.query(`select project_id,piece_id,name,deleted_at from public.project_posts where project_id=${sqlId(projectId)} order by piece_id`);
    stage='open-project';
    observations.http.openProject=await ctx.request(ctx.actorA,'/api/projects');
    if(!requireStatus(observations.http.openProject,200,stage).projects.some(item=>item.id===projectId))throw Error('created_project_missing');
    driver=await createFileStudioDriver(ctx,{projectId,filename:'G01-studio-state.json'});
    driver.controller.updateBrief({offer:'Oficina sintética de desenho',audience:'Pessoas iniciantes',direction:'Formas geométricas simples'});
    driver.controller.updateWorkflow({phase:'ready',view:'posts',aiPreference:'default'});
    const declared={id:ctx.newId(),label:'Preço declarado',value:'R$ 20',status:'confirmed'};
    const suggested={id:ctx.newId(),label:'Data sugerida',value:'25 de novembro',status:'pending'};
    driver.change(state=>updateOfferFacts(state,[declared,suggested]));
    observations.controller.declaredFacts=snapshot(driver.getState().offerFacts.filter(fact=>fact.status==='confirmed'));
    observations.controller.suggestedFacts=snapshot(driver.getState().offerFacts.filter(fact=>fact.status==='pending'));
    await driver.flush();
    stage='reload-project';
    observations.http.reloadProject=await ctx.request(ctx.actorA,'/api/projects');
    requireStatus(observations.http.reloadProject,200,stage);await driver.reopen();
    observations.http.credentialAvailability=await ctx.request(ctx.actorA,'/api/ai/credential-status');
    stage='prepare-and-cancel';
    driver.controller.preparePost(ctx.newId());driver.controller.changePreparation({name:'Preparação cancelada'});await driver.flush();
    observations.db.afterPreparation={posts:await posts()};
    driver.controller.cancelPreparation();await driver.flush();
    observations.db.afterCancellation={posts:await posts()};
    stage='confirm-first-post';
    const pieceId=ctx.newId();observations.identity.pieceId=pieceId;
    driver.controller.preparePost(pieceId);driver.controller.changePreparation({name:'Oferta declarada',objective:'Divulgar a oficina sintética',message:'Oficina por R$ 20',action:''});
    observations.controller.confirmation=await driver.controller.confirmPost(driver.creationPorts);
    if(observations.controller.confirmation.status!=='created')throw Error('post_creation_unconfirmed');
    observations.db.afterConfirmation={posts:await posts()};

    stage='select-references';
    const shared={id:ctx.newId(),name:'referencia-compartilhada-sintetica.png',mime:'image/png',size:PNG.length,width:1,height:1};
    const local={...shared,id:ctx.newId(),name:'referencia-local-sintetica.png'};
    await writeFile(join(ctx.runDir,'G01-reference-shared.png'),PNG);await writeFile(join(ctx.runDir,'G01-reference-local.png'),PNG);
    driver.controller.selectReference(shared,'references');driver.controller.selectReference(local,pieceId);
    const otherPostId=ctx.newId();
    driver.controller.preparePost(otherPostId);driver.controller.changePreparation({name:'Post vazio para verificar escopo'});
    const second=await driver.controller.confirmPost(driver.creationPorts);
    if(second.status!=='created')throw Error('scope_post_creation_unconfirmed');
    const state=driver.getState();
    observations.controller.references={sharedIds:snapshot(state.projectReferenceIds),postLocalIds:snapshot(state.posts[pieceId].referenceIds),effectiveIds:effectiveReferences(state,pieceId).map(reference=>reference.id),otherPostEffectiveIds:effectiveReferences(state,otherPostId).map(reference=>reference.id),otherPostId};
    driver.change(value=>selectDraft(value,{pieceId,baseVersion:0}));await driver.flush();await driver.reopen();
    observations.providerLedger.beforeIntent=snapshot(ctx.fixture.ledger.slice(start));

    stage='explicit-chat-request';
    const requestId=ctx.newId(),message='Crie uma proposta sintética para a oficina por R$ 20. A data sugerida ainda não foi confirmada.';
    driver.change(value=>prepareAdjustment(value,{requestId,messageId:ctx.newId(),instruction:message,conversationId:pieceId,createdAt:new Date().toISOString(),eventId:ctx.newId()}));
    await driver.flush();
    const context=driver.getChatContext(pieceId);
    const chat=await ctx.request(ctx.actorA,'/api/studio/chat',{method:'POST',body:{projectId,requestId,conversationId:pieceId,message,context,history:[]}});
    observations.http.chatSubmission=chat;
    if(chat.status!==202&&chat.status!==200)throw Error(`chat_http_${chat.status}`);
    let chatResult=chat.body;observations.http.chatPolls=[];
    for(let poll=0;poll<3&&['running','in_progress','pending'].includes(chatResult.status);poll++){
      const response=await ctx.request(ctx.actorA,'/api/studio/chat',{method:'POST',body:{op:'poll',projectId,requestId,conversationId:pieceId}});
      observations.http.chatPolls.push(response);chatResult=response.body;
    }
    if(chatResult.status!=='completed'||typeof chatResult.text!=='string')throw Error(`chat_${chatResult.status??'invalid'}`);
    driver.change(value=>settleAdjustment(value,{requestId,status:'completed',result:{messageId:ctx.newId(),text:chatResult.text},eventId:ctx.newId(),createdAt:new Date().toISOString()}));await driver.flush();

    stage='explicit-image-request';
    const imageId=ctx.newId();
    const generated=await ctx.request(ctx.actorA,'/api/studio/explorations',{method:'POST',headers:{'x-compor-exploration-request-id':imageId},body:{projectId,requestId:imageId,prompt:'Arte sintética para oficina por R$ 20, formas geométricas simples. Não incluir data.'}});
    observations.http.imageGeneration=generated;
    if(requireStatus(generated,200,stage).status!=='completed'||generated.body.imageId!==imageId)throw Error('image_generation_unconfirmed');
    observations.providerLedger.afterExplicitRequest=snapshot(ctx.fixture.ledger.slice(start));
    const listing=await ctx.request(ctx.actorA,`/api/studio/explorations?projectId=${projectId}`);
    observations.http.explorations=listing;
    const candidate=requireStatus(listing,200,'list-explorations').images.find(item=>item.id===imageId&&item.state==='completed');
    if(!candidate)throw Error('completed_exploration_missing');
    driver.change(value=>recordCompletedExploration(value,pieceId,{imageId,ordinal:candidate.ordinal,creationContext:{postContext:postContext(value,pieceId),references:[]}}));
    observations.controller.retained=await driver.creationPorts.retainReferenceProposal(pieceId);
    if(!observations.controller.retained.hasImage)throw Error('local_generated_image_missing');
    driver.controller.editDraft({field:'caption',value:'Oficina por R$ 20. Data ainda a confirmar.'});
    stage='save-version';
    observations.controller.saved=await driver.controller.saveCurrent(driver.savingPorts);
    observations.db.versions=await ctx.query(`select project_id,piece_id,version,content from public.piece_versions where project_id=${sqlId(projectId)} order by piece_id,version`);
    if(observations.controller.saved.result.status!=='completed')throw Error('version_save_unconfirmed');
    const version=observations.controller.saved.result.version;
    const base=await driver.storage.getDraftAsset({userId:ctx.actorA,projectId},{pieceId,baseVersion:version,kind:'base'});
    if(!base)throw Error('saved_version_image_missing');
    const bytes=Buffer.from(await base.file.arrayBuffer()),assetId=ctx.newId();
    const imagePath=`/api/images?${new URLSearchParams({projectId,pieceId,version:String(version),assetId})}`;
    observations.http.storeImage=await ctx.request(ctx.actorA,imagePath,{method:'POST',body:bytes,headers:{'content-type':'image/png'}});
    requireStatus(observations.http.storeImage,201,'store-image');
    stage='reopen-version';
    await driver.flush();driver.close();await driver.reopen();
    const versions=await driver.readVersions(),saved=versions.find(item=>item.piece_id===pieceId&&item.version===version);
    if(!saved)throw Error('saved_version_not_listed');
    driver.controller.openVersion(saved,versions);await driver.flush();
    const persisted=parseStudioState(JSON.parse(await readFile(driver.statePath,'utf8'))),reopened=getCurrentDraft(persisted);
    observations.controller.reopened={pieceId:reopened.pieceId,baseVersion:reopened.baseVersion,content:reopened.content,facts:persisted.offerFacts.filter(fact=>fact.status==='confirmed'),suggestedFacts:persisted.offerFacts.filter(fact=>fact.status==='pending'),creationContext:reopened.creationContext};
    const authenticated=await ctx.readBytes(ctx.actorA,imagePath);
    observations.http.authenticatedImage={status:authenticated.status,size:authenticated.bytes.length};
    if(authenticated.status!==200)throw Error(`authenticated_image_http_${authenticated.status}`);
    observations.files.authenticatedImageSha256=hash(authenticated.bytes);
    observations.files.generatedBytesSha256=hash(bytes);
    await writeFile(join(ctx.runDir,'generated-image.png'),bytes);
    files.push({id:'generated-image',path:'generated-image.png'});
    stage='clock';observations.clock=await observeClock();
    observations.providerLedger.final=snapshot(ctx.fixture.ledger.slice(start));
  }catch(error){observations.errors.push({stage,message:error instanceof Error?error.message:'scenario_failed'});}
  finally {driver?.close();}
  return {observations,files};
}

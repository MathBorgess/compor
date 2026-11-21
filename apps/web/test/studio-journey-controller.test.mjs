import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioJourneyController} from '../lib/studio-journey-controller.ts';
import {createStudioState,getCurrentDraft,parseStudioState} from '../lib/studio-state.ts';
import {effectiveReferences} from '../lib/studio-post-context.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={userId:id(1),projectId:id(2)};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
  let state=createStudioState({...scope,prepare:true}),persisted=null,active=true,sequence=100,fetcher;
  const calls=[],posts=[],versions=[],copied=[],assets=new Map(),locks={creation:{current:false},save:{current:false}};
  let flush=async()=>{persisted=JSON.stringify(state);};
  const defaultFetch=async(url,options)=>{
    const body=JSON.parse(options.body);
    if(url==='/api/posts')return Response.json({status:'created',post:{projectId:body.projectId,pieceId:body.pieceId,name:body.name,deleted:false}});
    if(url==='/api/pieces')return Response.json({status:'saved',version:{project_id:body.projectId,piece_id:body.pieceId,version:body.expectedVersion+1,content:body.content,metadata:{revision:1,baseVersion:body.baseVersion||null,approval:{status:'unapproved'}}}});
    throw Error('unexpected_transport');
  };
  fetcher=defaultFetch;
  const controller=createStudioJourneyController({
    getState:()=>state,change:reducer=>(state=reducer(state)),flush:()=>flush(),
    fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return fetcher(url,options);},
    isActive:()=>active,isRemoved:pieceId=>Boolean(state.posts[pieceId]?.deleted),locks,
  });
  const creation={onPostCreated:post=>posts.push(post),retainReferenceProposal:async()=>({result:'none',hasImage:false})};
  const saving={
    readVersions:async()=>versions,
    copyDraftAsset:async(assetScope,source,target)=>{
      copied.push({scope:assetScope,source,target});
      const key=address=>`${address.pieceId}:${address.baseVersion}`;
      if(!assets.has(key(source)))return 'missing';
      assets.set(key(target),assets.get(key(source)));return 'copied';
    },
    newEventId:()=>id(sequence++),onVersionsChanging:()=>{},onVersionSaved:version=>versions.push(version),
  };
  return {controller,creation,saving,calls,posts,versions,copied,assets,defaultFetch,
    get state(){return state;},get persisted(){return persisted;},
    setState:value=>{state=value;},setActive:value=>{active=value;},setFetch:value=>{fetcher=value;},setFlush:value=>{flush=value;},
    reopen:()=>{state=parseStudioState(JSON.parse(persisted));},
    async create(pieceId=id(3)){controller.preparePost(pieceId);controller.changePreparation({name:'Post sintético',objective:'Informar',message:'Fato declarado',action:''});return controller.confirmPost(creation);},
  };
}

test('transport calls preserve the receiver required by native browser fetch',async()=>{
  let state=createStudioState({...scope,prepare:true});
  const calls=[];
  const controller=createStudioJourneyController({
    getState:()=>state,change:reducer=>(state=reducer(state)),flush:async()=>{},
    fetchImpl:async function(url,options){
      assert.equal(this,undefined,'the injected native fetch must be called without the port object as receiver');
      calls.push(url);
      const body=JSON.parse(options.body);
      return Response.json(url==='/api/posts'?{status:'created',post:{projectId:body.projectId,pieceId:body.pieceId,name:body.name,deleted:false}}:{status:'saved',version:{project_id:body.projectId,piece_id:body.pieceId,version:body.expectedVersion+1,content:body.content}});
    },
    isActive:()=>true,isRemoved:()=>false,
  });
  controller.preparePost(id(3));controller.changePreparation({name:'Browser transport'});
  assert.equal((await controller.confirmPost({onPostCreated:()=>{},retainReferenceProposal:async()=>({result:'none',hasImage:false})})).status,'created');
  controller.editDraft({field:'caption',value:'Saved through native transport'});
  const saved=await controller.saveCurrent({readVersions:async()=>[],copyDraftAsset:async()=> 'missing',newEventId:()=>id(4),onVersionsChanging:()=>{},onVersionSaved:()=>{}});
  assert.equal(saved.result.status,'completed');
  assert.deepEqual(calls,['/api/posts','/api/pieces']);
});

test('preparar, nomear e cancelar não criam post, versão ou chamada externa',async()=>{
  const f=fixture();
  f.controller.preparePost(id(3),{fromAgent:true});
  assert.equal(f.state.workflow.view,'prepare-post');
  assert.equal((await f.controller.confirmPost(f.creation)).status,'unavailable');
  f.controller.changePreparation({name:'Nome ainda não confirmado',message:'R$ 20'});
  assert.equal(f.state.workflow.pendingPost.message,'R$ 20');
  assert.deepEqual(f.state.drafts,[]);assert.deepEqual(f.state.posts,{});
  f.controller.cancelPreparation();
  assert.equal(f.state.workflow.pendingPost,null);assert.equal(f.state.workflow.view,'posts');
  assert.equal(f.calls.length,0);
});

test('confirmação atravessa HTTP e persiste nome e contexto antes da retomada',async()=>{
  const f=fixture();f.controller.preparePost(id(3));
  f.controller.changePreparation({name:'  Uma campanha  ',objective:'Explicar',message:'R$ 20',action:''});
  const result=await f.controller.confirmPost(f.creation);
  assert.equal(result.status,'created');assert.equal(f.posts[0].name,'Uma campanha');
  assert.deepEqual(f.calls,[{url:'/api/posts',body:{projectId:scope.projectId,pieceId:id(3),name:'Uma campanha'}}]);
  f.reopen();assert.equal(f.state.workflow.pendingPost,null);assert.equal(f.state.workflow.view,'compose');
  assert.equal(f.state.posts[id(3)].message,'R$ 20');assert.equal(f.state.posts[id(3)].action,'');
  assert.equal(getCurrentDraft(f.state).baseVersion,0);
});

test('recibo de criação incompatível preserva preparação e não repete a escrita',async()=>{
  for(const patch of [{projectId:id(90)},{pieceId:id(91)},{name:'Outro'},{deleted:true}]){
    const f=fixture();
    f.setFetch(async(url,options)=>{const response=await f.defaultFetch(url,options),body=await response.json();return Response.json({...body,post:{...body.post,...patch}});});
    assert.equal((await f.create()).status,'unknown');
    assert.equal(f.state.workflow.pendingPost.pieceId,id(3));assert.equal(f.state.drafts.length,0);
    assert.equal(f.calls.length,1);assert.equal(f.posts.length,0);
  }
});

test('confirmação perdida não se repete ao reabrir; nova verificação explícita usa o mesmo pedido',async()=>{
  const f=fixture();let durablePost;
  f.setFetch(async(url,options)=>{durablePost=JSON.parse(options.body);throw Error('confirmation_lost');});
  assert.equal((await f.create()).status,'unknown');
  f.reopen();assert.equal(f.calls.length,1);assert.equal(f.state.workflow.pendingPost.pieceId,durablePost.pieceId);
  f.setFetch(f.defaultFetch);
  assert.equal((await f.controller.confirmPost(f.creation)).status,'created');
  assert.deepEqual(f.calls[0],f.calls[1]);
});

test('duas confirmações simultâneas só despacham uma requisição',async()=>{
  const f=fixture(),started=deferred(),release=deferred();
  f.setFetch(async(url,options)=>{started.resolve();await release.promise;return f.defaultFetch(url,options);});
  const first=f.create();await started.promise;
  assert.equal((await f.controller.confirmPost(f.creation)).status,'unavailable');
  assert.equal(f.calls.length,1);release.resolve();assert.equal((await first).status,'created');
});

test('recibo atrasado preserva uma preparação posterior sem criar seu rascunho',async()=>{
  const f=fixture(),started=deferred(),release=deferred();
  f.setFetch(async(url,options)=>{started.resolve();await release.promise;return f.defaultFetch(url,options);});
  const first=f.create();await started.promise;
  f.controller.preparePost(id(4));f.controller.changePreparation({name:'Mais recente'});
  release.resolve();assert.equal((await first).status,'superseded');
  assert.equal(f.state.workflow.pendingPost.pieceId,id(4));assert.equal(f.state.workflow.pendingPost.name,'Mais recente');
  assert.equal(f.state.drafts.length,0);assert.equal(f.posts[0].pieceId,id(3));
});

test('troca de conta/projeto durante resposta não aplica recibo na nova identidade',async()=>{
  const f=fixture(),started=deferred(),release=deferred();
  f.setFetch(async(url,options)=>{started.resolve();await release.promise;return f.defaultFetch(url,options);});
  const first=f.create();await started.promise;
  const foreign=createStudioState({userId:id(7),projectId:id(8)});f.setState(foreign);
  release.resolve();assert.equal((await first).status,'unknown');assert.equal(f.state,foreign);assert.equal(f.posts.length,0);
});

test('inatividade ou falha da persistência local impedem o despacho de criação',async()=>{
  const inactive=fixture();inactive.setActive(false);assert.equal((await inactive.create()).status,'unavailable');assert.equal(inactive.calls.length,0);
  const failed=fixture();failed.setFlush(async()=>{throw Error('disk_full');});assert.equal((await failed.create()).status,'unknown');assert.equal(failed.calls.length,0);
});

test('troca de escopo durante flush impede requisição com a identidade anterior',async()=>{
  const f=fixture();
  f.setFlush(async()=>{f.setState(createStudioState({userId:id(7),projectId:id(8)}));});
  assert.equal((await f.create()).status,'unknown');assert.equal(f.calls.length,0);
});

test('retenção atrasada de v0 não fecha a preparação do post seguinte',async()=>{
  const f=fixture(),started=deferred(),release=deferred();
  f.controller.updateWorkflow({referenceHandoff:'references'});
  f.creation.retainReferenceProposal=async()=>{started.resolve();await release.promise;return {result:'retained',hasImage:true};};
  const first=f.create();await started.promise;
  f.controller.preparePost(id(4));f.controller.changePreparation({name:'Post seguinte'});
  release.resolve();assert.equal((await first).status,'superseded');
  assert.equal(f.state.workflow.view,'prepare-post');assert.equal(f.state.workflow.pendingPost.pieceId,id(4));
});

test('salvar copia o ativo e persiste versão; reabrir usa o mesmo controlador',async()=>{
  const f=fixture();await f.create();
  f.controller.editDraft({field:'caption',value:'Legenda preservada'});
  const blob=new Blob(['synthetic-image'],{type:'image/png'});f.assets.set(`${id(3)}:0`,blob);
  const outcome=await f.controller.saveCurrent(f.saving);
  assert.deepEqual(outcome.result,{status:'completed',pieceId:id(3),version:1});
  assert.equal(f.assets.get(`${id(3)}:1`),blob);assert.deepEqual(f.copied[0].scope,scope);
  f.reopen();assert.equal(getCurrentDraft(f.state).baseVersion,1);assert.equal(getCurrentDraft(f.state).content.caption,'Legenda preservada');
  f.controller.openVersion(f.versions[0],f.versions);assert.equal(f.state.workflow.view,'studio');
  assert.deepEqual(f.calls.map(call=>call.url),['/api/posts','/api/pieces']);
});

test('recibo de salvamento de outro projeto, post ou versão não é adotado',async()=>{
  for(const patch of [{project_id:id(90)},{piece_id:id(91)},{version:7}]){
    const f=fixture();await f.create();
    f.setFetch(async(url,options)=>{const body=await(await f.defaultFetch(url,options)).json();return Response.json({...body,version:{...body.version,...patch}});});
    const outcome=await f.controller.saveCurrent(f.saving);assert.equal(outcome.result.status,'unknown');
    assert.equal(getCurrentDraft(f.state).baseVersion,0);assert.equal(f.copied.length,0);assert.equal(f.calls.length,2);
  }
});

test('409 reconcilia somente a versão imediatamente seguinte com mesmo conteúdo e origem',async()=>{
  const f=fixture();await f.create();f.controller.editDraft({field:'caption',value:'Já salvo'});
  const draft=getCurrentDraft(f.state);
  f.versions.push({project_id:scope.projectId,piece_id:id(3),version:1,content:draft.content,metadata:{revision:1,baseVersion:null,approval:{status:'unapproved'}}});
  f.setFetch(async()=>Response.json({status:'conflict'},{status:409}));
  const result=await f.controller.saveCurrent(f.saving);
  assert.equal(result.notice,'recovered');assert.equal(result.result.status,'unknown');
  f.reopen();assert.equal(getCurrentDraft(f.state).baseVersion,1);assert.equal(f.versions.length,1);assert.equal(f.calls.length,2);
  const other=fixture();await other.create();other.versions.push({...f.versions[0],version:3});other.setFetch(async()=>Response.json({status:'conflict'},{status:409}));
  assert.equal((await other.controller.saveCurrent(other.saving)).notice,'conflict');assert.equal(getCurrentDraft(other.state).baseVersion,0);
});

test('salvamento não declara sucesso se persistência final falhar e não repete HTTP',async()=>{
  const f=fixture();await f.create();let flushes=0;
  f.setFlush(async()=>{if(++flushes===2)throw Error('disk_full');});
  assert.equal((await f.controller.saveCurrent(f.saving)).result.status,'unknown');assert.equal(f.calls.length,2);
});

test('troca de escopo durante cópia do ativo não adota versão no novo estado',async()=>{
  const f=fixture();await f.create();
  const foreign=createStudioState({userId:id(7),projectId:id(8)});
  f.saving.copyDraftAsset=async()=>{f.setState(foreign);return 'copied';};
  const result=await f.controller.saveCurrent(f.saving);
  assert.equal(result.notice,'inactive');assert.equal(result.result.status,'unknown');
  assert.equal(f.state,foreign);assert.equal(f.versions.length,0);
});

test('contexto de ferramenta obsoleto e abertura de versão alheia falham sem efeitos',async()=>{
  const f=fixture();await f.create();
  await assert.rejects(()=>f.controller.saveCurrent(f.saving,{pieceId:id(4),baseVersion:0,expectedLatestVersion:0}),/context_changed/);
  assert.equal(f.calls.length,1);
  assert.throws(()=>f.controller.openVersion({project_id:id(9),piece_id:id(3),version:1,content:getCurrentDraft(f.state).content},[]),/context_changed/);
});

test('salvar publica a imagem antes de adotar a versão e repetir usa o mesmo número',async()=>{
  const f=fixture();await f.create();
  f.controller.editDraft({field:'caption',value:'Com imagem'});
  const published=[];
  f.saving.publishVersionImage=async input=>{published.push(input.version);return published.length===1?'unknown':'published';};
  assert.equal((await f.controller.saveCurrent(f.saving)).result.status,'unknown');
  assert.equal(getCurrentDraft(f.state).baseVersion,0);assert.equal(f.copied.length,0);assert.equal(published[0],1);
  const body=f.calls.find(call=>call.url==='/api/pieces').body;
  f.versions.push({project_id:scope.projectId,piece_id:body.pieceId,version:1,content:body.content,metadata:{revision:1,baseVersion:null,approval:{status:'unapproved'}}});
  f.setFetch(async()=>Response.json({status:'conflict'},{status:409}));
  const repeated=await f.controller.saveCurrent(f.saving);
  assert.equal(repeated.notice,'recovered');assert.equal(getCurrentDraft(f.state).baseVersion,1);
  assert.deepEqual(published,[1,1]);assert.equal(f.copied.length,0);assert.equal(f.versions.length,1);
});

test('preparar geração não copia nem publica a imagem da versão anterior',async()=>{
  const f=fixture();await f.create();
  let published=0;
  f.saving.publishVersionImage=async()=>{published++;return 'published';};
  f.assets.set(`${id(3)}:0`,new Blob(['anterior']));
  const draft=getCurrentDraft(f.state);
  const outcome=await f.controller.saveCurrent(f.saving,{pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion,operation:'create'});
  assert.equal(outcome.result.status,'completed');assert.equal(published,0);assert.equal(f.copied.length,0);assert.equal(f.assets.has(`${id(3)}:1`),false);
});

test('referências compartilhadas e locais mantêm escopo ao alternar posts',async()=>{
  const f=fixture();await f.create();
  const shared={id:id(20),name:'shared.png',mime:'image/png',size:12,width:2,height:2};
  const local={...shared,id:id(21),name:'local.png'};
  f.controller.selectReference(shared,'references');f.controller.selectReference(local,id(3));
  await f.create(id(4));
  assert.deepEqual(effectiveReferences(f.state,id(3)).map(reference=>reference.id),[id(20),id(21)]);
  assert.deepEqual(effectiveReferences(f.state,id(4)).map(reference=>reference.id),[id(20)]);
  f.controller.unselectReference(id(20),id(4));
  assert.deepEqual(effectiveReferences(f.state,id(4)),[]);
  assert.equal(effectiveReferences(f.state,id(3)).length,2);
});

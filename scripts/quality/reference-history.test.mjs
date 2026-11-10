import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),first=id(3),second=id(4),foreign=id(5),third=id(18);
const image=id(7),secondImage=id(8),foreignImage=id(9);
const ref=number=>({id:String(number),title:`Referência ${number}`,board:'behance/typography',originUrl:`https://www.pinterest.com/pin/${number}/`,previewUrl:`https://i.pinimg.com/236x/${number}.jpg`});
const source=number=>({kind:'pinterest',originUrl:ref(number).originUrl,board:ref(number).board});
const generated=(projectId,imageId)=>({kind:'generated',projectId,imageId});
const content={headline:'Post',price:'',date:'',caption:'Legenda',captionOrigin:'user'};

test('aprovação é independente da aprendizagem; crédito exige seleção prévia própria e veto é do projeto atual',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261105000014_version_metadata.sql','20261106000017_reference_signals.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec(`create table public.exploration_images(id uuid primary key,owner_id uuid not null,project_id uuid not null,state text not null);
    alter table public.exploration_images enable row level security;grant select on public.exploration_images to authenticated;
    create policy own_exploration on public.exploration_images for select to authenticated using(owner_id=auth.uid());`);
  for(const name of ['20261106000019_exploration_feedback.sql','20261109000026_reference_history.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'A'),($3,$2,'B'),($4,$5,'D'),($6,$2,'C')",[first,alice,second,foreign,bob,third]);
  await db.query("insert into public.exploration_images values($1,$2,$3,'completed'),($4,$2,$5,'completed'),($6,$7,$8,'completed')",[image,alice,first,secondImage,second,foreignImage,bob,foreign]);
  const user=value=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[value]);
  const admin=async sql=>{await db.exec('reset role');await db.exec(sql);await db.exec('set role authenticated');};
  await db.exec('set role authenticated');await user(alice);
  const pin=(signal,project,number,action='selected',supersedes=null)=>db.query('insert into public.reference_signals(id,project_id,origin_url,board,action,comment,supersedes,reference_data) values($1,$2,$3,$4,$5,$6,$7,$8)',[signal,project,ref(number).originUrl,ref(number).board,action,action==='comment'?'Comentário literal':'',supersedes,action==='selected'?ref(number):null]);
  const imageSignal=(signal,project,imageId,action='selected')=>db.query('insert into public.generated_image_signals(id,project_id,image_id,action,comment) values($1,$2,$3,$4,$5)',[signal,project,imageId,action,action==='comment'?'Comentário literal':'']);
  const save=async(piece,project=first)=>{const result=(await db.query('select public.save_piece_version_v2($1,$2,0,0,$3) as value',[project,piece,content])).rows[0].value;assert.equal(result.status,'saved');};
  const approve=async(piece,revision,references,project=first,version=1)=>(await db.query('select public.approve_piece_version_with_references($1,$2,$3,$4,$5) as value',[project,piece,version,revision,references])).rows[0].value;
  const links=async piece=>(await db.query('select reference_signal_id,generated_signal_id from public.piece_version_reference_links where piece_id=$1',[piece])).rows;
  const history=async(project=first)=>(await db.query('select public.list_reference_history($1) as value',[project])).rows[0].value;
  const confirmed=async(piece,revision,references,project=first)=>{const result=await approve(piece,revision,references,project);assert.equal(result.status,'approved');assert.equal(result.version.metadata.revision,revision+1);return result;};

  // A legacy moodboard, a comment or a rejection never prevents principal approval.
  const legacy=id(100),commentOnly=id(101),positive=id(102),rejected=id(103),reselected=id(104);
  await save(legacy);await confirmed(legacy,0,[source(100)]);assert.deepEqual(await links(legacy),[]);
  assert.equal((await db.query('select count(*)::integer as n from public.reference_signals where origin_url=$1',[ref(100).originUrl])).rows[0].n,0,'aprovar não faz backfill de seleção');
  await pin(id(30),first,101,'comment');await save(commentOnly);await confirmed(commentOnly,0,[source(101)]);assert.deepEqual(await links(commentOnly),[]);
  await pin(id(31),first,102);await pin(id(32),first,102,'comment');await save(positive);await confirmed(positive,0,[source(102),source(102)]);
  assert.deepEqual(await links(positive),[{reference_signal_id:id(31),generated_signal_id:null}],'comentários são neutros e fontes duplicadas não multiplicam crédito');
  await pin(id(33),first,103);await pin(id(34),first,103,'rejected',id(33));await save(rejected);await confirmed(rejected,0,[source(103)]);assert.deepEqual(await links(rejected),[]);
  await pin(id(35),first,103,'selected',id(34));await save(reselected);await confirmed(reselected,0,[source(103)]);
  assert.deepEqual(await links(reselected),[{reference_signal_id:id(35),generated_signal_id:null}]);
  assert.equal((await history()).find(item=>item.id==='103').approvedVersions,1,'a seleção posterior não cria crédito para a aprovação anterior recusada');

  // Other projects and accounts cannot redefine this project's positive evidence.
  await pin(id(36),second,104);const otherProject=id(105);await save(otherProject);await confirmed(otherProject,0,[source(104)]);assert.deepEqual(await links(otherProject),[]);
  await pin(id(37),first,105);await pin(id(38),second,105,'rejected');const ownSelected=id(106);await save(ownSelected);await confirmed(ownSelected,0,[source(105)]);
  assert.equal((await links(ownSelected))[0].reference_signal_id,id(37));
  await pin(id(39),first,106,'rejected');await pin(id(40),second,106);const ownRejected=id(107);await save(ownRejected);await confirmed(ownRejected,0,[source(106)]);assert.deepEqual(await links(ownRejected),[]);
  await user(bob);await pin(id(41),foreign,107);await imageSignal(id(42),foreign,foreignImage);await user(alice);
  const otherAccount=id(108);await save(otherAccount);await confirmed(otherAccount,0,[source(107),generated(foreign,foreignImage)]);assert.deepEqual(await links(otherAccount),[]);
  await imageSignal(id(43),first,image);await imageSignal(id(44),first,image,'comment');await imageSignal(id(45),second,secondImage);
  const generatedPiece=id(109);await save(generatedPiece);await confirmed(generatedPiece,0,[generated(first,image),generated(second,secondImage),generated(foreign,foreignImage)]);
  assert.deepEqual(await links(generatedPiece),[{reference_signal_id:null,generated_signal_id:id(43)}],'somente a imagem concluída selecionada neste projeto ganha vínculo');

  // A is successful; a rejection in B suppresses B only, while C retains A's history.
  await pin(id(46),second,102,'rejected');
  assert.equal((await history(second)).some(item=>item.id==='102'),false);
  assert.equal((await history(third)).find(item=>item.id==='102').approvedVersions,1);
  assert.equal((await history(first)).find(item=>item.id==='102').approvedVersions,1);
  await pin(id(47),second,102);assert.equal((await history(second)).find(item=>item.id==='102').approvedVersions,1,'selecionar novamente em B remove seu veto sem fabricar outra aprovação');

  // Capture selections before the principal UPDATE. A later event cannot enrich reapproval.
  const late=id(110),lateSignal=id(48);
  await save(late);
  await admin(`create function public.test_late_reference() returns trigger language plpgsql security definer set search_path='' as $$begin
    if new.piece_id='${late}'::uuid and new.approval_state='explicit' then
      insert into public.reference_signals(id,owner_id,project_id,origin_url,board,action,reference_data) values('${lateSignal}','${alice}','${first}','${ref(108).originUrl}','behance/typography','selected','${JSON.stringify(ref(108))}'::jsonb) on conflict do nothing;
    end if;return new;end$$;
    create trigger test_late_reference before update on public.piece_version_metadata for each row execute function public.test_late_reference();`);
  await confirmed(late,0,[source(108)]);assert.deepEqual(await links(late),[],'seleção surgida durante a aprovação não fazia parte do snapshot');
  assert.equal((await db.query('select count(*)::integer as n from public.reference_signals where id=$1',[lateSignal])).rows[0].n,1);
  await confirmed(late,1,[source(108)]);assert.deepEqual(await links(late),[],'reaprovar não dá crédito retroativo a uma seleção posterior');
  assert.equal((await history()).find(item=>item.id==='108').approvedVersions,0);
  const ranked=await history();assert.ok(ranked.findIndex(item=>item.id==='102')<ranked.findIndex(item=>item.id==='108'),'aprovação comprovada vem antes de seleção mais recente sem aprovação');
  await admin('drop trigger test_late_reference on public.piece_version_metadata;drop function public.test_late_reference();');

  // Even a learning INSERT that fails after another link was inserted rolls back links only.
  const broken=id(111);await save(broken);
  await admin(`create function public.test_broken_learning() returns trigger language plpgsql set search_path='' as $$begin
    if new.piece_id='${broken}'::uuid and new.generated_signal_id is not null then raise exception 'synthetic_learning_failure';end if;return new;end$$;
    create trigger test_broken_learning before insert on public.piece_version_reference_links for each row execute function public.test_broken_learning();`);
  await confirmed(broken,0,[source(102),generated(first,image)]);
  assert.deepEqual(await links(broken),[],'falha da aprendizagem desfaz inclusive o vínculo de pin inserido antes dela');
  const principal=(await db.query('select approval_state,revision from public.piece_version_metadata where project_id=$1 and piece_id=$2',[first,broken])).rows[0];
  assert.deepEqual(principal,{approval_state:'explicit',revision:1});
  await admin('drop trigger test_broken_learning on public.piece_version_reference_links;drop function public.test_broken_learning();');

  await pin(id(51),first,102,'rejected',id(31));
  assert.equal((await history(first)).some(item=>item.id==='102'),false,'a recusa posterior em A suprime apenas A');
  assert.equal((await history(third)).find(item=>item.id==='102').approvedVersions,1,'o sucesso factual anterior em A continua disponível em C');

  // Wire validation, ownership, expected revision and RLS remain strict.
  const strict=id(112);await save(strict);
  for(const references of [null,{},[{}],[{...source(102),approvedVersions:9}],[{kind:'generated',projectId:'invalid',imageId:image}],Array.from({length:101},()=>source(102))])await assert.rejects(()=>approve(strict,0,references));
  await assert.rejects(()=>approve(strict,-1,[]));await assert.rejects(()=>approve(strict,null,[]));
  assert.deepEqual(await approve(strict,1,[source(102)]),{status:'conflict',currentRevision:0});
  assert.deepEqual(await approve(strict,0,[],first,2),{status:'not_found'});assert.deepEqual(await links(strict),[]);
  assert.equal((await db.query('select revision from public.piece_version_metadata where project_id=$1 and piece_id=$2',[first,strict])).rows[0].revision,0);
  await assert.rejects(()=>db.query('insert into public.piece_version_reference_links(owner_id,project_id,piece_id,version,reference_signal_id) values($1,$2,$3,1,$4)',[alice,first,strict,id(31)]));
  await assert.rejects(()=>db.query("update public.reference_signals set reference_data='{}'"));
  await assert.rejects(()=>db.query("insert into public.reference_signals(id,project_id,origin_url,board,action,reference_data) values($1,$2,$3,$4,'selected',$5)",[id(49),first,ref(102).originUrl,ref(102).board,ref(103)]));
  await user(bob);assert.deepEqual(await links(positive),[]);assert.deepEqual(await approve(strict,0,[]),{status:'not_found'});
  await assert.rejects(()=>history(first));await assert.rejects(()=>pin(id(50),first,109));
  const owned=id(113);await save(owned,foreign);await confirmed(owned,0,[source(107)],foreign);assert.equal((await history(foreign))[0].approvedVersions,1);
  assert.equal((await history(foreign)).some(item=>item.id==='102'),false);
  await db.exec('set role anon');await assert.rejects(()=>history(foreign));await assert.rejects(()=>approve(owned,1,[],foreign));
});

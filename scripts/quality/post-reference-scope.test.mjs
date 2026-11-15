import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),project=id(3),bobProject=id(4);
const oldPost=id(5),postA=id(6),postB=id(7),image=id(8);
const oldPin=id(9),localPin=id(10),localVeto=id(11),localImage=id(12),oldImage=id(13);
const reference=n=>({id:String(n),title:`Reference ${n}`,board:'behance/typography',originUrl:`https://www.pinterest.com/pin/${n}/`,previewUrl:`https://i.pinimg.com/236x/${n}.jpg`});
const pinSource=n=>({kind:'pinterest',originUrl:reference(n).originUrl,board:reference(n).board});
const content={headline:'Synthetic post',price:'',date:'',caption:'Synthetic caption',captionOrigin:'user'};
const migration=async(db,name)=>db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));

test('migration 00029 preserves old signals and isolates post selections, corrections, and approval credit',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261105000014_version_metadata.sql','20261106000017_reference_signals.sql'])await migration(db,name);
  await db.exec(`create table public.exploration_images(id uuid primary key,owner_id uuid not null,project_id uuid not null,state text not null);
    alter table public.exploration_images enable row level security;grant select on public.exploration_images to authenticated;
    create policy own_exploration on public.exploration_images for select to authenticated using(owner_id=auth.uid());`);
  for(const name of ['20261106000019_exploration_feedback.sql','20261109000026_reference_history.sql'])await migration(db,name);
  await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Alice'),($3,$4,'Bob')",[project,alice,bobProject,bob]);
  await db.query("insert into public.exploration_images values($1,$2,$3,'completed')",[image,alice,project]);
  const user=uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const save=async piece=>{
    const {rows}=await db.query('select public.save_piece_version_v2($1,$2,0,0,$3) as value',[project,piece,content]);
    assert.equal(rows[0].value.status,'saved');
  };
  const approve=async(piece,sources)=>{
    const {rows}=await db.query('select public.approve_piece_version_with_references($1,$2,1,0,$3) as value',[project,piece,sources]);
    assert.equal(rows[0].value.status,'approved');
  };
  const history=async projectId=>(await db.query('select public.list_reference_history($1) as value',[projectId])).rows[0].value;
  const pin=async(signal,piece,number,action='selected',supersedes=null)=>db.query(
    'insert into public.reference_signals(id,project_id,piece_id,origin_url,board,action,supersedes,reference_data) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [signal,project,piece,reference(number).originUrl,reference(number).board,action,supersedes,action==='selected'?reference(number):null]);
  const links=async piece=>(await db.query('select reference_signal_id,generated_signal_id from public.piece_version_reference_links where piece_id=$1 order by reference_signal_id nulls last,generated_signal_id',[piece])).rows;

  await db.exec('set role authenticated');await user(alice);
  await db.query('insert into public.reference_signals(id,project_id,origin_url,board,action,reference_data) values($1,$2,$3,$4,$5,$6)',
    [oldPin,project,reference(123).originUrl,reference(123).board,'selected',reference(123)]);
  await db.query('insert into public.generated_image_signals(id,project_id,image_id,action) values($1,$2,$3,$4)',
    [oldImage,project,image,'selected']);
  await save(oldPost);await approve(oldPost,[pinSource(123)]);
  const oldHistory=await history(project);
  assert.equal(oldHistory.length,1);
  await db.exec('reset role');await migration(db,'20261115000029_post_reference_scope.sql');
  await db.exec('set role authenticated');await user(alice);
  assert.deepEqual((await db.query('select piece_id from public.reference_signals where id=$1',[oldPin])).rows,[{piece_id:null}]);
  assert.deepEqual((await db.query('select piece_id from public.generated_image_signals where id=$1',[oldImage])).rows,[{piece_id:null}]);
  assert.deepEqual(await links(oldPost),[{reference_signal_id:oldPin,generated_signal_id:null}]);
  assert.deepEqual(await history(project),oldHistory,'the migration must preserve legacy account history');

  await pin(localPin,postA,456);
  await pin(localVeto,postA,123,'rejected');
  await db.query('insert into public.generated_image_signals(id,project_id,piece_id,image_id,action) values($1,$2,$3,$4,$5)',
    [localImage,project,postA,image,'selected']);
  assert.deepEqual((await history(project)).map(item=>item.id),['123'],'unapproved local choices stay out of account history');
  await assert.rejects(()=>pin(id(20),postB,456,'rejected',localPin),{code:'23514'});
  await assert.rejects(()=>pin(id(21),null,456,'rejected',localPin),{code:'23514'});
  await assert.rejects(()=>db.query('insert into public.generated_image_signals(id,project_id,piece_id,image_id,action,supersedes) values($1,$2,$3,$4,$5,$6)',
    [id(22),project,postB,image,'rejected',localImage]),{code:'23514'});
  await pin(id(23),postA,789);
  await pin(id(24),postA,789,'rejected',id(23));

  await save(postA);
  await approve(postA,[pinSource(123),pinSource(456),{kind:'generated',projectId:project,imageId:image}]);
  assert.deepEqual(await links(postA),[
    {reference_signal_id:localPin,generated_signal_id:null},
    {reference_signal_id:null,generated_signal_id:localImage},
  ],'the local veto overrides a shared choice only for this post');
  assert.deepEqual((await history(project)).map(item=>item.id).sort(),['123','456'],'only the approved local choice joins account history');
  await save(postB);
  await approve(postB,[pinSource(123),pinSource(456),{kind:'generated',projectId:project,imageId:image}]);
  assert.deepEqual(await links(postB),[
    {reference_signal_id:oldPin,generated_signal_id:null},
    {reference_signal_id:null,generated_signal_id:oldImage},
  ],'another post credits shared legacy signals without crediting local selections');

  // Sharing an existing local pin reuses its origin, but the new shared signal
  // has no reference_data. An approval of that shared choice must still recover
  // owned metadata without exposing an unapproved local-only choice beforehand.
  const localUnapproved=id(40),sharedWithoutMetadata=id(41),sharedPost=id(42);
  await pin(localUnapproved,postA,987);
  assert.equal((await history(project)).some(item=>item.id==='987'),false);
  await db.query('insert into public.reference_signals(id,project_id,origin_url,board,action) values($1,$2,$3,$4,$5)',
    [sharedWithoutMetadata,project,reference(987).originUrl,reference(987).board,'selected']);
  await save(sharedPost);await approve(sharedPost,[pinSource(987)]);
  assert.deepEqual(await links(sharedPost),[{reference_signal_id:sharedWithoutMetadata,generated_signal_id:null}]);
  assert.equal((await history(project)).find(item=>item.id==='987')?.approvedVersions,1);
  const differentBoard={...reference(988),board:'behance/illustration'};
  await db.query('insert into public.reference_signals(id,project_id,piece_id,origin_url,board,action,reference_data) values($1,$2,$3,$4,$5,$6,$7)',
    [id(43),project,postA,differentBoard.originUrl,differentBoard.board,'selected',differentBoard]);
  await db.query('insert into public.reference_signals(id,project_id,origin_url,board,action) values($1,$2,$3,$4,$5)',
    [id(44),project,differentBoard.originUrl,reference(988).board,'selected']);
  assert.equal((await history(project)).some(item=>item.id==='988'),false,'a shared choice cannot borrow metadata from a different board');

  await user(bob);
  assert.deepEqual((await db.query('select id from public.reference_signals')).rows,[]);
  assert.deepEqual((await db.query('select id from public.generated_image_signals')).rows,[]);
  assert.deepEqual((await db.query('select id from public.piece_version_reference_links')).rows,[]);
  assert.deepEqual(await history(bobProject),[]);
  await assert.rejects(()=>history(project),{code:'42501'});
  await assert.rejects(()=>db.query('insert into public.reference_signals(id,project_id,origin_url,board,action) values($1,$2,$3,$4,$5)',
    [id(25),project,reference(999).originUrl,reference(999).board,'selected']));
});

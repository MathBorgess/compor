-- Only an empty, isolated database with all migrations through 00029 applied.
-- Review the target first. Run in a fresh psql connection with
-- PGOPTIONS='-c compor.local_scope_proof=allow-empty-isolated'. Never run in production.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('compor.local_scope_proof',true) is distinct from 'allow-empty-isolated'
    or exists(select 1 from auth.users) or exists(select 1 from public.projects) then
    raise exception 'refusing unguarded or non-empty database';
  end if;
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
    raise exception 'refusing auth triggers with possible external effects';
  end if;
end $$;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into public.projects(id,title) values ('33333333-3333-4333-8333-333333333333','Synthetic reference scope');
do $$
declare
  project uuid:='33333333-3333-4333-8333-333333333333';
  post uuid:='44444444-4444-4444-8444-444444444444';
  other_post uuid:='55555555-5555-4555-8555-555555555555';
  shared uuid:='66666666-6666-4666-8666-666666666666';
  local_choice uuid:='77777777-7777-4777-8777-777777777777';
  result jsonb;
begin
  insert into public.reference_signals(id,project_id,piece_id,origin_url,board,action,reference_data) values
    (shared,project,null,'https://www.pinterest.com/pin/123/','behance/typography','selected',
      '{"id":"123","title":"Shared","board":"behance/typography","originUrl":"https://www.pinterest.com/pin/123/","previewUrl":"https://i.pinimg.com/236x/example.jpg"}'),
    (local_choice,project,post,'https://www.pinterest.com/pin/456/','behance/typography','selected',
      '{"id":"456","title":"Local","board":"behance/typography","originUrl":"https://www.pinterest.com/pin/456/","previewUrl":"https://i.pinimg.com/236x/example.jpg"}');
  begin
    insert into public.reference_signals(id,project_id,piece_id,origin_url,board,action,supersedes)
      values(gen_random_uuid(),project,other_post,'https://www.pinterest.com/pin/456/','behance/typography','rejected',local_choice);
    raise exception 'cross-scope correction accepted';
  exception when check_violation then null; end;
  if jsonb_array_length(public.list_reference_history(project))<>1 then raise exception 'unapproved local choice leaked into account history'; end if;
  result:=public.save_piece_version_v3(project,post,0,null,'{"headline":"Synthetic","price":"","date":"","caption":"","captionOrigin":"user"}','create',null);
  if result->>'status'<>'saved' then raise exception 'fixture version not saved'; end if;
  result:=public.approve_piece_version_with_references(project,post,1,(result#>>'{version,metadata,revision}')::integer,
    '[{"kind":"pinterest","originUrl":"https://www.pinterest.com/pin/456/","board":"behance/typography"}]');
  if result->>'status'<>'approved' then raise exception 'approval failed'; end if;
  if not exists(select 1 from public.piece_version_reference_links where project_id=project and piece_id=post and reference_signal_id=local_choice)
    or exists(select 1 from public.piece_version_reference_links where project_id=project and reference_signal_id=shared) then
    raise exception 'approval attributed a source outside its submitted snapshot';
  end if;
  if jsonb_array_length(public.list_reference_history(project))<>2 then raise exception 'approved local choice missing from history'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.reference_signals) or exists(select 1 from public.piece_version_reference_links) then
    raise exception 'scoped signals crossed account isolation';
  end if;
end $$;
reset role;
rollback;
\echo 'Post reference scope checks passed; rolled back.'

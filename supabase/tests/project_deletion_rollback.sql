-- Only an empty isolated database, migrated through 00030. Never production.
-- Fresh psql connection with PGOPTIONS='-c compor.project_deletion_proof=allow-empty-isolated'.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('compor.project_deletion_proof',true) is distinct from 'allow-empty-isolated'
    or exists(select 1 from auth.users) or exists(select 1 from public.projects)
    or exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
    raise exception 'refusing unguarded database';
  end if;
end $$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.projects(id,title) values('33333333-3333-4333-8333-333333333333','Synthetic project');
do $$ declare p uuid:='33333333-3333-4333-8333-333333333333'; begin
  if public.delete_project_from_list(p,2)->>'status'<>'conflict' then raise exception 'missing revision check'; end if;
  if public.delete_project_from_list(p,1)->>'status'<>'deleted' then raise exception 'deletion failed'; end if;
  if public.delete_project_from_list(p,1)->>'status'<>'deleted' then raise exception 'retry not idempotent'; end if;
  if not exists(select 1 from public.projects where id=p and revision=2 and deleted_at is not null) then raise exception 'provenance removed or revision incremented twice'; end if;
  if exists(select 1 from public.projects where id=p and deleted_at is null) then raise exception 'project remains in active listing'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if public.delete_project_from_list('33333333-3333-4333-8333-333333333333',1)->>'status'<>'not_found' then raise exception 'cross-account deletion'; end if;
end $$;
reset role;
rollback;

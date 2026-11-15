-- Empty isolated database migrated through 00031 only. Never production.
-- PGOPTIONS='-c compor.post_catalog_proof=allow-empty-isolated'
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('compor.post_catalog_proof',true) is distinct from 'allow-empty-isolated'
    or exists(select 1 from auth.users) or exists(select 1 from public.projects)
    or exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
    raise exception 'refusing unguarded database';
  end if;
end $$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.projects(id,owner_id,title) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Synthetic project');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare p uuid:='33333333-3333-4333-8333-333333333333'; piece uuid:='44444444-4444-4444-8444-444444444444'; begin
  if public.create_project_post(p,piece,'Live gratuita')->>'status'<>'created' then raise exception 'creation failed'; end if;
  if public.create_project_post(p,piece,'Live gratuita')->>'status'<>'created' then raise exception 'creation not idempotent'; end if;
  if public.create_project_post(p,piece,'Outro nome')->>'status'<>'conflict' then raise exception 'name overwritten'; end if;
  if jsonb_array_length(public.list_project_posts(p))<>1 then raise exception 'catalog mismatch'; end if;
  begin update public.project_posts set name='Bypass';raise exception 'direct update accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare p uuid:='33333333-3333-4333-8333-333333333333'; piece uuid:='44444444-4444-4444-8444-444444444444'; begin
  if jsonb_array_length(public.list_project_posts(p))<>0 then raise exception 'cross-account read'; end if;
  if public.create_project_post(p,piece,'Bob')->>'status'<>'not_found' then raise exception 'cross-account creation'; end if;
  if public.delete_project_post(p,piece)->>'status'<>'not_found' then raise exception 'cross-account deletion'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare p uuid:='33333333-3333-4333-8333-333333333333'; piece uuid:='44444444-4444-4444-8444-444444444444'; begin
  if public.delete_project_post(p,piece)->>'status'<>'deleted' then raise exception 'deletion failed'; end if;
  if public.delete_project_post(p,piece)->>'status'<>'deleted' then raise exception 'deletion not idempotent'; end if;
  if public.create_project_post(p,piece,'Live gratuita')->>'status'<>'not_found' then raise exception 'deleted post resurrected'; end if;
  if not (public.list_project_posts(p)->0->>'deleted')::boolean then raise exception 'tombstone lost'; end if;
end $$;
reset role;
rollback;

-- Preserve the epoch of revocation independently of later account activity.
-- Historical tombstones remain NULL: the current epoch cannot prove when they
-- were created. No replay may backfill this evidence or advance account state.
alter table public.exploration_intent_revocations add column revocation_epoch bigint
  check (revocation_epoch>0 and revocation_epoch<=9007199254740991);

create or replace function public.revoke_exploration_intent(p_project_id uuid,p_intent_id uuid,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_epoch bigint; v_revocation_epoch bigint; v_row public.exploration_intents%rowtype;
begin
  if v_owner is null or p_project_id is null or p_intent_id is null or p_expected_epoch is null or p_expected_epoch<0 then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  insert into public.exploration_intent_epochs(owner_id) values(v_owner) on conflict do nothing;
  select epoch into v_epoch from public.exploration_intent_epochs where owner_id=v_owner;
  if exists(select 1 from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id<>p_project_id)
    or exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id and project_id<>p_project_id) then return jsonb_build_object('status','not_found'); end if;
  select revocation_epoch into v_revocation_epoch from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id and project_id=p_project_id;
  if found then return jsonb_build_object('status','revoked','epoch',v_epoch,'revocationEpoch',v_revocation_epoch); end if;
  select * into v_row from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id=p_project_id;
  if found then
    if v_row.epoch<>v_epoch or p_expected_epoch not in (v_row.expected_epoch,v_row.epoch) then return jsonb_build_object('status','conflict','epoch',v_epoch); end if;
  elsif p_expected_epoch<>v_epoch or exists(select 1 from public.exploration_intents where owner_id=v_owner and state='active') then return jsonb_build_object('status','conflict','epoch',v_epoch);
  end if;
  update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
  insert into public.exploration_intent_revocations(owner_id,intent_id,project_id,revocation_epoch) values(v_owner,p_intent_id,p_project_id,v_epoch);
  update public.exploration_intents set state='revoked',updated_at=clock_timestamp() where id=p_intent_id and owner_id=v_owner;
  return jsonb_build_object('status','revoked','epoch',v_epoch,'revocationEpoch',v_epoch);
end $$;

-- The deletion RPC holds the same account lock. Preserve the revocation's own
-- epoch even when subsequent activity belongs to another project or post.
create or replace function public.revoke_deleted_exploration_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_project uuid; v_piece uuid; v_intent uuid; v_epoch bigint;
begin
  if new.deleted_at is null then return new; end if;
  if tg_op='UPDATE' and old.deleted_at is not null then return new; end if;
  if tg_table_name='projects' then v_owner:=new.owner_id;v_project:=new.id;v_piece:=null;
  else v_project:=new.project_id;v_piece:=new.piece_id;select owner_id into v_owner from public.projects where id=v_project; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select id into v_intent from public.exploration_intents where owner_id=v_owner and project_id=v_project and state='active' and (v_piece is null or piece_id=v_piece);
  if found then
    update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
    insert into public.exploration_intent_revocations(owner_id,intent_id,project_id,revocation_epoch) values(v_owner,v_intent,v_project,v_epoch) on conflict do nothing;
    update public.exploration_intents set state='revoked',updated_at=clock_timestamp() where id=v_intent;
  end if;
  return new;
end $$;

create or replace function public.get_exploration_intent_state(p_project_id uuid,p_intent_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_epoch bigint; v_state text; v_intent_epoch bigint; v_revocation_epoch bigint;
begin
  if v_owner is null or not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return null; end if;
  select coalesce((select epoch from public.exploration_intent_epochs where owner_id=v_owner),0) into v_epoch;
  select revocation_epoch into v_revocation_epoch from public.exploration_intent_revocations where owner_id=v_owner and project_id=p_project_id and intent_id=p_intent_id;
  if found then return jsonb_build_object('state','revoked','epoch',v_epoch,'revocationEpoch',v_revocation_epoch); end if;
  select state,epoch into v_state,v_intent_epoch from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id=p_project_id;
  if not found then v_state:='absent';
  elsif v_state='active' and v_intent_epoch<>v_epoch then v_state:='revoked'; end if;
  return jsonb_build_object('state',v_state,'epoch',v_epoch,'revocationEpoch',null);
end $$;

-- CREATE OR REPLACE preserves existing grants; declare the intended boundary
-- explicitly so the additional evidence never opens direct table access.
revoke all on public.exploration_intent_revocations from public,anon,authenticated;
revoke all on function public.revoke_deleted_exploration_scope() from public,anon,authenticated;
revoke all on function public.revoke_exploration_intent(uuid,uuid,bigint),public.get_exploration_intent_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_exploration_intent(uuid,uuid,bigint),public.get_exploration_intent_state(uuid,uuid) to authenticated;

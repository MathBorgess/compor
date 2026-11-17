-- Admission capabilities are revocable independently of the old provider key.
-- A read or replay never creates authority. CAS rejects creations prepared by
-- an old tab before a pause, including revoke that wins before intent INSERT.
create table public.exploration_intent_epochs (
  owner_id uuid primary key references auth.users(id),
  epoch bigint not null default 0 check (epoch>=0 and epoch<=9007199254740991)
);
create table public.exploration_intent_revocations (
  owner_id uuid not null references auth.users(id),
  intent_id uuid not null,
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,intent_id)
);
create table public.exploration_intents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  piece_id uuid,
  batch_id uuid not null,
  context_digest text not null check (context_digest ~ '^[a-f0-9]{64}$'),
  credential_digest text not null check (credential_digest ~ '^[a-f0-9]{64}$'),
  proof_digest text not null check (proof_digest ~ '^[a-f0-9]{64}$'),
  purpose text not null check (purpose in ('batch','replacement')),
  position integer,
  previous_id uuid references public.exploration_images(id),
  state text not null default 'active' check (state in ('active','consumed','revoked')),
  expected_epoch bigint not null check (expected_epoch>=0),
  epoch bigint not null check (epoch>0 and epoch<=9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((purpose='batch' and position is null and previous_id is null)
    or (purpose='replacement' and position is not null and position between 1 and 3 and previous_id is not null))
);
create unique index exploration_one_active_intent_per_owner on public.exploration_intents(owner_id) where state='active';
alter table public.exploration_intent_epochs enable row level security;
alter table public.exploration_intent_revocations enable row level security;
alter table public.exploration_intents enable row level security;
revoke all on public.exploration_intent_epochs,public.exploration_intent_revocations,public.exploration_intents from public,anon,authenticated;

create function public.exploration_intent_record(p_row public.exploration_intents) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('intentId',p_row.id,'userId',p_row.owner_id,'projectId',p_row.project_id,'conversationId',coalesce(p_row.piece_id::text,'references'),
    'batchId',p_row.batch_id,'contextDigest',p_row.context_digest,'credentialDigest',p_row.credential_digest,'purpose',p_row.purpose,
    'position',p_row.position,'previousId',p_row.previous_id,'state',p_row.state,'epoch',p_row.epoch);
$$;
revoke all on function public.exploration_intent_record(public.exploration_intents) from public,anon,authenticated;
create function public.get_exploration_intent_epoch() returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce((select epoch from public.exploration_intent_epochs where owner_id=auth.uid()),0);
$$;

create function public.reserve_exploration_intent(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_intent_id uuid,p_expected_epoch bigint,
  p_context_digest text,p_credential_digest text,p_proof_digest text,p_purpose text,p_position integer,p_previous_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_row public.exploration_intents%rowtype; v_epoch bigint;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_intent_id is null or p_expected_epoch is null or p_expected_epoch<0 or p_expected_epoch>=9007199254740991
    or p_context_digest is null or p_context_digest !~ '^[a-f0-9]{64}$' or p_credential_digest is null or p_credential_digest !~ '^[a-f0-9]{64}$'
    or p_proof_digest is null or p_proof_digest !~ '^[a-f0-9]{64}$' or p_purpose is null or p_purpose not in ('batch','replacement')
    or (p_purpose='batch' and (p_position is not null or p_previous_id is not null))
    or (p_purpose='replacement' and (p_position is null or p_position not between 1 and 3 or p_previous_id is null))
    then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  select * into v_row from public.exploration_intents where id=p_intent_id;
  if found then
    if v_row.owner_id<>v_owner or v_row.project_id<>p_project_id or v_row.piece_id is distinct from p_piece_id or v_row.batch_id<>p_batch_id
      or v_row.context_digest<>p_context_digest or v_row.credential_digest<>p_credential_digest or v_row.expected_epoch<>p_expected_epoch
      or v_row.purpose<>p_purpose or v_row.position is distinct from p_position or v_row.previous_id is distinct from p_previous_id
      then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','existing','intent',public.exploration_intent_record(v_row));
  end if;
  if exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id) then return jsonb_build_object('status','revoked'); end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null))
    then return jsonb_build_object('status','not_found'); end if;
  insert into public.exploration_intent_epochs(owner_id) values(v_owner) on conflict do nothing;
  select epoch into v_epoch from public.exploration_intent_epochs where owner_id=v_owner;
  if p_expected_epoch<>v_epoch then return jsonb_build_object('status','conflict'); end if;
  if exists(select 1 from public.exploration_intents where owner_id=v_owner and state='active') then return jsonb_build_object('status','busy'); end if;
  if p_purpose='replacement' and not exists(
    select 1 from public.exploration_batches b join public.exploration_batch_slots s on s.batch_id=b.id
      join public.exploration_images e on e.id=s.current_image_id
    where b.id=p_batch_id and b.owner_id=v_owner and b.project_id=p_project_id and b.piece_id is not distinct from p_piece_id
      and b.closed_at is null and s.position=p_position and s.current_image_id=p_previous_id and e.state='rejected'
  ) then return jsonb_build_object('status','conflict'); end if;
  update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
  insert into public.exploration_intents(id,owner_id,project_id,piece_id,batch_id,context_digest,credential_digest,proof_digest,purpose,position,previous_id,expected_epoch,epoch)
    values(p_intent_id,v_owner,p_project_id,p_piece_id,p_batch_id,p_context_digest,p_credential_digest,p_proof_digest,p_purpose,p_position,p_previous_id,p_expected_epoch,v_epoch) returning * into v_row;
  return jsonb_build_object('status','reserved','intent',public.exploration_intent_record(v_row));
end $$;

create function public.revoke_exploration_intent(p_project_id uuid,p_intent_id uuid,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_epoch bigint; v_row public.exploration_intents%rowtype;
begin
  if v_owner is null or p_project_id is null or p_intent_id is null or p_expected_epoch is null or p_expected_epoch<0 then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  insert into public.exploration_intent_epochs(owner_id) values(v_owner) on conflict do nothing;
  select epoch into v_epoch from public.exploration_intent_epochs where owner_id=v_owner;
  if exists(select 1 from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id<>p_project_id)
    or exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id and project_id<>p_project_id) then return jsonb_build_object('status','not_found'); end if;
  if exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id and project_id=p_project_id) then return jsonb_build_object('status','revoked','epoch',v_epoch); end if;
  select * into v_row from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id=p_project_id;
  if found then
    if v_row.epoch<>v_epoch or p_expected_epoch not in (v_row.expected_epoch,v_row.epoch) then return jsonb_build_object('status','conflict','epoch',v_epoch); end if;
  elsif p_expected_epoch<>v_epoch or exists(select 1 from public.exploration_intents where owner_id=v_owner and state='active') then return jsonb_build_object('status','conflict','epoch',v_epoch);
  end if;
  insert into public.exploration_intent_revocations(owner_id,intent_id,project_id) values(v_owner,p_intent_id,p_project_id);
  update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
  update public.exploration_intents set state='revoked',updated_at=clock_timestamp() where id=p_intent_id and owner_id=v_owner;
  return jsonb_build_object('status','revoked','epoch',v_epoch);
end $$;

-- Deleting an idle scope revokes its metadata capability without inventing a
-- paid cancellation. The deletion RPC already holds the account lock and has
-- refused running/unknown effects. Other scopes/intents remain untouched.
create function public.revoke_deleted_exploration_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_project uuid; v_piece uuid; v_intent uuid;
begin
  if new.deleted_at is null then return new; end if;
  if tg_op='UPDATE' and old.deleted_at is not null then return new; end if;
  if tg_table_name='projects' then v_owner:=new.owner_id;v_project:=new.id;v_piece:=null;
  else v_project:=new.project_id;v_piece:=new.piece_id;select owner_id into v_owner from public.projects where id=v_project; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select id into v_intent from public.exploration_intents where owner_id=v_owner and project_id=v_project and state='active' and (v_piece is null or piece_id=v_piece);
  if found then
    insert into public.exploration_intent_revocations(owner_id,intent_id,project_id) values(v_owner,v_intent,v_project) on conflict do nothing;
    update public.exploration_intents set state='revoked',updated_at=clock_timestamp() where id=v_intent;
    update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner;
  end if;
  return new;
end $$;
revoke all on function public.revoke_deleted_exploration_scope() from public,anon,authenticated;
create trigger exploration_intent_project_deleted after update of deleted_at on public.projects for each row execute function public.revoke_deleted_exploration_scope();
create trigger exploration_intent_post_deleted after insert or update of deleted_at on public.project_posts for each row execute function public.revoke_deleted_exploration_scope();

-- Internal predicate; raw secret never leaves the server/database call.
create function public.check_exploration_intent(p_owner uuid,p_project uuid,p_piece uuid,p_batch uuid,p_intent uuid,p_secret text,p_purpose text,p_position integer,p_previous uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then return false; end if;
  return exists(select 1 from public.exploration_intents i join public.exploration_intent_epochs e on e.owner_id=i.owner_id and e.epoch=i.epoch
    where i.id=p_intent and i.owner_id=p_owner and i.project_id=p_project and i.piece_id is not distinct from p_piece
      and i.batch_id=p_batch and i.state='active' and i.purpose=p_purpose and i.position is not distinct from p_position and i.previous_id is not distinct from p_previous
      and i.proof_digest=encode(sha256(decode(p_secret,'hex')),'hex'));
end $$;
revoke all on function public.check_exploration_intent(uuid,uuid,uuid,uuid,uuid,text,text,integer,uuid) from public,anon,authenticated;

-- Only the new overloads may create paid admission. Historical receipt GET,
-- bind/finish and completion stay available after pause or credential change.
revoke execute on function public.reserve_exploration_plan(uuid,uuid,uuid,uuid,text,text),
  public.reserve_exploration_batch_proven(uuid,uuid,uuid,text,uuid[],text[],text[]),
  public.replace_rejected_exploration_batch_slot_proven(uuid,uuid,integer,uuid,uuid,text,text) from authenticated;
create function public.reserve_exploration_plan(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_request_id uuid,p_input_digest text,p_completion_digest text,p_intent_id uuid,p_intent_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null then raise exception 'unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.exploration_planning_attempts where request_id=p_request_id and owner_id=v_owner and project_id=p_project_id)
    and not public.check_exploration_intent(v_owner,p_project_id,p_piece_id,p_batch_id,p_intent_id,p_intent_secret,'batch',null,null)
    then return jsonb_build_object('status','conflict'); end if;
  return public.reserve_exploration_plan(p_project_id,p_piece_id,p_batch_id,p_request_id,p_input_digest,p_completion_digest);
end $$;
create function public.reserve_exploration_batch_proven(p_project_id uuid,p_batch_id uuid,p_piece_id uuid,p_plan_digest text,p_image_ids uuid[],p_prompt_digests text[],p_rejection_digests text[],p_intent_id uuid,p_intent_secret text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_state text; v_new boolean;
begin
  if v_owner is null then raise exception 'unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.exploration_batches where id=p_batch_id and owner_id=v_owner and project_id=p_project_id)
    and not public.check_exploration_intent(v_owner,p_project_id,p_piece_id,p_batch_id,p_intent_id,p_intent_secret,'batch',null,null)
    then return query select 'revoked'::text,false; return; end if;
  select r.state,r.is_new into v_state,v_new from public.reserve_exploration_batch_proven(p_project_id,p_batch_id,p_piece_id,p_plan_digest,p_image_ids,p_prompt_digests,p_rejection_digests) r;
  if v_new then update public.exploration_intents set state='consumed',updated_at=clock_timestamp() where id=p_intent_id and owner_id=v_owner; end if;
  return query select v_state,v_new;
end $$;
create function public.replace_rejected_exploration_batch_slot_proven(p_project_id uuid,p_batch_id uuid,p_position integer,p_previous_id uuid,p_id uuid,p_prompt_digest text,p_rejection_digest text,p_intent_id uuid,p_intent_secret text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_piece uuid; v_state text; v_new boolean;
begin
  if v_owner is null then raise exception 'unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select piece_id into v_piece from public.exploration_batches where id=p_batch_id and owner_id=v_owner and project_id=p_project_id;
  if not exists(select 1 from public.exploration_images where id=p_id and owner_id=v_owner and project_id=p_project_id)
    and not public.check_exploration_intent(v_owner,p_project_id,v_piece,p_batch_id,p_intent_id,p_intent_secret,'replacement',p_position,p_previous_id)
    then return query select 'revoked'::text,false; return; end if;
  select r.state,r.is_new into v_state,v_new from public.replace_rejected_exploration_batch_slot_proven(p_project_id,p_batch_id,p_position,p_previous_id,p_id,p_prompt_digest,p_rejection_digest) r;
  if v_new then update public.exploration_intents set state='consumed',updated_at=clock_timestamp() where id=p_intent_id and owner_id=v_owner; end if;
  return query select v_state,v_new;
end $$;
revoke all on function public.get_exploration_intent_epoch(),public.reserve_exploration_intent(uuid,uuid,uuid,uuid,bigint,text,text,text,text,integer,uuid),
  public.revoke_exploration_intent(uuid,uuid,bigint),public.reserve_exploration_plan(uuid,uuid,uuid,uuid,text,text,uuid,text),
  public.reserve_exploration_batch_proven(uuid,uuid,uuid,text,uuid[],text[],text[],uuid,text),
  public.replace_rejected_exploration_batch_slot_proven(uuid,uuid,integer,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.get_exploration_intent_epoch(),public.reserve_exploration_intent(uuid,uuid,uuid,uuid,bigint,text,text,text,text,integer,uuid),
  public.revoke_exploration_intent(uuid,uuid,bigint),public.reserve_exploration_plan(uuid,uuid,uuid,uuid,text,text,uuid,text),
  public.reserve_exploration_batch_proven(uuid,uuid,uuid,text,uuid[],text[],text[],uuid,text),
  public.replace_rejected_exploration_batch_slot_proven(uuid,uuid,integer,uuid,uuid,text,text,uuid,text) to authenticated;

create function public.get_exploration_intent_state(p_project_id uuid,p_intent_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_epoch bigint; v_state text; v_intent_epoch bigint;
begin
  if v_owner is null or not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return null; end if;
  select coalesce((select epoch from public.exploration_intent_epochs where owner_id=v_owner),0) into v_epoch;
  if exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and project_id=p_project_id and intent_id=p_intent_id)
    then return jsonb_build_object('state','revoked','epoch',v_epoch); end if;
  select state,epoch into v_state,v_intent_epoch from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id=p_project_id;
  if not found then v_state:='absent';
  elsif v_state='active' and v_intent_epoch<>v_epoch then v_state:='revoked'; end if;
  return jsonb_build_object('state',v_state,'epoch',v_epoch);
end $$;
revoke all on function public.get_exploration_intent_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_exploration_intent_state(uuid,uuid) to authenticated;

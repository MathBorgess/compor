-- The review window starts with the first reservation after this migration.
-- Existing images and versions remain unchanged and do not count retroactively.
create table public.exploration_review_gates (
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  epoch integer not null default 1 check (epoch > 0),
  baseline_ordinal integer not null check (baseline_ordinal >= 0),
  batch_number integer not null default 1 check (batch_number > 0),
  completed_in_batch integer not null default 0 check (completed_in_batch between 0 and 2),
  batch_engaged boolean not null default false,
  unattended_batches integer not null default 0 check (unattended_batches between 0 and 2),
  awaiting_feedback boolean not null default false,
  primary key(owner_id,project_id)
);
alter table public.exploration_review_gates enable row level security;
revoke all on public.exploration_review_gates from public,anon,authenticated;
grant select on public.exploration_review_gates to authenticated;
create policy exploration_review_gate_owner on public.exploration_review_gates for select to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));

alter table public.exploration_images add column review_epoch integer;
alter table public.exploration_images add column review_batch_number integer;
alter table public.exploration_images add constraint exploration_review_batch_valid check (
  (review_epoch is null and review_batch_number is null) or (review_epoch > 0 and review_batch_number > 0)
);

-- Call only while holding the account-wide advisory transaction lock.
create function public.ensure_exploration_review_gate(p_owner uuid,p_project uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.exploration_review_gates(owner_id,project_id,baseline_ordinal)
    select p_owner,p_project,coalesce(max(e.ordinal),0) from public.exploration_images e
    where e.owner_id=p_owner and e.project_id=p_project
    on conflict(owner_id,project_id) do nothing;
end $$;
revoke all on function public.ensure_exploration_review_gate(uuid,uuid) from public,anon,authenticated;

create or replace function public.reserve_exploration_image(p_project_id uuid,p_id uuid,p_prompt_digest text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_row public.exploration_images%rowtype;
begin
  if v_owner is null or p_id is null or p_project_id is null or p_prompt_digest is null or p_prompt_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner) then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_row from public.exploration_images e where e.id=p_id and e.owner_id=v_owner;
  if found then
    if v_row.project_id<>p_project_id or v_row.prompt_digest<>p_prompt_digest then raise exception 'unavailable' using errcode='42501'; end if;
    return query select v_row.state,false; return;
  end if;
  if exists(select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='unknown') or exists(select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='unknown') then return query select 'blocked'::text,false; return; end if;
  if exists(select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='running') or exists(select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='running') or exists(select 1 from public.foreground_image_waits w where w.owner_id=v_owner and w.expires_at>now()) then return query select 'busy'::text,false; return; end if;
  perform public.ensure_exploration_review_gate(v_owner,p_project_id);
  if exists(select 1 from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id and g.awaiting_feedback) then return query select 'awaiting_feedback'::text,false; return; end if;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state) values(p_id,v_owner,p_project_id,p_prompt_digest,'running');
  return query select 'running'::text,true;
end $$;

create or replace function public.reserve_exploration_image_batched(p_project_id uuid,p_id uuid,p_prompt_digest text,p_batch_id uuid,p_batch_position integer)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_state text; v_new boolean; v_batch uuid; v_position integer;
begin
  if v_owner is null or p_batch_id is null or p_batch_position is null or p_batch_position not between 1 and 3 then raise exception 'invalid request' using errcode='22023'; end if;
  select r.state,r.is_new into v_state,v_new from public.reserve_exploration_image(p_project_id,p_id,p_prompt_digest) r;
  if v_new then
    update public.exploration_images e set batch_id=p_batch_id,batch_position=p_batch_position where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id;
    if not found then raise exception 'unavailable' using errcode='42501'; end if;
  elsif v_state not in ('busy','blocked','awaiting_feedback') then
    select e.batch_id,e.batch_position into v_batch,v_position from public.exploration_images e where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id;
    if not found or v_batch is distinct from p_batch_id or v_position is distinct from p_batch_position then raise exception 'unavailable' using errcode='42501'; end if;
  end if;
  return query select v_state,v_new;
end $$;

create or replace function public.finish_exploration_image(p_project_id uuid,p_id uuid,p_state text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_image public.exploration_images%rowtype; v_gate public.exploration_review_gates%rowtype;
begin
  if v_owner is null or p_state not in ('unknown','completed') then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if p_state='completed' and not exists(select 1 from storage.objects o where o.bucket_id='compor-exploration-images' and o.name=v_owner::text||'/'||p_project_id::text||'/'||p_id::text||'.png') then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_images e set state=p_state,updated_at=now() where e.id=p_id and e.project_id=p_project_id and e.owner_id=v_owner and (e.state='running' or (p_state='completed' and e.state='unknown')) returning * into v_image;
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  if p_state='completed' then
    perform public.ensure_exploration_review_gate(v_owner,p_project_id);
    select * into v_gate from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id;
    if v_image.ordinal>v_gate.baseline_ordinal then
      update public.exploration_images set review_epoch=v_gate.epoch,review_batch_number=v_gate.batch_number where id=p_id;
      update public.exploration_review_gates set
        completed_in_batch=case when v_gate.completed_in_batch=2 then 0 else v_gate.completed_in_batch+1 end,
        batch_number=case when v_gate.completed_in_batch=2 then v_gate.batch_number+1 else v_gate.batch_number end,
        unattended_batches=case when v_gate.completed_in_batch=2 and not v_gate.batch_engaged then least(2,v_gate.unattended_batches+1) else v_gate.unattended_batches end,
        awaiting_feedback=case when v_gate.completed_in_batch=2 and not v_gate.batch_engaged and v_gate.unattended_batches>=1 then true else v_gate.awaiting_feedback end,
        batch_engaged=case when v_gate.completed_in_batch=2 then false else v_gate.batch_engaged end
        where owner_id=v_owner and project_id=p_project_id;
    end if;
  end if;
  return true;
end $$;

-- A selection is an interaction, not an assertion about taste. The signal and
-- completion use the same account lock, making the ordering deterministic.
create function public.record_exploration_gate_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_image public.exploration_images%rowtype; v_gate public.exploration_review_gates%rowtype;
begin
  if new.action<>'selected' and length(trim(new.comment))=0 then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));
  select * into v_image from public.exploration_images e where e.id=new.image_id and e.owner_id=new.owner_id and e.project_id=new.project_id;
  select * into v_gate from public.exploration_review_gates g where g.owner_id=new.owner_id and g.project_id=new.project_id;
  if v_gate.owner_id is null or v_gate.awaiting_feedback or v_image.review_epoch is distinct from v_gate.epoch or v_image.review_batch_number is null then return new; end if;
  if v_image.review_batch_number >= v_gate.batch_number-v_gate.unattended_batches and v_image.review_batch_number <= v_gate.batch_number then
    update public.exploration_review_gates set unattended_batches=0,batch_engaged=(batch_engaged or v_image.review_batch_number=v_gate.batch_number) where owner_id=new.owner_id and project_id=new.project_id;
  end if;
  return new;
end $$;
revoke all on function public.record_exploration_gate_interaction() from public,anon,authenticated;
create trigger exploration_gate_interaction_after_insert after insert on public.generated_image_signals for each row execute function public.record_exploration_gate_interaction();

create function public.resume_exploration_review(p_project_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_gate public.exploration_review_gates%rowtype;
begin
  if v_owner is null or p_project_id is null then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner) then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_gate from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id;
  if not found or not v_gate.awaiting_feedback then return 'not_paused'; end if;
  if exists(select 1 from public.exploration_images e where e.owner_id=v_owner and e.state in ('unknown','running')) or exists(select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state in ('unknown','running')) then return 'blocked'; end if;
  update public.exploration_review_gates set epoch=epoch+1,baseline_ordinal=(select coalesce(max(e.ordinal),0) from public.exploration_images e where e.owner_id=v_owner and e.project_id=p_project_id),batch_number=1,completed_in_batch=0,batch_engaged=false,unattended_batches=0,awaiting_feedback=false where owner_id=v_owner and project_id=p_project_id;
  return 'resumed';
end $$;
revoke all on function public.resume_exploration_review(uuid) from public,anon,authenticated;
grant execute on function public.resume_exploration_review(uuid) to authenticated;

create function public.exploration_review_status(p_project_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_paused boolean;
begin
  if v_owner is null or p_project_id is null then raise exception 'invalid request' using errcode='22023'; end if;
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner) then raise exception 'unavailable' using errcode='42501'; end if;
  select g.awaiting_feedback into v_paused from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id;
  return case when coalesce(v_paused,false) then 'awaiting_feedback' else 'active' end;
end $$;
revoke all on function public.exploration_review_status(uuid) from public,anon,authenticated;
grant execute on function public.exploration_review_status(uuid) to authenticated;

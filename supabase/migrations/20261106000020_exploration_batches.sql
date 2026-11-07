-- Apply only after isolated RLS and concurrency validation. Preserve existing images.
alter table public.exploration_images add column ordinal integer;
alter table public.exploration_images add column batch_id uuid;
alter table public.exploration_images add column batch_position integer;

with numbered as (
  select id, row_number() over (partition by owner_id,project_id order by created_at,id)::integer as position
  from public.exploration_images
)
update public.exploration_images e set ordinal=n.position from numbered n where n.id=e.id;

alter table public.exploration_images alter column ordinal set not null;
alter table public.exploration_images add constraint exploration_ordinal_positive check (ordinal>0);
alter table public.exploration_images add constraint exploration_batch_position_valid check (
  (batch_id is null and batch_position is null) or (batch_id is not null and batch_position between 1 and 3)
);
create unique index exploration_ordinal_per_project on public.exploration_images(owner_id,project_id,ordinal);
create unique index exploration_position_per_batch on public.exploration_images(owner_id,project_id,batch_id,batch_position) where batch_id is not null;

-- All inserts, including legacy MCP reservations, obtain the same per-owner lock.
create function public.assign_exploration_ordinal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));
  select coalesce(max(e.ordinal),0)+1 into new.ordinal from public.exploration_images e
    where e.owner_id=new.owner_id and e.project_id=new.project_id;
  return new;
end;
$$;
revoke all on function public.assign_exploration_ordinal() from public,anon,authenticated;
create trigger exploration_ordinal_before_insert before insert on public.exploration_images
  for each row execute function public.assign_exploration_ordinal();

-- The existing authorization and account-wide gate run in the same transaction.
create function public.reserve_exploration_image_batched(p_project_id uuid,p_id uuid,p_prompt_digest text,p_batch_id uuid,p_batch_position integer)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_state text; v_new boolean; v_batch uuid; v_position integer;
begin
  if v_owner is null or p_batch_id is null or p_batch_position is null or p_batch_position not between 1 and 3 then
    raise exception 'invalid request' using errcode='22023';
  end if;
  select r.state,r.is_new into v_state,v_new from public.reserve_exploration_image(p_project_id,p_id,p_prompt_digest) r;
  if v_new then
    update public.exploration_images e set batch_id=p_batch_id,batch_position=p_batch_position
      where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id;
    if not found then raise exception 'unavailable' using errcode='42501'; end if;
  elsif v_state not in ('busy','blocked') then
    select e.batch_id,e.batch_position into v_batch,v_position from public.exploration_images e
      where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id;
    if not found or v_batch is distinct from p_batch_id or v_position is distinct from p_batch_position then
      raise exception 'unavailable' using errcode='42501';
    end if;
  end if;
  return query select v_state,v_new;
end;
$$;
revoke all on function public.reserve_exploration_image_batched(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_exploration_image_batched(uuid,uuid,text,uuid,integer) to authenticated;

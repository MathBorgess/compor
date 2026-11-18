-- A parallel review request belongs to one active intent and can reset the
-- feedback window at most once. Legacy serial/MCP review remains unchanged.
alter table public.exploration_intents add column review_resume_status text;
alter table public.exploration_intents add column review_resume_epoch integer;
alter table public.exploration_intents add constraint exploration_intent_review_receipt_valid check (
  (review_resume_status is null and review_resume_epoch is null)
  or (review_resume_status is not null and review_resume_status in ('resumed','not_paused') and review_resume_epoch is not null and review_resume_epoch>0)
);

create function public.resume_exploration_parallel_review(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_intent_id uuid,p_intent_secret text,p_expected_epoch bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_intent public.exploration_intents%rowtype; v_status text; v_review_epoch integer; v_admission text;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_intent_id is null or p_expected_epoch is null or p_expected_epoch<=0 or p_expected_epoch>9007199254740991
    then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null))
    then return jsonb_build_object('status','not_found'); end if;
  select * into v_intent from public.exploration_intents where id=p_intent_id and owner_id=v_owner and project_id=p_project_id
    and piece_id is not distinct from p_piece_id and batch_id=p_batch_id and purpose='batch';
  if not found then return jsonb_build_object('status','revoked'); end if;
  if v_intent.epoch<>p_expected_epoch then return jsonb_build_object('status','conflict'); end if;
  if not public.check_exploration_intent(v_owner,p_project_id,p_piece_id,p_batch_id,p_intent_id,p_intent_secret,'batch',null,null)
    then return jsonb_build_object('status','revoked'); end if;
  if v_intent.review_resume_status is not null then
    return jsonb_build_object('status',v_intent.review_resume_status,'intentEpoch',v_intent.epoch,'reviewEpoch',v_intent.review_resume_epoch);
  end if;

  -- Pending effects and a partial batch cannot be cleared by a feedback reset.
  -- Cooldown is left to paid admission; this RPC never changes its deadline.
  v_admission:=public.exploration_batch_admission(v_owner,p_project_id);
  if v_admission not in ('ready','awaiting_feedback','cooldown') then return jsonb_build_object('status','blocked'); end if;
  v_status:=public.resume_exploration_review(p_project_id);
  if v_status='blocked' then return jsonb_build_object('status','blocked'); end if;
  select epoch into v_review_epoch from public.exploration_review_gates where owner_id=v_owner and project_id=p_project_id;
  update public.exploration_intents set review_resume_status=v_status,review_resume_epoch=v_review_epoch,updated_at=clock_timestamp()
    where id=p_intent_id and owner_id=v_owner;
  return jsonb_build_object('status',v_status,'intentEpoch',v_intent.epoch,'reviewEpoch',v_review_epoch);
end $$;

-- A historical receipt proves only that the feedback request was handled.
-- It does not establish active authority or authorize a paid retry.
create function public.get_exploration_parallel_review(p_project_id uuid,p_intent_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status',i.review_resume_status,'intentEpoch',i.epoch,'reviewEpoch',i.review_resume_epoch)
  from public.exploration_intents i join public.projects p on p.id=i.project_id
  where i.id=p_intent_id and i.project_id=p_project_id and i.owner_id=auth.uid() and p.owner_id=auth.uid()
    and i.review_resume_status is not null;
$$;

revoke all on public.exploration_intents from public,anon,authenticated;
revoke all on function public.resume_exploration_parallel_review(uuid,uuid,uuid,uuid,text,bigint),public.get_exploration_parallel_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resume_exploration_parallel_review(uuid,uuid,uuid,uuid,text,bigint),public.get_exploration_parallel_review(uuid,uuid) to authenticated;

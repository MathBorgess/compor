-- The visual review receipt and the selection check share the account lock.
create function public.resume_exploration_parallel_review_authorized(
  p_project_id uuid, p_piece_id uuid, p_batch_id uuid, p_intent_id uuid,
  p_intent_secret text, p_expected_epoch bigint, p_authority_request_id uuid,
  p_manifest_digest text, p_consent_secret text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'invalid request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not coalesce(public.check_reference_authority(
    p_project_id,p_piece_id,p_authority_request_id,p_batch_id,'parallel',p_manifest_digest,p_consent_secret
  ),false) then
    return jsonb_build_object('status','revoked');
  end if;
  return public.resume_exploration_parallel_review(
    p_project_id,p_piece_id,p_batch_id,p_intent_id,p_intent_secret,p_expected_epoch
  );
end $$;
revoke all on function public.resume_exploration_parallel_review_authorized(uuid,uuid,uuid,uuid,text,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resume_exploration_parallel_review_authorized(uuid,uuid,uuid,uuid,text,bigint,uuid,text,text) to authenticated;

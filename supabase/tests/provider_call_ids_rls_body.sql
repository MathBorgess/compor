-- Metadata only. Do not run outside the generated guarded transaction.
DO $$ BEGIN IF current_setting('compor_studio_proof.guarded',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'prepare the guarded proof'; END IF; END $$;
SELECT gen_random_uuid() AS exec_request_a,gen_random_uuid() AS exec_request_b \gset
SELECT set_config('compor_call_test.request_a',:'exec_request_a',true),set_config('compor_call_test.request_b',:'exec_request_b',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'user_a',true);
DO $$
DECLARE p uuid:=current_setting('compor_studio_test.project_a')::uuid; piece uuid:=current_setting('compor_studio_test.piece_a')::uuid;
 req uuid:=current_setting('compor_call_test.request_a')::uuid; parent uuid; r jsonb; first jsonb; img record; duplicate record; denied boolean;
BEGIN
 r:=public.reserve_studio_turn(p,req,repeat('d',64));
 IF r->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'exec turn reserve failed'; END IF;
 parent:=(r#>>'{turn,attempt_id}')::uuid;PERFORM set_config('compor_call_test.attempt_a',parent::text,true);
 IF NOT public.bind_studio_session(p,req,'v4.execfixture.proof',now()+interval '4 minutes',null,0,0) THEN RAISE EXCEPTION 'exec turn binding failed'; END IF;
 IF NOT public.set_studio_turn_state(p,req,'action_required','turn_exec_fixture') THEN RAISE EXCEPTION 'exec action state failed'; END IF;
 first:=public.claim_studio_action(p,req,'turn_exec_fixture','exec_fixture',repeat('a',64),repeat('b',64));
 IF first->>'status' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'exec studio claim failed'; END IF;
 PERFORM set_config('compor_call_test.action_a',first->>'id',true);
 IF public.claim_studio_action(p,req,'turn_exec_fixture','exec_fixture',repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'existing'
  OR public.claim_studio_action(p,req,'turn_exec_fixture','exec_fixture',repeat('c',64),repeat('b',64))->>'status' IS DISTINCT FROM 'conflict'
  OR public.claim_studio_action(p,req,'turn_exec_fixture','exec_fixture',repeat('a',64),repeat('c',64))->>'status' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'exec claim idempotency/conflict failed'; END IF;
 IF public.claim_studio_action(p,req,'turn_exec_fixture','call_fixture',repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'opaque prefixes were normalized'; END IF;
 IF public.get_studio_action(p,req,'turn_exec_fixture','exec_fixture')->>'state' IS DISTINCT FROM 'sending' THEN RAISE EXCEPTION 'exec receipt lookup failed'; END IF;
 IF NOT public.finish_studio_action(p,req,(first->>'id')::uuid,'accepted') THEN RAISE EXCEPTION 'exec receipt finish failed'; END IF;
 IF public.finish_studio_action(p,req,(first->>'id')::uuid,'unknown') THEN RAISE EXCEPTION 'exec terminal receipt reopened'; END IF;
 SELECT * INTO img FROM public.reserve_image_tool_call(p,piece,1,parent,'sess_exec_fixture','turn_exec_fixture','exec_fixture');
 IF NOT img.is_new THEN RAISE EXCEPTION 'exec image reservation failed'; END IF;
 SELECT * INTO duplicate FROM public.reserve_image_tool_call(p,piece,1,parent,'sess_exec_fixture','turn_exec_fixture','exec_fixture');
 IF duplicate.is_new OR duplicate.reservation_id IS DISTINCT FROM img.reservation_id THEN RAISE EXCEPTION 'exec image reservation duplicated'; END IF;
 denied:=false;BEGIN PERFORM public.reserve_image_tool_call(p,piece,2,parent,'sess_exec_fixture','turn_exec_fixture','exec_fixture');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'exec image call moved to another version'; END IF;
 IF NOT public.mark_image_tool_call_unknown(p,'sess_exec_fixture','turn_exec_fixture','exec_fixture') THEN RAISE EXCEPTION 'exec image unknown transition failed'; END IF;
 SELECT * INTO duplicate FROM public.reserve_image_tool_call(p,piece,1,parent,'sess_exec_fixture','turn_exec_fixture','exec_fixture');
 IF duplicate.is_new OR duplicate.state IS DISTINCT FROM 'unknown' THEN RAISE EXCEPTION 'uncertain exec reservation restarted'; END IF;
 IF public.claim_studio_action(p,req,'turn_exec_fixture','exec_'||repeat('x',128),repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'exec bound rejected'; END IF;
 denied:=false;BEGIN PERFORM public.claim_studio_action(p,req,'turn_exec_fixture','exec_'||repeat('x',129),repeat('a',64),repeat('b',64));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'overlong exec action accepted'; END IF;
 denied:=false;BEGIN PERFORM public.reserve_image_tool_call(p,piece,1,parent,'sess_exec_fixture','turn_exec_fixture','exec_'||repeat('x',129));EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'overlong exec image call accepted'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',:'user_b',true);
DO $$
DECLARE p uuid:=current_setting('compor_studio_test.project_a')::uuid; q uuid:=current_setting('compor_studio_test.project_b')::uuid;
 req uuid:=current_setting('compor_call_test.request_a')::uuid; own_req uuid:=current_setting('compor_call_test.request_b')::uuid;
 parent uuid:=current_setting('compor_call_test.attempt_a')::uuid; r jsonb; denied boolean;
BEGIN
 IF public.claim_studio_action(p,req,'turn_exec_fixture','exec_fixture',repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'unavailable'
  OR public.get_studio_action(p,req,'turn_exec_fixture','exec_fixture') IS NOT NULL
  OR public.finish_studio_action(p,req,current_setting('compor_call_test.action_a')::uuid,'unknown') THEN RAISE EXCEPTION 'cross-account exec action accepted'; END IF;
 denied:=false;BEGIN PERFORM public.reserve_image_tool_call(p,current_setting('compor_studio_test.piece_a')::uuid,1,parent,'sess_exec_fixture','turn_exec_fixture','exec_fixture');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-account exec image reservation accepted'; END IF;
 r:=public.reserve_studio_turn(q,own_req,repeat('d',64));
 IF r->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'second owner exec reserve failed'; END IF;
 IF NOT public.bind_studio_session(q,own_req,'v4.execfixtureB.proof',now()+interval '4 minutes',null,0,0) THEN RAISE EXCEPTION 'second owner exec binding failed'; END IF;
 IF NOT public.set_studio_turn_state(q,own_req,'action_required','turn_exec_fixture_b') THEN RAISE EXCEPTION 'second owner exec state failed'; END IF;
 IF public.claim_studio_action(q,own_req,'turn_exec_fixture_b','exec_owned_b',repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'second owner exec claim failed'; END IF;
 denied:=false;BEGIN UPDATE public.studio_action_submissions SET call_id='exec_bypass';EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'direct exec table write accepted'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false;BEGIN
 BEGIN PERFORM public.claim_studio_action(current_setting('compor_studio_test.project_a')::uuid,current_setting('compor_call_test.request_a')::uuid,'turn_exec_fixture','exec_anonymous',repeat('a',64),repeat('b',64));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'anonymous exec action accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

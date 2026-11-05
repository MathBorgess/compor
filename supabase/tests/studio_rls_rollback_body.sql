-- Included only by prepare_studio_migrations.py, after locks, audit/schema/RPC
-- guards and baseline checksums. Never run this fragment directly.
DO $$ BEGIN IF current_setting('compor_studio_proof.guarded',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'prepare the guarded proof; never run this fragment'; END IF; END $$;
SELECT gen_random_uuid() AS user_a,gen_random_uuid() AS user_b,
 gen_random_uuid() AS project_a,gen_random_uuid() AS project_b,
 gen_random_uuid() AS piece_a,gen_random_uuid() AS piece_b,
 gen_random_uuid() AS request_a,gen_random_uuid() AS request_b,
 gen_random_uuid() AS request_a2,gen_random_uuid() AS request_b2 \gset
INSERT INTO auth.users(id) VALUES (:'user_a'::uuid),(:'user_b'::uuid);
INSERT INTO public.projects(id,owner_id,title) VALUES
 (:'project_a'::uuid,:'user_a'::uuid,'Synthetic studio A'),
 (:'project_b'::uuid,:'user_b'::uuid,'Synthetic studio B');
SELECT set_config('compor_studio_test.project_a',:'project_a',true),
 set_config('compor_studio_test.project_b',:'project_b',true),
 set_config('compor_studio_test.piece_a',:'piece_a',true),
 set_config('compor_studio_test.piece_b',:'piece_b',true),
 set_config('compor_studio_test.request_a',:'request_a',true),
 set_config('compor_studio_test.request_b',:'request_b',true),
 set_config('compor_studio_test.request_a2',:'request_a2',true),
 set_config('compor_studio_test.request_b2',:'request_b2',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'user_a',true);
DO $$
DECLARE
 p uuid:=current_setting('compor_studio_test.project_a')::uuid;
 q uuid:=current_setting('compor_studio_test.project_b')::uuid;
 piece uuid:=current_setting('compor_studio_test.piece_a')::uuid;
 req uuid:=current_setting('compor_studio_test.request_a')::uuid;
 req2 uuid:=current_setting('compor_studio_test.request_a2')::uuid;
 hash text:=repeat('a',64); r jsonb; receipt jsonb; denied boolean; content jsonb:='{"headline":"Synthetic workshop","price":"R$ 10","date":"Tomorrow","caption":"Synthetic caption","captionOrigin":"user"}';
BEGIN
 r:=public.reserve_studio_turn(p,req,hash);
 IF r->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'owner reserve failed'; END IF;
 IF public.reserve_studio_turn(p,req,hash)->>'status' IS DISTINCT FROM 'existing'
  OR public.reserve_studio_turn(p,req,repeat('b',64))->>'status' IS DISTINCT FROM 'conflict'
  OR public.reserve_studio_turn(p,req2,hash)->>'status' IS DISTINCT FROM 'busy' THEN RAISE EXCEPTION 'turn idempotency/busy guard failed'; END IF;
 IF public.get_studio_turn(p,req)->>'owner_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'owner turn read failed'; END IF;
 IF NOT public.bind_studio_session(p,req,'v4.synthetic.proof',now()+interval '4 minutes',null,0,0) THEN RAISE EXCEPTION 'owner binding failed'; END IF;
 IF public.bind_studio_session(p,req,'v4.other.proof',now()+interval '4 minutes',null,0,0) THEN RAISE EXCEPTION 'one-time binding failed'; END IF;
 IF NOT public.set_studio_turn_state(p,req,'action_required','turn_synthetic') THEN RAISE EXCEPTION 'action state failed'; END IF;
 receipt:=public.claim_studio_action(p,req,'turn_synthetic','call_synthetic',hash,repeat('b',64));
 IF receipt->>'status' IS DISTINCT FROM 'claimed' OR public.claim_studio_action(p,req,'turn_synthetic','call_synthetic',hash,repeat('b',64))->>'status' IS DISTINCT FROM 'existing'
  OR public.claim_studio_action(p,req,'turn_synthetic','call_synthetic',hash,repeat('c',64))->>'status' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'action receipt failed'; END IF;
 PERFORM set_config('compor_studio_test.action_a',receipt->>'id',true);
 IF NOT public.finish_studio_action(p,req,(receipt->>'id')::uuid,'accepted') THEN RAISE EXCEPTION 'action accepted receipt failed'; END IF;
 IF public.finish_studio_action(p,req,(receipt->>'id')::uuid,'unknown') THEN RAISE EXCEPTION 'action terminal receipt reopened'; END IF;
 IF public.get_studio_action(p,req,'turn_synthetic','call_synthetic')->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'action terminal receipt read failed'; END IF;
 IF NOT public.set_studio_turn_state(p,req,'completed','turn_synthetic') THEN RAISE EXCEPTION 'terminal turn completion failed'; END IF;
 IF public.set_studio_turn_state(p,req,'running','turn_synthetic') THEN RAISE EXCEPTION 'terminal turn reopened'; END IF;
 IF public.reserve_studio_turn(p,req2,hash)->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'completed turn did not release project'; END IF;
 PERFORM public.set_studio_turn_state(p,req2,'failed',null);
 r:=public.save_piece_version_v2(p,piece,0,0,content);
 IF r->>'status' IS DISTINCT FROM 'saved' OR r#>>'{version,metadata,approval,status}' IS DISTINCT FROM 'unapproved' THEN RAISE EXCEPTION 'initial version failed'; END IF;
 r:=public.approve_piece_version(p,piece,1,0);
 IF r->>'status' IS DISTINCT FROM 'approved' OR r#>>'{version,metadata,approval,kind}' IS DISTINCT FROM 'explicit' THEN RAISE EXCEPTION 'explicit approval failed'; END IF;
 r:=public.save_piece_version_v2(p,piece,1,1,content);
 IF r#>>'{version,metadata,approval,kind}' IS DISTINCT FROM 'inherited' OR (r#>>'{version,metadata,approval,sourceVersion}')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'approval inheritance failed'; END IF;
 r:=public.save_piece_version_v2(p,piece,2,1,content);
 IF (r#>>'{version,metadata,baseVersion}')::integer IS DISTINCT FROM 1 OR (r#>>'{version,version}')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'old version branch failed'; END IF;
 r:=public.save_piece_version(p,piece,3,content);
 IF r->>'status' IS DISTINCT FROM 'saved' OR (r->'version')?'metadata' THEN RAISE EXCEPTION 'legacy MCP response changed'; END IF;
 IF public.save_piece_version_v2(p,piece,3,1,content)->>'status' IS DISTINCT FROM 'conflict'
  OR public.approve_piece_version(p,piece,1,0)->>'status' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'version/revision conflict failed'; END IF;
 IF jsonb_array_length(public.list_project_piece_versions_v2(p)) IS DISTINCT FROM 4 OR (SELECT count(*) FROM public.piece_version_metadata WHERE project_id=p) IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'owner metadata read failed'; END IF;
 r:=public.rename_project(p,'Synthetic renamed A',1);
 IF r->>'status' IS DISTINCT FROM 'renamed' OR (r#>>'{project,revision}')::integer IS DISTINCT FROM 2 OR public.rename_project(p,'Stale',1)->>'status' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'rename revision failed'; END IF;
 denied:=false; BEGIN UPDATE public.projects SET title='bypass' WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'direct rename not denied'; END IF;
 denied:=false; BEGIN UPDATE public.piece_version_metadata SET approval_state='unapproved' WHERE project_id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'direct metadata write not denied'; END IF;
 denied:=false; BEGIN UPDATE public.piece_versions SET content='{}' WHERE project_id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'content mutation not denied'; END IF;
 denied:=false; BEGIN PERFORM 1 FROM public.studio_turns; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'direct turn read not denied'; END IF;
 denied:=false; BEGIN PERFORM 1 FROM public.studio_action_submissions; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'direct receipt read not denied'; END IF;
 denied:=false; BEGIN PERFORM public.save_piece_version_v2(p,piece,4,0,content); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid base accepted'; END IF;
 denied:=false; BEGIN PERFORM public.save_piece_version_v2(p,piece,4,1,content||'{"messages":["do not persist"]}'::jsonb); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'extra creative payload accepted'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',:'user_b',true);
DO $$
DECLARE
 p uuid:=current_setting('compor_studio_test.project_a')::uuid;
 q uuid:=current_setting('compor_studio_test.project_b')::uuid;
 piece uuid:=current_setting('compor_studio_test.piece_a')::uuid;
 own_piece uuid:=current_setting('compor_studio_test.piece_b')::uuid;
 req uuid:=current_setting('compor_studio_test.request_a')::uuid;
 own_req uuid:=current_setting('compor_studio_test.request_b')::uuid;
 req2 uuid:=current_setting('compor_studio_test.request_b2')::uuid;
 denied boolean; r jsonb; content jsonb:='{"headline":"Synthetic B","price":"","date":"","caption":"","captionOrigin":"user"}';
BEGIN
 IF public.reserve_studio_turn(p,req2,repeat('c',64))->>'status' IS DISTINCT FROM 'not_found'
  OR public.get_studio_turn(p,req) IS NOT NULL
  OR public.bind_studio_session(p,req,'v4.cross.proof',now()+interval '4 minutes',null,0,0)
  OR public.set_studio_turn_state(p,req,'completed','turn_synthetic')
  OR public.claim_studio_action(p,req,'turn_synthetic','call_other',repeat('a',64),repeat('b',64))->>'status' IS DISTINCT FROM 'unavailable'
  OR public.finish_studio_action(p,req,current_setting('compor_studio_test.action_a')::uuid,'unknown')
  OR public.get_studio_action(p,req,'turn_synthetic','call_synthetic') IS NOT NULL THEN RAISE EXCEPTION 'cross-account technical access accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.piece_version_metadata WHERE project_id=p)
  OR public.save_piece_version_v2(p,piece,4,1,content)->>'status' IS DISTINCT FROM 'not_found'
  OR public.save_piece_version(p,piece,4,content)->>'status' IS DISTINCT FROM 'not_found'
  OR public.approve_piece_version(p,piece,1,1)->>'status' IS DISTINCT FROM 'not_found'
  OR public.rename_project(p,'Cross account',2)->>'status' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'cross-account metadata/write accepted'; END IF;
 denied:=false; BEGIN PERFORM public.list_project_piece_versions_v2(p); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-account list accepted'; END IF;
 IF public.reserve_studio_turn(q,own_req,repeat('b',64))->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'second owner reserve failed'; END IF;
 IF NOT public.bind_studio_session(q,own_req,'v4.syntheticB.proof',now()+interval '4 minutes',null,0,0) THEN RAISE EXCEPTION 'second owner binding failed'; END IF;
 IF NOT public.set_studio_turn_state(q,own_req,'completed','turn_synthetic_b') THEN RAISE EXCEPTION 'second owner completion failed'; END IF;
 r:=public.save_piece_version_v2(q,own_piece,0,0,content);
 IF r->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'second owner save failed'; END IF;
 IF public.approve_piece_version(q,own_piece,1,0)->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'second owner approval failed'; END IF;
 IF (SELECT count(*) FROM public.piece_version_metadata) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'second owner metadata isolation failed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM public.reserve_studio_turn(current_setting('compor_studio_test.project_a')::uuid,current_setting('compor_studio_test.request_a')::uuid,repeat('a',64)); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'anonymous RPC accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

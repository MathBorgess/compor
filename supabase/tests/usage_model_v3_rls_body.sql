-- Only inserted after the reviewed studio proof body, inside its guarded TX.
DO $$
DECLARE p uuid:=current_setting('compor_studio_test.project_a')::uuid; piece uuid:=current_setting('compor_studio_test.piece_a')::uuid;
 owner_a uuid; parent uuid; reservation uuid; execution uuid; submission uuid; i integer;
BEGIN
 IF current_setting('compor_studio_proof.guarded',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'prepare the guarded proof'; END IF;
 SELECT owner_id,attempt_id INTO owner_a,parent FROM public.studio_turns WHERE request_id=current_setting('compor_studio_test.request_a')::uuid;
 PERFORM set_config('compor_usage_test.parent',parent::text,true);
 PERFORM set_config('compor_usage_test.legacy',(SELECT attempt_id::text FROM public.studio_turns WHERE request_id=current_setting('compor_studio_test.request_a2')::uuid),true);
 PERFORM set_config('compor_usage_test.parent_b',(SELECT attempt_id::text FROM public.studio_turns WHERE request_id=current_setting('compor_studio_test.request_b')::uuid),true);
 FOR i IN 1..6 LOOP
  INSERT INTO public.image_tool_reservations(owner_id,project_id,piece_id,piece_version,agent_attempt_id,session_id,turn_id,call_id)
   VALUES(owner_a,p,piece,1,parent,'sess_usage_fixture','turn_usage_fixture','call_'||gen_random_uuid()) RETURNING id INTO reservation;
  INSERT INTO public.image_tool_executions(owner_id,reservation_id,state) VALUES(owner_a,reservation,CASE WHEN i>4 THEN 'completed' ELSE 'running' END) RETURNING id INTO execution;
  PERFORM set_config('compor_usage_test.execution_'||i,execution::text,true);
  IF i>4 THEN
   INSERT INTO public.image_tool_result_submissions(owner_id,execution_id) VALUES(owner_a,execution) RETURNING id INTO submission;
   PERFORM set_config('compor_usage_test.submission_'||i,submission::text,true);
  END IF;
 END LOOP;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'user_a',true);
DO $$
DECLARE p uuid:=current_setting('compor_studio_test.project_a')::uuid; parent uuid:=current_setting('compor_usage_test.parent')::uuid;
 legacy uuid:=current_setting('compor_usage_test.legacy')::uuid; denied boolean; measured boolean; i integer; model_value text;
BEGIN
 IF NOT public.start_usage_measurement_v3(p,parent,'agent',parent,'gpt-6.1-terra') THEN RAISE EXCEPTION 'Terra reservation failed'; END IF;
 IF public.start_usage_measurement_v3(p,parent,'agent',parent,'gpt-6.1-terra') THEN RAISE EXCEPTION 'duplicate reservation accepted'; END IF;
 IF public.start_usage_measurement_v3(p,parent,'agent',parent,'gpt-6-astra') THEN RAISE EXCEPTION 'duplicate model reassignment accepted'; END IF;
 IF NOT public.start_usage_measurement_v2(p,legacy,'agent',legacy) THEN RAISE EXCEPTION 'legacy Astra reservation failed'; END IF;
 IF NOT public.start_usage_measurement(p,parent,'image',current_setting('compor_usage_test.execution_1')::uuid) THEN RAISE EXCEPTION 'legacy image 2.5 reservation failed'; END IF;
 IF NOT public.start_usage_measurement_v2(p,parent,'image',current_setting('compor_usage_test.execution_2')::uuid) THEN RAISE EXCEPTION 'legacy image 2.6 reservation failed'; END IF;
 FOR i IN 3..4 LOOP
  model_value:=CASE WHEN i=3 THEN 'gpt-image-2.5-flare' ELSE 'gpt-image-2.6-flare' END;
  IF NOT public.start_usage_measurement_v3(p,parent,'image',current_setting('compor_usage_test.execution_'||i)::uuid,model_value) THEN RAISE EXCEPTION 'explicit image model failed'; END IF;
 END LOOP;
 FOR i IN 5..6 LOOP
  model_value:=CASE WHEN i=5 THEN 'gpt-6.1-terra' ELSE 'gpt-6-astra' END;
  IF NOT public.start_usage_measurement_v3(p,parent,'agent_resume',current_setting('compor_usage_test.submission_'||i)::uuid,model_value) THEN RAISE EXCEPTION 'explicit resume model failed'; END IF;
 END LOOP;
 IF (SELECT model FROM public.usage_measurements WHERE attempt_id=parent AND part='agent') IS DISTINCT FROM 'gpt-6.1-terra'
  OR (SELECT model FROM public.usage_measurements WHERE attempt_id=legacy AND part='agent') IS DISTINCT FROM 'gpt-6-astra'
  OR (SELECT model FROM public.usage_measurements WHERE part_id=current_setting('compor_usage_test.execution_1')::uuid) IS DISTINCT FROM 'gpt-image-2.5-flare'
  OR (SELECT model FROM public.usage_measurements WHERE part_id=current_setting('compor_usage_test.execution_2')::uuid) IS DISTINCT FROM 'gpt-image-2.6-flare' THEN RAISE EXCEPTION 'model attribution changed'; END IF;
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'agent',parent,'gpt-image-2.6-flare'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'agent/image model mismatch accepted'; END IF;
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'image',current_setting('compor_usage_test.execution_1')::uuid,'gpt-6.1-terra'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'image/agent model mismatch accepted'; END IF;
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'agent',parent,null); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'missing model accepted'; END IF;
 denied:=false; BEGIN UPDATE public.usage_measurements SET model='gpt-6.1-terra'; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'direct model write accepted'; END IF;
 measured:=public.finish_usage_measurement(p,parent,'agent',parent,'completed',11,13,24,null,null,null);
 IF NOT measured OR EXISTS(SELECT 1 FROM public.usage_measurements WHERE attempt_id=parent AND part='agent' AND (model<>'gpt-6.1-terra' OR estimated_cost_usd IS NOT NULL OR pricing_version IS NOT NULL)) THEN RAISE EXCEPTION 'finish reclassified model or invented price'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',:'user_b',true);
DO $$
DECLARE p uuid:=current_setting('compor_studio_test.project_a')::uuid; q uuid:=current_setting('compor_studio_test.project_b')::uuid;
 parent uuid:=current_setting('compor_usage_test.parent')::uuid; own_parent uuid:=current_setting('compor_usage_test.parent_b')::uuid; denied boolean;
BEGIN
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'agent',parent,'gpt-6.1-terra'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-account agent model reservation accepted'; END IF;
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'image',current_setting('compor_usage_test.execution_1')::uuid,'gpt-image-2.6-flare'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-account image model reservation accepted'; END IF;
 denied:=false; BEGIN PERFORM public.start_usage_measurement_v3(p,parent,'agent_resume',current_setting('compor_usage_test.submission_5')::uuid,'gpt-6.1-terra'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-account resume model reservation accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.usage_measurements WHERE project_id=p) THEN RAISE EXCEPTION 'cross-account usage read accepted'; END IF;
 IF public.finish_usage_measurement(p,parent,'agent',parent,'completed',1,2,3,null,null,null) THEN RAISE EXCEPTION 'cross-account usage finish accepted'; END IF;
 IF NOT public.start_usage_measurement_v3(q,own_parent,'agent',own_parent,'gpt-6.1-terra') THEN RAISE EXCEPTION 'second owner Terra reservation failed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM public.start_usage_measurement_v3(current_setting('compor_studio_test.project_a')::uuid,current_setting('compor_usage_test.parent')::uuid,'agent',current_setting('compor_usage_test.parent')::uuid,'gpt-6.1-terra'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'anonymous v3 invocation accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

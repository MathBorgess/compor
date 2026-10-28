"""Synthetic metrics tests; never reads real runs or executes model/image tools."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("metrics", Path(__file__).with_name("summarize_metrics.py"))
metrics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(metrics)


def usage(inputs, outputs):
    return {"input_tokens": inputs, "output_tokens": outputs, "cached_input_tokens": inputs // 2,
            "cache_write_input_tokens": 0, "reasoning_output_tokens": 0}


def call_item(status="completed"):
    return {"id": "call-1", "type": "mcp_tool_call", "server": "compor_benchmark", "tool": "prepare_layered_creative",
            "arguments": {"piece": {"piece_id": "synthetic"}}, "status": status,
            "result": {"content": []}, "error": None}


def rpc(process, rpc_id, method="tools/call", result=None, error=None):
    params = {"name": "prepare_layered_creative", "arguments": {"piece": {"piece_id": "synthetic"}}} if method == "tools/call" else {}
    response = {"id": rpc_id, "error": error} if error else {"id": rpc_id, "result": result if result is not None else {"content": []}}
    return [{"process_id": process, "direction": "client_to_server", "message": {"id": rpc_id, "method": method, "params": params}},
            {"process_id": process, "direction": "server_to_client", "message": response}]


class MetricsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.runs = self.root / "runs"
        self.run = self.runs / "selected-run"
        self.run.mkdir(parents=True)
        self.row = {"run_id": "selected-run", "order": 1, "case_id": "synthetic-case", "model": "synthetic-model",
                    "effort": "low", "guidance": "baseline", "replicate": 1}
        self.schedule = self.root / "schedule.json"
        self.schedule.write_text(json.dumps([self.row, self.row | {"run_id": "not-selected", "order": 2}]))
        for name in ("dist", "skills"):
            folder = self.run / "mcp-snapshot" / name
            folder.mkdir(parents=True)
            (folder / "fixture.txt").write_text(f"synthetic {name}")

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def turn(self, number, counters=None, extra=None, exit_code=0, wall=100):
        events = [{"type": "thread.started", "thread_id": "synthetic-thread"}]
        events += extra or []
        if counters is not None:
            events.append({"type": "turn.completed", "usage": counters})
        self.write(self.run / f"turn-{number:02d}.json", {"events": events, "exit_code": exit_code,
                    "timed_out": False, "wall_clock_ms": wall, "assistant_messages": []})

    def checkpoint(self, number, turn_count=2, wall=400, changes=None):
        report = {"status": "completed", "case_id": "synthetic-case", "model_configured": "synthetic-model",
                  "effort_configured": "low", "guidance": "baseline", "model_returned_by_provider": None,
                  "runner_sha256": "runner-v1", "bridge_sha256": "bridge-v1", "instruction_guard_sha256": "guard-v1",
                  "configuration_sha256": "configuration-v1", "initial_case_sha256": "case-v1",
                  "cli_version": "synthetic-cli", "runtime": "native", "condition": "C2",
                  "started_at": "2020-01-01T00:00:00Z", "finished_at": "2030-01-01T00:00:00Z",
                  "wall_clock_ms": wall, "invocations": [{"number": 1, "wall_clock_ms": wall}],
                  "turns": [{"runtime_model": "synthetic-model", "runtime_effort": "low",
                             "usage_cli": usage(999999, 999999), "usage_delta_from_rollout": {"total_tokens": 0}}
                            for _ in range(turn_count)],
                  "snapshot": {name + "_sha256": metrics.tree_digest(self.run / "mcp-snapshot" / name) for name in ("dist", "skills")}}
        report.update(changes or {})
        self.write(self.run / f"report-{number:03d}.json", report)
        return report

    def wire(self, rows):
        (self.run / "mcp.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")

    def report(self):
        return metrics.summarize(self.schedule, self.runs, ["selected-run"])["runs"][0]

    def test_cumulative_tokens_and_checkpoint_time_are_not_summed(self):
        self.turn(1, usage(100, 10))
        self.turn(2, usage(300, 30))
        self.checkpoint(1, turn_count=1, wall=100)
        self.checkpoint(2, wall=400, changes={"invocations": [{"number": 1, "wall_clock_ms": 100}, {"number": 2, "wall_clock_ms": 300}]})
        result = self.report()
        self.assertEqual(result["tokens"]["last_confirmed_cumulative"]["total_input_plus_output"], 330)
        self.assertEqual(result["tokens"]["per_turn"][1]["delta"]["total_input_plus_output"], 220)
        self.assertEqual(result["timing"]["runner_cumulative_ms"], 400)
        self.assertEqual(result["timing"]["runner_output_tokens_per_active_second"], 75)
        self.assertTrue(result["timing"]["runner_invocations_reconcile"])

    def test_failed_turn_without_usage_preserves_known_prefix_not_zero_cost(self):
        self.turn(1, usage(100, 10))
        self.turn(2, extra=[{"type": "error", "message": "Selected model is at capacity."},
                            {"type": "turn.failed", "error": {"message": "Selected model is at capacity."}}], exit_code=1)
        self.checkpoint(1, changes={"status": "failed"})
        result = self.report()
        self.assertEqual(result["tokens"]["last_confirmed_turn"], 1)
        self.assertEqual(result["tokens"]["unknown_usage_turns"], [2])
        self.assertIsNone(result["tokens"]["per_turn"][1]["delta"])
        self.assertIsNone(result["timing"]["runner_output_tokens_per_active_second"])
        self.assertEqual(len(result["tool_events"]["infrastructure_failures"]), 1)
        self.assertEqual(result["tool_events"]["infrastructure_failures"][0]["category"], "capacity")

    def test_gap_delta_is_not_attributed_to_later_turn(self):
        self.turn(1, usage(100, 10))
        self.turn(2)
        self.turn(3, usage(600, 60))
        self.checkpoint(1, turn_count=3)
        result = self.report()
        third = result["tokens"]["per_turn"][2]
        self.assertEqual(third["delta"]["total_input_plus_output"], 550)
        self.assertEqual(third["unconfirmed_intervening_turns"], [2])
        self.assertFalse(third["delta_attributable_to_this_turn"])
        self.assertIsNone(result["timing"]["runner_output_tokens_per_active_second"])

    def test_duplicate_completion_event_does_not_double_tokens(self):
        self.turn(1, usage(100, 10), extra=[{"type": "turn.completed", "usage": usage(100, 10)}])
        result = self.report()
        self.assertEqual(result["tokens"]["last_confirmed_cumulative"]["total_input_plus_output"], 110)
        self.assertEqual(result["tokens"]["per_turn"][0]["duplicate_completion_records"], 1)

    def test_conflicting_completion_events_are_unknown(self):
        self.turn(1, usage(100, 10), extra=[{"type": "turn.completed", "usage": usage(200, 20)}])
        result = self.report()
        self.assertIsNone(result["tokens"]["last_confirmed_cumulative"])
        self.assertEqual(result["tokens"]["unknown_usage_turns"], [1])

    def test_decreasing_counter_disables_rate_and_flags_integrity(self):
        self.turn(1, usage(300, 30)); self.turn(2, usage(100, 10)); self.checkpoint(1)
        result = self.report()
        self.assertIsNone(result["tokens"]["per_turn"][1]["delta"]["input_tokens"])
        self.assertIsNone(result["timing"]["runner_output_tokens_per_active_second"])
        self.assertTrue(any("decreased" in x for x in result["issues"]))

    def test_started_completed_and_duplicate_records_count_one_call(self):
        item = call_item("failed")
        completed = {"type": "item.completed", "item": item}
        self.turn(1, usage(100, 10), extra=[{"type": "item.started", "item": item}, completed, deepcopy(completed),
                   {"type": "item.completed", "item": {"id": "warning", "type": "error", "message": "Under-development features enabled"}}])
        pair = rpc(12, 3, error={"code": -32602, "message": "Input validation error"})
        self.wire(pair + deepcopy(pair))
        result = self.report()
        self.assertEqual(result["tool_events"]["distinct_completed_count"], 1)
        self.assertEqual(result["mcp_wire"]["distinct_tool_requests"], 1)
        self.assertEqual(result["mcp_wire"]["error_category_counts"], {"invalid_tool_input": 1})
        self.assertEqual(result["tool_events"]["infrastructure_failures"], [])
        self.assertEqual(len(result["tool_events"]["runtime_warning_items"]), 1)

    def test_iserror_response_and_process_id_pairing(self):
        a=rpc(1, 3, result={"isError": True, "content": [{"text": "IDs e índices de camadas devem ser únicos."}]})
        b=rpc(2, 3)
        self.wire([a[0], b[0], b[1], a[1]])
        result = self.report()["mcp_wire"]
        self.assertEqual(result["status_counts"], {"failed": 1, "succeeded": 1})
        self.assertEqual(result["calls"][0]["response_line"], 4)

    def test_pending_wire_request_is_unknown_not_error(self):
        self.wire(rpc(1, 1)[:1])
        result = self.report()
        self.assertEqual(result["mcp_wire"]["status_counts"], {"unknown": 1})
        self.assertEqual(result["mcp_wire"]["error_category_counts"], {})

    def test_generation_duplicate_attempt_dedup_and_real_retry_retained(self):
        one={"asset_ref":"asset-a","attempt":1,"elapsed_ms":100,"sha256":"image-one"}
        two=one | {"attempt":2,"elapsed_ms":200,"sha256":"image-two"}
        self.write(self.run/'image-generation.json',[one,two])
        self.write(self.run/'assets'/'asset-a.generation.json',one)
        gen=self.report()["timing"]["generation"]
        self.assertEqual(gen["distinct_recorded_attempts"],2)
        self.assertEqual(gen["total_elapsed_ms"],300)
        self.assertEqual(sorted(len(x['sources']) for x in gen['attempts']),[1,2])

    def test_conflicting_generation_attempt_is_not_silently_selected(self):
        one={"asset_ref":"asset-a","attempt":1,"elapsed_ms":100}
        self.write(self.run/'image-generation.json',[one])
        self.write(self.run/'assets'/'asset-a.generation.json',one|{"elapsed_ms":200})
        result=self.report();gen=result['timing']['generation']
        self.assertIsNone(gen['total_elapsed_ms'])
        self.assertEqual(gen['unknown_or_conflicting_timing_records'],1)
        self.assertTrue(any('Conflicting generation attempt' in x for x in result['issues']))

    def test_missing_generation_time_and_no_record_stay_unknown(self):
        self.assertIsNone(self.report()['timing']['generation']['total_elapsed_ms'])

    def test_generation_without_attempt_identity_is_not_a_complete_measurement(self):
        self.write(self.run/'assets'/'a.generation.json',{"asset_ref":"a","elapsed_ms":100})
        result=self.report()
        self.assertIsNone(result['timing']['generation']['total_elapsed_ms'])
        self.assertTrue(any('lacks explicit asset/attempt' in x for x in result['issues']))
        self.write(self.run/'assets'/'a.generation.json',{"asset_ref":"a","attempt":1,"elapsed_ms":None})
        self.assertIsNone(self.report()['timing']['generation']['total_elapsed_ms'])

    def test_coordinator_attempts_render_substage_and_reuse_are_separate(self):
        self.write(self.run/'advance-t4.json',{'status':'failed','errors':['extractor rejected valid version'],
                   'timing_ms':{'total':30},'outputs':{}})
        self.write(self.run/'advance-t4-a2.json',{'status':'ready_to_resume','errors':[], 'timing_ms':{'total':20},
                   'outputs':{'renders':[{'artifact_id':'a','png_sha256':'a-png','reused_verified':False,'render_and_verify_wall_ms':10},
                                          {'artifact_id':'b','png_sha256':'b-png','reused_verified':True,'render_and_verify_wall_ms':None,'reuse_verification_wall_ms':2}]}})
        stage=self.report()['timing']['coordinator']
        self.assertEqual(len(stage['failed_stage_attempts']),1)
        self.assertEqual(stage['coordinator_total_ms'],50)
        self.assertEqual(stage['renderer_and_verification_known_ms'],10)
        self.assertIsNone(stage['renderer_total_ms'])
        self.assertEqual(stage['reused_output_verification_known_ms'],2)
        self.assertEqual(stage['outputs_without_original_render_timing'],['b-png'])

    def test_duplicate_coordinator_attempts_dedup_and_conflicts_stay_unknown(self):
        one={'status':'ready_to_resume','errors':[], 'timing_ms':{'total':20},'outputs':{'renders':[]}}
        self.write(self.run/'advance-t4.json',one)
        self.write(self.run/'advance-t4-a1.json',one)
        stage=self.report()['timing']['coordinator']
        self.assertEqual(len(stage['attempts']),1)
        self.assertEqual(stage['coordinator_total_ms'],20)
        self.write(self.run/'advance-t4-a1.json',one|{'timing_ms':{'total':30}})
        stage=self.report()['timing']['coordinator']
        self.assertIsNone(stage['coordinator_total_ms'])
        self.assertTrue(stage['attempts'][0]['conflict'])

    def test_failed_render_without_duration_does_not_make_prior_timings_complete(self):
        self.write(self.run/'advance-t3.json',{'status':'ready_to_resume','errors':[],
                   'timing_ms':{'total':20},'outputs':{'renders':[{'artifact_id':'a','png_sha256':'a-png',
                     'reused_verified':False,'render_and_verify_wall_ms':10}]}})
        self.write(self.run/'advance-t5.json',{'status':'failed','errors':[{'type':'RenderError','message':'Text overflow'}],
                   'timing_ms':{'extraction_or_verification':1,'total':4},'outputs':{'renders':[]}})
        stage=self.report()['timing']['coordinator']
        self.assertEqual(stage['renderer_and_verification_known_ms'],10)
        self.assertEqual(stage['coordinator_total_ms'],24)
        self.assertIsNone(stage['renderer_total_ms'])
        self.assertEqual(len(stage['failed_render_attempts_without_separate_duration']),1)

    def test_native_turn_ahead_of_checkpoint_cannot_inflate_rate(self):
        self.turn(1,usage(100,10));self.turn(2,usage(300,30))
        self.checkpoint(1,turn_count=1,wall=100)
        result=self.report()
        self.assertFalse(result['integrity']['checks']['native_turns_match_latest_checkpoint'])
        self.assertIsNone(result['timing']['runner_output_tokens_per_active_second'])

    def test_schedule_runtime_and_snapshot_mismatches_reported(self):
        self.turn(1,usage(100,10))
        self.checkpoint(1,turn_count=1)
        self.checkpoint(2,turn_count=1,changes={'model_configured':'unexpected','runner_sha256':'changed',
                        'turns':[{'runtime_model':'unexpected','runtime_effort':'high'}]})
        (self.run/'mcp-snapshot'/'dist'/'fixture.txt').write_text('changed after checkpoint')
        checks=self.report()['integrity']['checks']
        self.assertFalse(checks['schedule_model'])
        self.assertFalse(checks['observed_model_effort'])
        self.assertFalse(checks['stable_runner_sha256'])
        self.assertFalse(checks['snapshot_dist_bytes'])

    def test_catalog_and_instruction_integrity_against_wire(self):
        catalog=[{'name':'prepare_layered_creative','inputSchema':{}}]
        self.wire(rpc(1,0,'initialize',{'instructions':'guide'})+rpc(1,1,'tools/list',{'tools':catalog}))
        self.checkpoint(1,changes={'mcp':{'schema_sha256':metrics.digest(catalog),'tool_names':['prepare_layered_creative']}})
        checks=self.report()['integrity']['checks']
        self.assertTrue(checks['reported_catalog_matches_wire'])
        self.assertTrue(checks['wire_instructions_stable'])
        self.assertTrue(checks['reported_tool_names_match_wire'])

    def test_partial_without_checkpoint_keeps_known_tokens_unknown_runner_time(self):
        self.turn(1,usage(100,10))
        result=self.report()
        self.assertEqual(result['status'],'partial_without_checkpoint')
        self.assertEqual(result['tokens']['last_confirmed_turn'],1)
        self.assertIsNone(result['timing']['runner_cumulative_ms'])
        self.assertIsNone(result['timing']['runner_output_tokens_per_active_second'])

    def test_selection_is_explicit_and_does_not_include_other_schedule_rows(self):
        result=metrics.summarize(self.schedule,self.runs,['selected-run'])
        self.assertEqual([r['run_id'] for r in result['runs']],['selected-run'])
        for selected in ([],['not-in-schedule'],['selected-run','selected-run']):
            with self.assertRaises(ValueError):metrics.summarize(self.schedule,self.runs,selected)

    def test_no_overwrite_pair_and_no_outputs_inside_runs(self):
        result=metrics.summarize(self.schedule,self.runs,['selected-run']);prefix=self.root/'metrics'
        paths=metrics.write_outputs(result,prefix);before=[p.read_bytes() for p in paths]
        with self.assertRaises(FileExistsError):metrics.write_outputs(result,prefix)
        self.assertEqual(before,[p.read_bytes() for p in paths])
        other=self.root/'existing-md';Path(str(other)+'.md').write_text('preserve me')
        with self.assertRaises(FileExistsError):metrics.write_outputs(result,other)
        self.assertFalse(Path(str(other)+'.json').exists())
        with self.assertRaises(ValueError):metrics.write_outputs(result,self.run/'forbidden')


if __name__ == '__main__':
    unittest.main()

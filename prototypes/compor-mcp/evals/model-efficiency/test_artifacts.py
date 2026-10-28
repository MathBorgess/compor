"""Synthetic artifact/provenance tests. No model, image generation or rendering."""
import importlib.util
import json
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("artifacts", Path(__file__).with_name("artifacts.py"))
artifacts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(artifacts)


def piece(name, ref=None):
    image = {"id": f"{name}-image", "kind": "image", "name": "Imagem", "z_index": 0,
             "rect": {"x": 0, "y": 0, "width": 1, "height": 1}}
    if ref:
        image["asset_ref"] = ref
    return {"piece_id": name, "version": "v1", "width_px": 1080, "height_px": 1080,
            "layers": [image, {"id": f"{name}-title", "kind": "text", "name": "Headline", "z_index": 1,
                                  "rect": {"x": 0, "y": 0, "width": 1, "height": .2}, "text": "Teste"}]}


def envelope(turn, pieces):
    entries = [{"id": f"item-{n}", "composition_plan": p, "caption": "Legenda sintética"}
               for n, p in enumerate(pieces)]
    if turn < 5:
        for entry in entries:
            entry["title"] = "Título sintético"
    if turn == 3:
        for entry in entries:
            entry["concept"] = "Conceito sintético"
        return {"directions": entries, "asset_requests": [
            {"direction_id": entry["id"], "asset_ref": f"asset-{n}", "prompt": "Synthetic asset without text"}
            for n, entry in enumerate(entries)]}
    if turn == 4:
        return {"variations": entries}
    return {"revision": entries[0], "feedback_summary": {"synthetic": True}, "outcome": {"known": False}}


def event(p, n=1):
    return {"type": "item.completed", "item": {"id": f"event-{n}", "type": "mcp_tool_call",
        "server": "compor_benchmark", "tool": "prepare_layered_creative", "arguments": {"piece": p},
        "status": "completed", "error": None, "result": {"content": [], "isError": False}}}


def wire(p, process=100, rpc_id=1, success=True):
    return [
        {"process_id": process, "direction": "client_to_server", "message": {"id": rpc_id,
            "method": "tools/call", "params": {"name": "prepare_layered_creative", "arguments": {"piece": p}}}},
        {"process_id": process, "direction": "server_to_client", "message": {"id": rpc_id,
            "result": {"content": [], "isError": not success}}}]


class ArtifactsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.run = self.root / "run"
        self.run.mkdir()
        self.count = 0

    def tearDown(self):
        self.temp.cleanup()

    def write_turn(self, turn, pieces, value=None, events=None, wires=None, final=None):
        data = {"assistant_messages": ["Progress, not the final JSON", final if final is not None else json.dumps(value or envelope(turn, pieces))],
                "events": events if events is not None else [event(p, n) for n, p in enumerate(pieces)]}
        (self.run / f"turn-{turn:02d}.json").write_text(json.dumps(data))
        rows = wires if wires is not None else [r for n, p in enumerate(pieces) for r in wire(p, 100 + n, turn)]
        with (self.run / "mcp.jsonl").open("a") as stream:
            for row in rows:
                stream.write(json.dumps(row) + "\n")

    def mapping(self):
        mapping = {}
        for n in range(2):
            name = f"asset-{n}.bin"
            (self.root / name).write_bytes(f"synthetic-image-{n}".encode())
            mapping[f"asset-{n}"] = name
        path = self.root / "assets.json"
        path.write_text(json.dumps(mapping))
        return path

    def extract(self, turn=3, assets=None, previous=None):
        self.count += 1
        out = self.root / f"out-{self.count}"
        return out, artifacts.extract_artifacts(self.run, turn, out, assets, previous)

    def ready_t3(self):
        self.write_turn(3, [piece("a"), piece("b")])
        mapping = self.mapping()
        out, report = self.extract(assets=mapping)
        self.assertEqual(report["status"], "ready_for_render", report)
        return out, mapping

    def test_pending_assets_preserves_original_and_only_patches_reference(self):
        pieces = [piece("a"), piece("b")]
        self.write_turn(3, pieces)
        out, report = self.extract()
        self.assertEqual(report["status"], "pending_assets")
        self.assertEqual(report["unresolved_asset_refs"], ["asset-0", "asset-1"])
        self.assertEqual(len(report["technical_patches"]), 2)
        original = json.loads((out / "plans/item-0.original.json").read_text())
        mapped = json.loads((out / "plans/item-0.mapped.json").read_text())
        self.assertEqual(original, pieces[0])
        self.assertEqual(mapped["layers"][0].pop("asset_ref"), "asset-0")
        self.assertEqual(mapped, original)
        payload = json.loads((out / "render-inputs/item-0.json").read_text())
        self.assertEqual(payload["assets"], {})
        self.assertFalse(report["render_executed"])
        self.assertFalse(report["generation_executed"])

    def test_explicit_map_hashes_bytes_and_resolves_relative_paths(self):
        out, _ = self.ready_t3()
        report = json.loads((out / "report.json").read_text())
        self.assertEqual(report["assets"]["asset-0"]["sha256"], artifacts.sha(b"synthetic-image-0"))
        self.assertEqual(report["assets"]["asset-0"]["path"], str((self.root / "asset-0.bin").resolve()))

    def test_final_only_no_fallback_to_earlier_valid_json(self):
        pieces = [piece("a"), piece("b")]
        self.write_turn(3, pieces, final="I cannot finish the artifact.")
        path = self.run / "turn-03.json"
        value = json.loads(path.read_text())
        value["assistant_messages"][0] = json.dumps(envelope(3, pieces))
        path.write_text(json.dumps(value))
        out, report = self.extract()
        self.assertEqual(report["status"], "failed")
        self.assertEqual((out / "final-message.txt").read_text(), "I cannot finish the artifact.")
        self.assertFalse((out / "render-inputs").exists())

    def test_single_fence_is_extracted_without_content_repair(self):
        pieces = [piece("a"), piece("b")]
        self.write_turn(3, pieces, final="```json\n" + json.dumps(envelope(3, pieces)) + "\n```")
        _, report = self.extract()
        self.assertEqual(report["parse_mode"], "single_json_fence")
        self.assertEqual(report["status"], "pending_assets")

    def test_duplicate_json_keys_and_non_json_constants_rejected(self):
        for text in ['{"x":1,"x":2}', '{"x":NaN}']:
            with self.subTest(text=text), self.assertRaises(artifacts.ArtifactError):
                artifacts.extract_final([text])

    def test_wrong_cardinality_or_duplicate_ids_rejected(self):
        pieces = [piece("a"), piece("b")]
        for change in (lambda e: e["directions"].pop(),
                       lambda e: e["directions"][1].update(id="item-0")):
            value = envelope(3, pieces)
            change(value)
            with self.assertRaises(artifacts.ArtifactError):
                artifacts.validate_envelope(value, 3)

    def test_exact_piece_required_not_similar_or_repaired(self):
        pieces = [piece("a"), piece("b")]
        value = envelope(3, deepcopy(pieces))
        value["directions"][0]["composition_plan"]["layers"][1]["text"] = "Changed after tool call"
        self.write_turn(3, pieces, value=value)
        _, report = self.extract()
        self.assertEqual(report["status"], "failed")
        self.assertIn("exact piece", report["errors"][0]["message"])

    def test_wire_match_without_turn_arguments_does_not_prove_attribution(self):
        pieces = [piece("a"), piece("b")]
        events = [event(p) for p in pieces]
        for item in events:
            del item["item"]["arguments"]
        self.write_turn(3, pieces, events=events)
        _, report = self.extract()
        self.assertEqual(report["status"], "failed")
        self.assertTrue(report["limitations"])

    def test_failed_wire_result_cannot_validate_successful_event(self):
        pieces = [piece("a"), piece("b")]
        rows = wire(pieces[0], success=False) + wire(pieces[1], process=101)
        self.write_turn(3, pieces, wires=rows)
        _, report = self.extract()
        self.assertEqual(report["status"], "failed")
        self.assertIn("wire", report["errors"][0]["message"])

    def test_failed_event_cannot_be_rescued_by_earlier_wire_success(self):
        pieces = [piece("a"), piece("b")]
        events = [event(p) for p in pieces]
        events[0]["item"]["status"] = "failed"
        self.write_turn(3, pieces, events=events)
        _, report = self.extract()
        self.assertEqual(report["status"], "failed")

    def test_wire_id_reuse_across_processes_never_cross_pairs(self):
        first = wire(piece("a"), process=1, rpc_id=5, success=False)
        second = wire(piece("b"), process=2, rpc_id=5, success=True)
        calls = artifacts.wire_calls("\n".join(json.dumps(r) for r in [first[0], second[0], second[1], first[1]]).encode())
        self.assertFalse(calls[0]["successful"])
        self.assertTrue(calls[1]["successful"])
        self.assertEqual(calls[0]["response_line"], 4)

    def test_repeated_identical_wire_calls_record_attribution_limit(self):
        pieces = [piece("a"), piece("b")]
        rows = wire(pieces[0], process=1) + wire(pieces[0], process=2) + wire(pieces[1], process=3)
        self.write_turn(3, pieces, wires=rows)
        _, report = self.extract()
        self.assertEqual(report["status"], "pending_assets")
        self.assertTrue(report["limitations"])

    def test_serialized_event_arguments_are_parsed_strictly(self):
        pieces = [piece("a"), piece("b")]
        events = [event(p) for p in pieces]
        for item in events:
            item["item"]["arguments"] = json.dumps(item["item"]["arguments"])
        self.write_turn(3, pieces, events=events)
        _, report = self.extract()
        self.assertEqual(report["status"], "pending_assets")

    def test_multiple_images_prevent_heuristic_missing_reference_assignment(self):
        pieces = [piece("a"), piece("b")]
        extra = deepcopy(pieces[0]["layers"][0])
        extra["id"] = "extra-image"
        pieces[0]["layers"].append(extra)
        self.write_turn(3, pieces)
        out, report = self.extract()
        self.assertEqual(report["status"], "failed")
        self.assertFalse((out / "render-inputs").exists())

    def test_existing_t3_reference_is_not_relinked(self):
        self.write_turn(3, [piece("a", "different-asset"), piece("b")])
        _, report = self.extract()
        self.assertEqual(report["status"], "failed")

    def test_full_synthetic_continuity_through_t5(self):
        t3, mapping = self.ready_t3()
        variations = [piece("v-a", "asset-0"), piece("v-b", "asset-0")]
        self.write_turn(4, variations)
        t4, report4 = self.extract(4, mapping, t3)
        self.assertEqual(report4["status"], "ready_for_render", report4)
        revision = deepcopy(variations[0])
        revision["version"] = "v2"
        revision["layers"][1]["font_size_px"] = 40
        self.write_turn(5, [revision])
        _, report5 = self.extract(5, mapping, t4)
        self.assertEqual(report5["status"], "ready_for_render", report5)
        self.assertEqual(report4["technical_patches"], [])
        self.assertEqual(report5["technical_patches"], [])

    def test_t4_rejects_different_ref_missing_ref_and_replaced_bytes(self):
        t3, mapping = self.ready_t3()
        for ref in ("asset-1", None):
            with self.subTest(ref=ref):
                self.write_turn(4, [piece("v-a", ref), piece("v-b", ref)])
                _, report = self.extract(4, mapping, t3)
                self.assertEqual(report["status"], "failed")
        (self.root / "asset-0.bin").write_bytes(b"silently replaced bytes")
        self.write_turn(4, [piece("v-a", "asset-0"), piece("v-b", "asset-0")])
        _, report = self.extract(4, mapping, t3)
        self.assertEqual(report["status"], "failed")
        self.assertIn("bytes changed", report["errors"][0]["message"])

    def test_t4_requires_previous_extraction(self):
        self.write_turn(4, [piece("v-a", "asset-0"), piece("v-b", "asset-0")])
        _, report = self.extract(4, self.mapping())
        self.assertEqual(report["status"], "failed")
        self.assertIn("--previous", report["errors"][0]["message"])

    def test_variations_of_same_piece_with_distinct_versions_are_valid(self):
        t3, mapping = self.ready_t3()
        first, second = piece("shared-piece", "asset-0"), piece("shared-piece", "asset-0")
        first.update(version="v2a", variation_ref="variation-a")
        second.update(version="v2b", variation_ref="variation-b")
        self.write_turn(4, [first, second])
        _, report = self.extract(4, mapping, t3)
        self.assertEqual(report["status"], "ready_for_render", report)
        self.assertEqual([entry["piece_id"] for entry in report["artifacts"]], ["shared-piece", "shared-piece"])
        self.assertEqual([entry["version"] for entry in report["artifacts"]], ["v2a", "v2b"])

    def test_duplicate_piece_and_version_rejected_despite_distinct_variation_refs(self):
        first, second = piece("shared-piece", "asset-0"), piece("shared-piece", "asset-0")
        first["variation_ref"], second["variation_ref"] = "variation-a", "variation-b"
        with self.assertRaisesRegex(artifacts.ArtifactError, "Duplicate piece identity"):
            artifacts.validate_envelope(envelope(4, [first, second]), 4)

    def test_existing_output_is_never_overwritten(self):
        self.write_turn(3, [piece("a"), piece("b")])
        out, _ = self.extract()
        before = (out / "report.json").read_bytes()
        with self.assertRaises(FileExistsError):
            artifacts.extract_artifacts(self.run, 3, out)
        self.assertEqual(before, (out / "report.json").read_bytes())


if __name__ == "__main__":
    unittest.main()

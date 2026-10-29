#!/usr/bin/env python3
"""Extract candidate artifacts without repairing model output or rendering images.

Usage: artifacts.py --run RUN --turn 3 --out NEW_DIR [--assets assets.json]
Turns 4/5 also require --previous DIR (the preceding extraction). assets.json is
the renderer's explicit {asset_ref: local_path} map. Relative paths are resolved
against that file. Every invocation creates a new directory; existing outputs
are never overwritten. A pending T3 extraction can be rerun into a NEW directory
after generation, with the same original run and a supplied asset map.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
TOOL = "prepare_layered_creative"


class ArtifactError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ArtifactError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ArtifactError(f"Non-JSON numeric constant: {value}")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)


def save(path, value, raw=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = value if raw else json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    with path.open("xb") as stream:
        stream.write(data)


def opaque(value):
    return isinstance(value, str) and ID.fullmatch(value) is not None


def extract_final(messages):
    require(isinstance(messages, list) and messages and all(isinstance(m, str) for m in messages),
            "assistant_messages must be a non-empty list of strings")
    final = messages[-1]
    text = final.strip()
    mode = "raw_json"
    if text.startswith("```"):
        match = re.fullmatch(r"```(?:json)?\s*\n(.*)\n```", text, flags=re.DOTALL)
        require(match is not None, "Final message is not one complete JSON fence")
        text, mode = match.group(1), "single_json_fence"
    value = strict_json(text)
    require(isinstance(value, dict), "Final JSON must be an object")
    return final, value, mode


def validate_envelope(value, turn):
    required = {3: {"directions", "asset_requests"}, 4: {"variations"},
                5: {"revision", "feedback_summary", "outcome"}}[turn]
    require(required <= value.keys(), f"Missing envelope fields: {sorted(required - value.keys())}")
    require(value.keys() <= required | {"conversation_response"}, "Unknown envelope fields")
    if "conversation_response" in value:
        require(isinstance(value["conversation_response"], str), "conversation_response must be text")
    entries = value["directions"] if turn == 3 else value["variations"] if turn == 4 else [value["revision"]]
    require(isinstance(entries, list) and len(entries) == (1 if turn == 5 else 2),
            "Envelope has the wrong artifact cardinality")
    ids, piece_identities = set(), set()
    for entry in entries:
        require(isinstance(entry, dict), "Artifact entry must be an object")
        fields = {"id", "composition_plan", "caption"} | ({"title"} if turn < 5 else set()) | ({"concept"} if turn == 3 else set())
        require(set(entry) == fields, "Artifact entry does not match its envelope schema")
        require(opaque(entry["id"]) and entry["id"] not in ids, "Invalid or duplicate artifact ID")
        ids.add(entry["id"])
        for field in fields - {"id", "composition_plan"}:
            require(isinstance(entry[field], str) and entry[field].strip(), f"Missing artifact {field}")
        piece = entry["composition_plan"]
        require(isinstance(piece, dict) and opaque(piece.get("piece_id")) and opaque(piece.get("version")),
                "composition_plan must be a piece with valid piece_id/version")
        identity = (piece["piece_id"], piece["version"])
        require(identity not in piece_identities, "Duplicate piece identity (piece_id, version) across alternatives")
        piece_identities.add(identity)
        layers = piece.get("layers")
        require(isinstance(layers, list) and layers, "Piece requires layers")
        layer_ids = set()
        for layer in layers:
            require(isinstance(layer, dict) and opaque(layer.get("id")) and layer["id"] not in layer_ids,
                    "Invalid or duplicate layer ID")
            layer_ids.add(layer["id"])
            require(layer.get("kind") in {"image", "text", "shape"}, "Unsupported layer kind")
            if "asset_ref" in layer:
                require(layer["kind"] == "image" and opaque(layer["asset_ref"]), "Invalid asset_ref")
    requests = {}
    if turn == 3:
        reqs = value["asset_requests"]
        require(isinstance(reqs, list) and len(reqs) == 2, "T3 requires exactly two asset requests")
        refs = set()
        for req in reqs:
            require(isinstance(req, dict) and set(req) == {"direction_id", "asset_ref", "prompt"},
                    "Invalid asset request schema")
            require(req["direction_id"] in ids and req["direction_id"] not in requests,
                    "Asset requests must map one-to-one to directions")
            require(opaque(req["asset_ref"]) and req["asset_ref"] not in refs, "Invalid or duplicate requested asset_ref")
            require(isinstance(req["prompt"], str) and req["prompt"].strip(), "Empty asset prompt")
            requests[req["direction_id"]] = req
            refs.add(req["asset_ref"])
    return entries, requests


def wire_calls(data):
    """Pair requests/responses by process and typed JSON-RPC ID, never ID alone."""
    pending, calls = {}, []
    for line_no, line in enumerate(data.decode().splitlines(), 1):
        if not line.strip():
            continue
        row = strict_json(line)
        require(isinstance(row, dict) and "process_id" in row and isinstance(row.get("message"), dict),
                f"Malformed MCP record at line {line_no}")
        msg = row["message"]
        if "id" not in msg:
            continue
        key = (row["process_id"], canonical(msg["id"]))
        if row.get("direction") == "client_to_server" and msg.get("method") == "tools/call":
            require(key not in pending, f"Overlapping MCP request ID at line {line_no}")
            params = msg.get("params", {})
            call = {"process_id": row["process_id"], "request_id": msg["id"],
                    "request_line": line_no, "response_line": None,
                    "tool": params.get("name"), "arguments": params.get("arguments"), "successful": False}
            pending[key] = call
            calls.append(call)
        elif row.get("direction") == "server_to_client" and key in pending:
            call = pending.pop(key)
            result = msg.get("result")
            call["response_line"] = line_no
            call["successful"] = ("error" not in msg and isinstance(result, dict)
                                  and result.get("isError") is not True)
    return calls


def event_calls(events):
    calls = []
    for index, event in enumerate(events or []):
        item = event.get("item", {})
        if (event.get("type") != "item.completed" or item.get("type") != "mcp_tool_call"
                or item.get("tool") != TOOL or item.get("server") != "compor_benchmark"):
            continue
        args = item.get("arguments")
        if isinstance(args, str):
            try:
                args = strict_json(args)
            except (ValueError, TypeError):
                args = None
        result = item.get("result")
        calls.append({"event_index": index, "event_id": item.get("id"), "arguments": args,
                      "successful": item.get("status") == "completed" and item.get("error") is None
                      and isinstance(result, dict) and result.get("isError") is not True,
                      "process_id": item.get("process_id")})
    return calls


def verify_piece(piece, events, wire):
    same = lambda args: isinstance(args, dict) and "piece" in args and canonical(args["piece"]) == canonical(piece)
    matches = [e for e in events if same(e["arguments"]) and e["successful"]]
    require(matches, "No successful per-turn MCP event exposes this exact piece; run-wide wire evidence cannot prove turn attribution")
    linked = []
    for event in matches:
        candidates = [w for w in wire if w["tool"] == TOOL and w["successful"]
                      and canonical(w["arguments"]) == canonical(event["arguments"])
                      and (event["process_id"] is None or event["process_id"] == w["process_id"])]
        if candidates:
            linked.append({"event_index": event["event_index"], "event_id": event["event_id"],
                           "wire_candidates": [{k: w[k] for k in ("process_id", "request_id", "request_line", "response_line")} for w in candidates],
                           "wire_locator_unique": len(candidates) == 1})
    require(linked, "Exact piece has a successful turn event but no matching successful MCP wire call")
    return linked


def load_assets(path):
    if path is None:
        return {}, None
    path = Path(path).resolve()
    raw = path.read_bytes()
    value = strict_json(raw)
    require(isinstance(value, dict), "--assets must contain a map of asset_ref to file path")
    result = {}
    for ref, name in value.items():
        require(opaque(ref) and isinstance(name, str) and name, "Invalid explicit asset mapping")
        file = Path(name)
        file = (path.parent / file).resolve() if not file.is_absolute() else file.resolve()
        require(file.is_file(), f"Explicit asset does not exist: {ref}")
        result[ref] = {"path": str(file), "sha256": sha(file.read_bytes()), "supplied_path": name}
    return result, {"path": str(path), "sha256": sha(raw), "relative_path_base": str(path.parent)}


def image_refs(piece):
    return [layer.get("asset_ref") for layer in piece["layers"] if layer["kind"] == "image"]


def extract_artifacts(run_dir, turn, out_dir, assets_path=None, previous=None):
    require(turn in (3, 4, 5), "Only turns 3, 4 and 5 contain render artifacts")
    run_dir, out_dir = Path(run_dir).resolve(), Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=False)
    report = {"schema_version": 1, "status": "failed", "turn": turn, "run_dir": str(run_dir),
              "errors": [], "limitations": [], "artifacts": [], "technical_patches": [],
              "render_executed": False, "generation_executed": False}
    try:
        source = run_dir / f"turn-{turn:02d}.json"
        source_raw = source.read_bytes()
        save(out_dir / "source-turn.json", source_raw, raw=True)
        report["source"] = {"path": str(source), "sha256": sha(source_raw)}
        value = strict_json(source_raw)
        messages = value.get("assistant_messages")
        if isinstance(messages, list) and messages and isinstance(messages[-1], str):
            save(out_dir / "final-message.txt", messages[-1].encode(), raw=True)
        _, envelope, mode = extract_final(messages)
        report["parse_mode"] = mode
        save(out_dir / "envelope.original.json", envelope)
        entries, requests = validate_envelope(envelope, turn)
        if requests:
            save(out_dir / "asset-requests.json", envelope["asset_requests"])
        wire_raw = (run_dir / "mcp.jsonl").read_bytes()
        report["wire_sha256"] = sha(wire_raw)
        wire, events = wire_calls(wire_raw), event_calls(value.get("events"))
        if not any(isinstance(e["arguments"], dict) for e in events):
            report["limitations"].append("Turn events do not expose usable MCP arguments; mcp.jsonl has no turn_id, so run-wide matches cannot establish this turn's call.")
        evidence = [verify_piece(entry["composition_plan"], events, wire) for entry in entries]
        if any(not link["wire_locator_unique"] for links in evidence for link in links):
            report["limitations"].append("Per-turn events prove arguments and completion; repeated identical wire calls prevent unique process/request attribution for some events.")
        assets, asset_source = load_assets(assets_path)
        report["assets"], report["assets_source"] = assets, asset_source
        previous_report = None
        if turn > 3:
            require(previous is not None, "Turns 4/5 require --previous to prove asset continuity")
            previous_path = Path(previous).resolve() / "report.json"
            previous_raw = previous_path.read_bytes()
            previous_report = strict_json(previous_raw)
            require(previous_report.get("status") == "ready_for_render" and previous_report.get("turn") == turn - 1
                    and previous_report.get("run_dir") == str(run_dir), "Previous extraction must be ready and from the preceding turn of this run")
            report["previous"] = {"path": str(previous_path), "sha256": sha(previous_raw)}
        pending = set()
        mapped_entries = []
        for entry, links in zip(entries, evidence):
            original = entry["composition_plan"]
            mapped = deepcopy(original)
            images = [layer for layer in mapped["layers"] if layer["kind"] == "image"]
            require(images, "Composition must contain an image layer")
            if turn == 3:
                req = requests[entry["id"]]
                missing = [layer for layer in images if "asset_ref" not in layer]
                if missing:
                    require(len(images) == 1, "Cannot associate omitted asset_ref with multiple image layers")
                    images[0]["asset_ref"] = req["asset_ref"]
                    report["technical_patches"].append({"artifact_id": entry["id"], "operation": "add",
                        "layer_id": images[0]["id"], "field": "asset_ref", "value": req["asset_ref"],
                        "reason": "One direction, one request and one image layer; no content or geometry changed"})
                require(set(image_refs(mapped)) == {req["asset_ref"]}, "Plan asset_ref differs from its direction's explicit asset request")
            refs = image_refs(mapped)
            require(all(opaque(ref) for ref in refs), "T4/T5 image layers must already reference existing asset IDs; no relinking")
            if previous_report:
                chosen_refs = previous_report["artifacts"][0]["asset_refs"]
                require(set(refs) == set(chosen_refs), "Image references differ from the selected first prior artifact; no relinking")
                for ref in refs:
                    old = previous_report["assets"].get(ref)
                    require(ref in assets and old and old["sha256"] == assets[ref]["sha256"],
                            f"Asset bytes changed or cannot be resolved across turns: {ref}")
            unresolved = sorted(set(refs) - assets.keys())
            pending.update(unresolved)
            mapped_entries.append((entry, original, mapped, links, refs, unresolved))
        # Validate all entries before publishing any render inputs.
        for entry, original, mapped, links, refs, unresolved in mapped_entries:
            name = entry["id"]
            save(out_dir / "plans" / f"{name}.original.json", original)
            save(out_dir / "plans" / f"{name}.mapped.json", mapped)
            payload = {"piece": mapped, "assets": {ref: assets[ref]["path"] for ref in sorted(set(refs)) if ref in assets}}
            render_path = Path("render-inputs") / f"{name}.json"
            save(out_dir / render_path, payload)
            report["artifacts"].append({"id": name, "piece_id": original["piece_id"], "version": original["version"],
                "original_piece_sha256": sha(canonical(original)), "mapped_piece_sha256": sha(canonical(mapped)),
                "mcp_evidence": links, "asset_refs": refs, "unresolved_asset_refs": unresolved,
                "render_input": str(render_path), "render_input_sha256": sha(canonical(payload))})
        report["unresolved_asset_refs"] = sorted(pending)
        report["status"] = "pending_assets" if pending else "ready_for_render"
    except (ArtifactError, ValueError, TypeError, KeyError, OSError) as exc:
        report["errors"].append({"type": type(exc).__name__, "message": str(exc)})
    save(out_dir / "report.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--turn", required=True, type=int, choices=(3, 4, 5))
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    report = extract_artifacts(args.run, args.turn, args.out, args.assets, args.previous)
    print(json.dumps({"status": report["status"], "report": str(args.out.resolve() / "report.json"),
                      "errors": report["errors"]}, ensure_ascii=False))
    return 1 if report["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())

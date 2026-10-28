#!/usr/bin/env python3
"""Audit explicitly selected runs; no model calls, rendering or quality scores.

CLI: --schedule schedule.json --runs-root runs --run ID [--run ID ...]
     --out NEW_PREFIX
Writes NEW_PREFIX.json and NEW_PREFIX.md exclusively. Never writes under runs.
Only stdlib is used. Times are observed active elapsed durations, not pure model
inference; cumulative token/checkpoint snapshots are never summed as increments.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re

RUN_ID = re.compile(r"^[A-Za-z0-9_-]+$")
REPORT = re.compile(r"report-(\d+)\.json$")
TURN = re.compile(r"turn-(\d+)\.json$")
ADVANCE = re.compile(r"advance-t(\d+)(?:-a(\d+))?\.json$")
COUNTERS = ("input_tokens", "output_tokens", "cached_input_tokens",
            "cache_write_input_tokens", "reasoning_output_tokens")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def load(path):
    return json.loads(path.read_text())


def source(path, pointer=""):
    return {"path": str(path), "sha256": digest(path.read_bytes()), "json_pointer": pointer}


def unique_items(items, key, issues, label):
    """Deduplicate identical evidence, flag conflicting identities, preserve origin."""
    result = {}
    for identity, payload, origin in items:
        if identity in result:
            old = result[identity]
            old["sources"].append(origin)
            if canonical(old["value"]) != canonical(payload):
                old["conflict"] = True
                issues.append(f"Conflicting {label} identity: {identity}")
        else:
            result[identity] = {"identity": key(identity), "value": payload,
                                "sources": [origin], "conflict": False}
    return list(result.values())


def token_metrics(turns, issues):
    previous, previous_turn, last, audit = None, None, None, []
    for turn, path, body in turns:
        completions = [(i, e) for i, e in enumerate(body.get("events", [])) if e.get("type") == "turn.completed"]
        unique = {digest(e): (i, e) for i, e in completions}
        row = {"turn": turn, "source": source(path), "status": "unknown",
               "cumulative": None, "delta": None}
        if len(unique) == 1:
            index, event = next(iter(unique.values()))
            usage = event.get("usage")
            valid = isinstance(usage, dict) and all(type(usage.get(k)) is int and usage[k] >= 0
                                                    for k in ("input_tokens", "output_tokens"))
            if valid:
                values = {k: usage.get(k) for k in COUNTERS}
                values["total_input_plus_output"] = values["input_tokens"] + values["output_tokens"]
                row.update(status="confirmed", cumulative=values,
                           completion_source=source(path, f"/events/{index}/usage"),
                           duplicate_completion_records=len(completions) - 1)
                delta = {}
                for key in COUNTERS:
                    now, prior = values[key], previous.get(key) if previous else 0
                    if type(now) is int and type(prior) is int and now >= prior:
                        delta[key] = now - prior
                    else:
                        delta[key] = None
                        if type(now) is int and type(prior) is int and now < prior:
                            issues.append(f"Token counter decreased at turn {turn}: {key}")
                delta["total_input_plus_output"] = (delta["input_tokens"] + delta["output_tokens"]
                    if delta["input_tokens"] is not None and delta["output_tokens"] is not None else None)
                gaps = list(range((previous_turn or 0) + 1, turn))
                row.update(delta=delta, previous_confirmed_turn=previous_turn,
                           unconfirmed_intervening_turns=gaps,
                           delta_attributable_to_this_turn=not gaps)
                previous, previous_turn, last = values, turn, row
            else:
                row["reason"] = "turn.completed lacks valid input/output counters"
        elif len(unique) > 1:
            row["reason"] = "Conflicting turn.completed records"
            issues.append(f"Ambiguous completion counters at turn {turn}")
        else:
            row["reason"] = "No turn.completed usage; failed attempt consumption is unknown, not zero"
        audit.append(row)
    unknown = [row["turn"] for row in audit if row["status"] != "confirmed"]
    return {"last_confirmed_turn": last["turn"] if last else None,
            "last_confirmed_cumulative": last["cumulative"] if last else None,
            "unknown_usage_turns": unknown, "per_turn": audit,
            "method": "Last native turn.completed counter; deltas span consecutive confirmed counters. Gaps are not attributed to a single turn.",
            "subsets": "Cached input is included in input; reasoning output is included in output. Neither is added again.",
            "billing": "unknown"}


def event_metrics(turns, issues):
    items, infrastructure, warnings = [], [], []
    for turn, path, body in turns:
        errors = []
        for index, event in enumerate(body.get("events", [])):
            item = event.get("item", {})
            if event.get("type") == "item.completed" and item.get("type") == "mcp_tool_call":
                identity = (turn, item.get("id"))
                if not item.get("id"):
                    identity = (turn, f"missing-id-event-{index}")
                    issues.append(f"Tool event lacks an ID at turn {turn}, event {index}")
                items.append((identity, item, {"path": str(path), "json_pointer": f"/events/{index}/item"}))
            if event.get("type") in ("error", "turn.failed"):
                message = event.get("message") or (event.get("error") or {}).get("message")
                if message:
                    errors.append({"message": message, "json_pointer": f"/events/{index}"})
            if item.get("type") == "error":
                warnings.append({"turn": turn, "message": item.get("message"),
                                 "source": {"path": str(path), "json_pointer": f"/events/{index}/item"}})
        if body.get("timed_out") or body.get("exit_code") not in (None, 0) or errors:
            messages = sorted({e["message"] for e in errors})
            category = "capacity" if any("at capacity" in s.lower() for s in messages) else "timeout" if body.get("timed_out") else "runtime_failure"
            infrastructure.append({"turn": turn, "category": category, "source": str(path),
                                   "messages": messages, "events": errors, "exit_code": body.get("exit_code"),
                                   "timed_out": body.get("timed_out"), "creative_penalty": False})
    unique = unique_items(items, lambda k: {"turn": k[0], "item_id": k[1]}, issues, "completed tool event")
    return {"distinct_completed_count": len(unique), "events": unique,
            "status_counts": dict(Counter(x["value"].get("status", "unknown") for x in unique)),
            "infrastructure_failures": infrastructure, "runtime_warning_items": warnings}


def wire_metrics(path, issues):
    if not path.exists():
        return {"status": "unavailable", "distinct_tool_requests": None, "calls": [], "catalogs": [], "instructions": []}
    requests, responses, catalog, instructions = {}, {}, [], []
    for index, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        msg = row.get("message", {})
        if "id" not in msg:
            continue
        key = (row.get("process_id"), canonical(msg["id"]))
        collection = requests if row.get("direction") == "client_to_server" else responses if row.get("direction") == "server_to_client" else None
        if collection is None:
            continue
        if key in collection:
            if canonical(collection[key]["message"]) != canonical(msg):
                collection[key]["conflict"] = True
                issues.append(f"Conflicting wire ID {row.get('process_id')}/{msg['id']}")
            collection[key]["duplicate_lines"].append(index)
        else:
            collection[key] = {"message": msg, "line": index, "duplicate_lines": [], "conflict": False}
    calls = []
    for key, request in requests.items():
        msg = request["message"]
        response = responses.get(key)
        reply = response["message"] if response else {}
        result = reply.get("result")
        if msg.get("method") == "tools/list" and isinstance(result, dict):
            catalog.append({"process_id": key[0], "sha256": digest(result.get("tools", [])),
                            "tool_names": sorted(t["name"] for t in result.get("tools", [])),
                            "request_line": request["line"], "response_line": response["line"]})
        if msg.get("method") == "initialize" and isinstance(result, dict):
            instructions.append({"process_id": key[0], "sha256": digest(result.get("instructions")),
                                 "response_line": response["line"]})
        if msg.get("method") != "tools/call":
            continue
        conflict = request["conflict"] or (response or {}).get("conflict", False)
        failed = "error" in reply or (isinstance(result, dict) and result.get("isError") is True)
        status = "unknown" if conflict or not response else "failed" if failed else "succeeded" if isinstance(result, dict) else "unknown"
        error = reply.get("error") if "error" in reply else result if failed else None
        error_text = json.dumps(error, ensure_ascii=False) if error is not None else ""
        invalid = failed and any(s in error_text.lower() for s in ("-32602", "validation", "ids e índices", "retângulo", "invalid arguments"))
        params = msg.get("params", {})
        calls.append({"process_id": key[0], "request_id": msg["id"], "tool": params.get("name"),
                      "arguments_sha256": digest(params.get("arguments")), "status": status,
                      "error_category": "invalid_tool_input" if invalid else "tool_error" if failed else None,
                      "error": error, "request_line": request["line"],
                      "response_line": response["line"] if response else None,
                      "duplicate_request_lines": request["duplicate_lines"],
                      "duplicate_response_lines": response["duplicate_lines"] if response else []})
    return {"status": "observed", "source": source(path), "distinct_tool_requests": len(calls), "calls": calls,
            "status_counts": dict(Counter(c["status"] for c in calls)),
            "error_category_counts": dict(Counter(c["error_category"] for c in calls if c["error_category"])),
            "catalogs": catalog, "instructions": instructions,
            "counting": "Unique process_id/typed RPC id. Event started/completed pairs are not added to wire counts."}


def generation_metrics(run, issues):
    items = []
    files = sorted(run.glob("**/*.generation.json"))
    legacy = run / "image-generation.json"
    for path in files + ([legacy] if legacy.exists() else []):
        body = load(path)
        records = body if isinstance(body, list) else [body]
        for index, record in enumerate(records):
            ref, attempt = record.get("asset_ref"), record.get("attempt")
            if not isinstance(ref, str) or type(attempt) is not int or attempt < 1:
                issues.append(f"Generation record lacks explicit asset/attempt identity: {path}:{index}")
                identity = (str(path), index, "unknown")
            else:
                identity = (ref, attempt)
            items.append((identity, record, {"path": str(path), "json_pointer": f"/{index}" if isinstance(body, list) else ""}))
    records = unique_items(items, lambda k: list(k), issues, "generation attempt")
    known = [r["value"]["elapsed_ms"] for r in records if not r["conflict"]
             and len(r["identity"]) == 2 and number(r["value"].get("elapsed_ms"))]
    complete = bool(records) and len(known) == len(records)
    return {"distinct_recorded_attempts": len(records), "attempts": records,
            "known_elapsed_sum_ms": sum(known) if known else None,
            "total_elapsed_ms": sum(known) if complete else None,
            "unknown_or_conflicting_timing_records": len(records) - len(known),
            "coverage": "complete_recorded_attempts" if complete else "partial_or_unavailable",
            "interpretation": "Sum of recorded generation attempt durations, not end-to-end wall time; overlaps are not inferred. Absence of records does not prove no generation."}


def advance_metrics(run, issues):
    attempts, seen = [], {}
    for path in sorted(run.glob("advance-t*.json")):
        match = ADVANCE.fullmatch(path.name)
        if not match:
            continue
        value = load(path)
        identity = (int(match[1]), int(match[2] or 1))
        if identity in seen:
            previous_digest, entry = seen[identity]
            entry["duplicate_sources"].append(source(path))
            if previous_digest != digest(value):
                entry["conflict"] = True
                issues.append(f"Conflicting coordinator attempt identity: {identity}")
            continue
        outputs = value.get("outputs") or {}
        entry = {"turn": identity[0], "attempt": identity[1], "source": source(path),
                         "conflict": False, "duplicate_sources": [],
                         "status": value.get("status"), "errors": value.get("errors", []),
                         "timing_ms": value.get("timing_ms", {}),
                         "component_versions": {k: v for k, v in value.get("inputs", {}).items() if k.endswith("_sha256")},
                         "renders": [{k: r.get(k) for k in ("artifact_id", "png_sha256", "reused_verified",
                                      "render_and_verify_wall_ms", "reuse_verification_wall_ms")} for r in outputs.get("renders", [])]}
        attempts.append(entry)
        seen[identity] = (digest(value), entry)
    conflicting = any(a["conflict"] for a in attempts)
    render_failures = [{"turn": a["turn"], "attempt": a["attempt"], "source": a["source"]}
                       for a in attempts if any(isinstance(error, dict) and error.get("type") == "RenderError"
                                                for error in a["errors"])]
    renders = [r for a in attempts if not a["conflict"] for r in a["renders"]]
    measured = [r["render_and_verify_wall_ms"] for r in renders if number(r.get("render_and_verify_wall_ms"))]
    reuse = [r["reuse_verification_wall_ms"] for r in renders if number(r.get("reuse_verification_wall_ms"))]
    unique_outputs = {r["png_sha256"] for r in renders if r.get("png_sha256")}
    timed_outputs = {r["png_sha256"] for r in renders if r.get("png_sha256") and number(r.get("render_and_verify_wall_ms"))}
    missing = sorted(unique_outputs - timed_outputs)
    durations = [(a.get("timing_ms") or {}).get("total") if not a["conflict"] else None for a in attempts]
    return {"attempts": attempts,
            "failed_stage_attempts": [{"turn": a["turn"], "attempt": a["attempt"], "source": a["source"],
                                        "errors": a["errors"], "attribution": "coordinator_stage_not_automatically_candidate_failure"}
                                       for a in attempts if a["status"] == "failed" or a["errors"]],
            "coordinator_total_known_ms": sum(v for v in durations if number(v)) if any(number(v) for v in durations) else None,
            "coordinator_total_ms": sum(durations) if durations and all(number(v) for v in durations) else None,
            "renderer_and_verification_known_ms": sum(measured) if measured else None,
            "renderer_total_ms": sum(measured) if renders and not conflicting and not render_failures and not missing and all(number(r.get("render_and_verify_wall_ms")) or r.get("reused_verified") for r in renders) else None,
            "reused_output_verification_known_ms": sum(reuse) if reuse else None,
            "outputs_without_original_render_timing": missing,
            "failed_render_attempts_without_separate_duration": render_failures,
            "interpretation": "Coordinator totals include rendering/verification and must not be added again to those substage times. Reuse verification is not original rendering. RenderError attempts have no separately exposed duration in the advance schema, so the full render total remains unknown even when earlier successful renders were timed. Each reported attempt is separate; absent timing stays unknown."}


def tree_digest(directory):
    if not directory.is_dir():
        return None
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    if any(not p.resolve().is_relative_to(directory.resolve()) for p in files):
        return None
    return digest({str(p.relative_to(directory)): digest(p.read_bytes()) for p in files})


def integrity_metrics(row, reports, run, wire, issues):
    latest = reports[-1][1] if reports else {}
    checks, versions = {}, {}
    for expected, actual in (("model", "model_configured"), ("effort", "effort_configured"),
                             ("guidance", "guidance"), ("case_id", "case_id")):
        checks[f"schedule_{expected}"] = latest.get(actual) == row.get(expected) if actual in latest else None
    observed = [{"turn": i + 1, "model": t.get("runtime_model"), "effort": t.get("runtime_effort")}
                for i, t in enumerate(latest.get("turns", []))]
    checks["observed_model_effort"] = all(t["model"] == row.get("model") and t["effort"] == row.get("effort") for t in observed) if observed else None
    for key in ("runner_sha256", "bridge_sha256", "instruction_guard_sha256", "configuration_sha256",
                "initial_case_sha256", "cli_version", "runtime", "condition"):
        values = [body.get(key) for _, body in reports]
        versions[key] = list(dict.fromkeys(v for v in values if v is not None))
        checks[f"stable_{key}"] = len(versions[key]) == 1 if values and all(v is not None for v in values) else None
    snapshots = [body.get("snapshot") for _, body in reports]
    checks["stable_snapshot"] = len({digest(s) for s in snapshots}) == 1 if snapshots and all(s is not None for s in snapshots) else None
    actual = {name: tree_digest(run / "mcp-snapshot" / name) for name in ("dist", "skills")}
    expected_snapshot = latest.get("snapshot") or {}
    for name, value in actual.items():
        checks[f"snapshot_{name}_bytes"] = value == expected_snapshot[f"{name}_sha256"] if value and expected_snapshot.get(f"{name}_sha256") else None
    catalogs, instructions = wire["catalogs"], wire["instructions"]
    checks["wire_catalog_stable"] = len({c["sha256"] for c in catalogs}) == 1 if catalogs else None
    checks["wire_instructions_stable"] = len({c["sha256"] for c in instructions}) == 1 if instructions else None
    reported = latest.get("mcp") or {}
    checks["reported_catalog_matches_wire"] = all(c["sha256"] == reported.get("schema_sha256") for c in catalogs) if catalogs and reported.get("schema_sha256") else None
    checks["reported_tool_names_match_wire"] = all(c["tool_names"] == sorted(reported["tool_names"]) for c in catalogs) if catalogs and reported.get("tool_names") else None
    for name, result in checks.items():
        if result is False:
            issues.append(f"Integrity check failed: {name}")
    return {"checks": checks, "versions": versions, "runtime_observed": observed,
            "snapshot_reported": latest.get("snapshot"), "snapshot_recomputed": actual,
            "dependencies_verification": "Reported frozen hash only; no external dependency directory read.",
            "guidance_configured": latest.get("guidance"), "wire_instructions": instructions,
            "provider_response_model": latest.get("model_returned_by_provider"),
            "identity_limit": "Runtime observations/configuration are not provider response model identity. Guidance configuration, returned instructions and skill loads are separate evidence."}


def summarize_run(row, run):
    issues = []
    reports = sorted(((int(m[1]), p) for p in run.glob("report-*.json") if (m := REPORT.fullmatch(p.name))), key=lambda x: x[0])
    checkpoints = [(path, load(path)) for _, path in reports]
    latest = checkpoints[-1][1] if checkpoints else {}
    turns = sorted((int(m[1]), p, load(p)) for p in run.glob("turn-*.json") if (m := TURN.fullmatch(p.name)))
    tokens = token_metrics(turns, issues)
    events = event_metrics(turns, issues)
    wire = wire_metrics(run / "mcp.jsonl", issues)
    if wire["distinct_tool_requests"] is not None and wire["distinct_tool_requests"] != events["distinct_completed_count"]:
        issues.append("Wire request count differs from completed event count; inspect pending/unrepresented calls, not double-count both sources")
    generation = generation_metrics(run, issues)
    stages = advance_metrics(run, issues)
    integrity = integrity_metrics(row, checkpoints, run, wire, issues)
    synchronized = bool(checkpoints) and [n for n, _, _ in turns] == list(range(1, len(latest.get("turns", [])) + 1))
    integrity["checks"]["native_turns_match_latest_checkpoint"] = synchronized if checkpoints else None
    if checkpoints and not synchronized:
        issues.append("Native turn files and latest checkpoint cover different turns; active throughput is unavailable")
    wall = latest.get("wall_clock_ms")
    invocations = latest.get("invocations", [])
    invocation_ids = [v.get("number") for v in invocations]
    invocation_durations = [v.get("wall_clock_ms") for v in invocations]
    reconciled = None
    if invocations and number(wall) and all(number(v) for v in invocation_durations):
        reconciled = len(set(invocation_ids)) == len(invocation_ids) and math.isclose(sum(invocation_durations), wall, abs_tol=.01)
        if not reconciled:
            issues.append("Latest cumulative runner time does not reconcile with unique invocation durations")
    known_turn_times = [body.get("wall_clock_ms") for _, _, body in turns]
    rate = None
    complete_usage = bool(turns) and not tokens["unknown_usage_turns"] and all(x.get("delta_attributable_to_this_turn") for x in tokens["per_turn"])
    if complete_usage and synchronized and number(wall) and wall > 0 and not events["infrastructure_failures"] and reconciled is True and not any("Token counter decreased" in s for s in issues):
        rate = tokens["last_confirmed_cumulative"]["output_tokens"] / (wall / 1000)
    return {"run_id": row["run_id"], "schedule": row, "directory": str(run),
            "status": latest.get("status", "partial_without_checkpoint" if turns else "not_started"),
            "latest_checkpoint": source(checkpoints[-1][0]) if checkpoints else None,
            "checkpoint_sources": [source(p) for p, _ in checkpoints],
            "tokens": tokens, "tool_events": events, "mcp_wire": wire,
            "timing": {"runner_cumulative_ms": wall if number(wall) else None,
                       "runner_invocations_reconcile": reconciled, "invocations": invocations,
                       "native_turn_elapsed_known_sum_ms": sum(t for t in known_turn_times if number(t)) if any(number(t) for t in known_turn_times) else None,
                       "runner_output_tokens_per_active_second": rate,
                       "rate_label": "Observed output tokens per runner active elapsed second, including MCP/client/runtime overhead; not pure inference throughput.",
                       "idle_time": "No timestamp difference between started_at and finished_at is used; pauses between invocations are excluded.",
                       "generation": generation, "coordinator": stages},
            "integrity": integrity, "issues": issues,
            "quality": "not_scored; no Judges/blind maps read; runtime completed is not user success"}


def summarize(schedule_path, runs_root, selected):
    schedule_path, runs_root = Path(schedule_path).resolve(), Path(runs_root).resolve()
    schedule = load(schedule_path)
    if not isinstance(schedule, list) or not selected or len(selected) != len(set(selected)):
        raise ValueError("Select one or more unique --run IDs from a schedule list")
    rows = {}
    for row in schedule:
        name = row.get("run_id")
        if not isinstance(name, str) or not RUN_ID.fullmatch(name) or name in rows:
            raise ValueError("Schedule contains invalid or duplicate run_id")
        rows[name] = row
    if any(name not in rows for name in selected):
        raise ValueError("Every selected run must exist in the explicit schedule")
    ordered = [row for row in schedule if row["run_id"] in selected]
    for row in ordered:
        if not (runs_root / row["run_id"]).resolve().is_relative_to(runs_root):
            raise ValueError("Run directory escapes selected runs root")
    return {"schema_version": 1, "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "schedule_source": source(schedule_path), "runs_root": str(runs_root),
            "explicit_selection": list(selected), "report_order": "schedule order",
            "scope": "Observed efficiency/integrity only; no quality scores or combined Judge results.",
            "runs": [summarize_run(row, runs_root / row["run_id"]) for row in ordered]}


def markdown(report):
    lines = ["# Métricas observadas — seleção explícita", "", report["scope"], "",
             "Tokens são o último contador confirmado de `turn.completed`. Não foram somados snapshots cumulativos. Tempos de runner, geração e compositor têm fontes e limites separados.", "",
             "| Run | Estado | Último turno com tokens | Entrada + saída confirmadas | Runner ativo (ms) | Calls wire | Uso de tentativas desconhecido |",
             "|---|---|---:|---:|---:|---:|---|"]
    show = lambda value: "desconhecido" if value is None else str(round(value, 3) if isinstance(value, float) else value)
    for run in report["runs"]:
        token = run["tokens"]
        total = (token["last_confirmed_cumulative"] or {}).get("total_input_plus_output")
        lines.append(f"| {run['run_id']} | {run['status']} | {show(token['last_confirmed_turn'])} | {show(total)} | {show(run['timing']['runner_cumulative_ms'])} | {show(run['mcp_wire']['distinct_tool_requests'])} | {token['unknown_usage_turns']} |")
    lines += ["", "## Tempos separados", "", "| Run | Geração registrada (ms) | Render + verificação conhecidos (ms) | Total de render completo (ms) | Coordenador conhecido (ms) |", "|---|---:|---:|---:|---:|"]
    for run in report["runs"]:
        time = run["timing"]; coord = time["coordinator"]
        lines.append(f"| {run['run_id']} | {show(time['generation']['total_elapsed_ms'])} | {show(coord['renderer_and_verification_known_ms'])} | {show(coord['renderer_total_ms'])} | {show(coord['coordinator_total_known_ms'])} |")
    lines += ["", "Coordenador já inclui renderização/verificação; não somar essas parcelas novamente. Reuso verificado não mede o render original. Geração é soma das durações registradas por tentativa distinta, sem afirmar tempo total de parede.", "",
              "O denominador de qualquer taxa usa tempo ativo do runner, incluindo MCP, cliente e overhead. Não usa intervalo entre datas de início/fim e não mede inferência pura. Cached input e reasoning output são subconjuntos, não tokens adicionais. Falha sem usage permanece desconhecida; contador anterior inalterado não comprova custo zero.", "", "## Integridade e cobertura", ""]
    for run in report["runs"]:
        failed = [k for k, v in run["integrity"]["checks"].items() if v is False]
        unknown = [k for k, v in run["integrity"]["checks"].items() if v is None]
        lines += [f"- **{run['run_id']}**: checks divergentes={failed}; não verificados={unknown}. Falhas de infraestrutura={len(run['tool_events']['infrastructure_failures'])}; etapas do coordenador inválidas={len(run['timing']['coordinator']['failed_stage_attempts'])}; erros wire={run['mcp_wire'].get('error_category_counts', {})}."]
        if run["issues"]:
            lines.append("  Observações: " + "; ".join(run["issues"]))
    lines += ["", "As evidências e deltas auditáveis estão no JSON associado. Modelo/esforço são observações do runtime; identidade de resposta do provedor pode estar ausente. Configuração de guidance, instruções retornadas e carregamento de skills são evidências distintas. Não há ranking criativo, cobrança medida ou inferência de sucesso humano.", ""]
    return "\n".join(lines)


def write_outputs(report, prefix):
    prefix = Path(prefix).resolve()
    if prefix.is_relative_to(Path(report["runs_root"]).resolve()):
        raise ValueError("Metrics outputs must be outside the runs directory")
    paths = [Path(str(prefix) + suffix) for suffix in (".json", ".md")]
    if any(path.exists() for path in paths):
        raise FileExistsError("Output prefix already exists; no overwrite is permitted")
    prefix.parent.mkdir(parents=True, exist_ok=True)
    content = [json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", markdown(report)]
    for path, text in zip(paths, content):
        with path.open("x") as stream:
            stream.write(text)
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schedule", required=True, type=Path)
    parser.add_argument("--runs-root", required=True, type=Path)
    parser.add_argument("--run", required=True, action="append", dest="selected")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    report = summarize(args.schedule, args.runs_root, args.selected)
    print(json.dumps({"outputs": [str(p) for p in write_outputs(report, args.out)], "runs": len(report["runs"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

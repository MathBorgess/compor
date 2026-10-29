#!/usr/bin/env python3
"""Exercise this MCP through an isolated Codex app-server without a model turn.

Requires POSIX process groups, Codex CLI, Node.js, and an already built prototype.
Writes only temporary, synthetic Codex state and emits one JSON report on stdout.
"""

import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run():
    require(os.name == "posix", "Este teste exige POSIX/macOS e grupos de processos.")
    codex = shutil.which("codex")
    node = shutil.which("node")
    entry = Path(__file__).resolve().parents[1] / "dist" / "stdio.js"
    require(codex is not None, "Codex CLI não encontrado no PATH.")
    require(node is not None, "Node.js não encontrado no PATH.")
    require(entry.is_file(), "Execute npm run build antes deste teste.")

    report = {
        "scope": "isolated_codex_app_server_synthetic_no_auth",
        "transport": "stdio",
        "model_turn_started": False,
        "tests": {},
    }
    with tempfile.TemporaryDirectory(prefix="compor-codex-native-") as temp:
        # Use a fresh Codex client directory, with an explicit environment that
        # does not inherit credentials, user MCP configuration, or plugins.
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "CODEX_HOME": temp,
            "TMPDIR": temp,
            "COMPOR_PROFILE_DIR": str(Path(temp) / "profile"),
            "TERM": "dumb",
            "NO_COLOR": "1",
        }
        config = [
            "-c", f"mcp_servers.compor_probe.command={json.dumps(node)}",
            "-c", f"mcp_servers.compor_probe.args={json.dumps([str(entry)])}",
            "-c", 'model_provider="offline_probe"',
            "-c", 'model="offline_probe_model"',
            "-c", 'model_providers.offline_probe.name="offline_probe"',
            "-c", 'model_providers.offline_probe.base_url="http://127.0.0.1:9"',
            "-c", 'model_providers.offline_probe.wire_api="responses"',
        ]
        version = subprocess.run(
            [codex, "--version"], env=env, cwd=temp, capture_output=True,
            text=True, timeout=15, check=True,
        )
        report["codex_cli"] = version.stdout.strip()
        configured = subprocess.run(
            [codex, *config, "mcp", "list", "--json"], env=env, cwd=temp,
            capture_output=True, text=True, timeout=15, check=True,
        )
        names = [item["name"] for item in json.loads(configured.stdout)]
        require(names == ["compor_probe"], "A configuração MCP não está isolada.")
        report["tests"]["isolated_single_server"] = True

        process = subprocess.Popen(
            [codex, *config, "app-server"], env=env, cwd=temp,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1, start_new_session=True,
        )
        messages = queue.Queue()

        def read_messages():
            for line in process.stdout:
                try:
                    messages.put(json.loads(line))
                except json.JSONDecodeError:
                    messages.put({"unexpected_non_json": True})

        threading.Thread(target=read_messages, daemon=True).start()

        def send(value):
            process.stdin.write(json.dumps(value) + "\n")
            process.stdin.flush()

        def request(request_id, method, params, timeout=25):
            send({"id": request_id, "method": method, "params": params})
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                try:
                    message = messages.get(timeout=max(0.1, deadline - time.monotonic()))
                except queue.Empty:
                    break
                if message.get("id") == request_id:
                    if "error" in message:
                        raise RuntimeError(f"{method}: erro RPC {message['error'].get('code')}")
                    return message.get("result", {})
            raise TimeoutError(method)

        def unpack(result):
            require(not result.get("isError"), "Tool retornou erro.")
            if result.get("structuredContent") is not None:
                return result["structuredContent"]
            block = next(item for item in result["content"] if item.get("type") == "text")
            return json.loads(block["text"])

        try:
            request(1, "initialize", {
                "clientInfo": {"name": "compor-probe", "version": "0.1"},
                "capabilities": {"experimentalApi": True},
            })
            send({"method": "initialized", "params": {}})
            report["tests"]["app_server_initialize"] = True
            status = request(2, "mcpServerStatus/list", {
                "serverName": "compor_probe", "detail": "toolsAndAuthOnly",
            })
            require(len(status["data"]) == 1, "Descoberta retornou mais de um servidor.")
            server = status["data"][0]
            require(server["name"] == "compor_probe", "Servidor inesperado.")
            require(not server.get("toolsError"), "Falha na descoberta de tools.")
            expected_tools = {
                "list_skills",
                "load_skill",
                "prepare_word_cloud",
                "prepare_moodboard",
                "prepare_layered_creative",
                "prepare_annotation_context",
                "search_curated_references",
                "stage_approved_references",
                "compose_creative_direction",
                "discover_visual_references",
                "record_visual_feedback",
                "phoenix_profile_consent",
                "phoenix_profile_signal",
                "phoenix_profile_read",
                "phoenix_profile_undo",
            }
            require(expected_tools <= set(server["tools"]),
                    "Tools essenciais ausentes.")
            report["tests"]["codex_mcp_discovery"] = sorted(server["tools"])

            # A thread is needed by mcpServer/tool/call; no turn/start is sent.
            thread = request(3, "thread/start", {
                "cwd": temp, "ephemeral": True, "approvalPolicy": "never",
            })
            thread_id = thread["thread"]["id"]
            report["tests"]["ephemeral_thread_without_turn"] = True

            def call(request_id, name, arguments):
                return request(request_id, "mcpServer/tool/call", {
                    "threadId": thread_id, "server": "compor_probe",
                    "tool": name, "arguments": arguments,
                })

            catalog = unpack(call(4, "list_skills", {}))["skills"]
            ids = {skill["id"] for skill in catalog}
            expected = {"entender-intencao", "traduzir-direcao", "explorar-moodboards", "criar-piloto"}
            require(ids == expected and len(catalog) == 4, "Catálogo inesperado.")
            require(all(skill["version"] == "0.1.0-prototype" for skill in catalog), "Versão inesperada.")
            report["tests"]["list_skills"] = {"ids": sorted(ids), "version": "0.1.0-prototype"}

            loaded = unpack(call(5, "load_skill", {"id": "entender-intencao"}))
            require(loaded["id"] == "entender-intencao", "Skill inesperada.")
            require(loaded["version"] == "0.1.0-prototype", "Versão inesperada.")
            require(len(loaded["instructions"]) > 40, "Instruções insuficientes.")
            digest = hashlib.sha256(loaded["instructions"].encode("utf-8")).hexdigest()
            require(loaded["contentSha256"] == digest, "Hash da skill divergente.")
            report["tests"]["load_skill"] = {
                "id": loaded["id"], "version": loaded["version"],
                "content_sha256_matches": True, "contentSha256": digest,
            }
            cloud = unpack(call(6, "prepare_word_cloud", {"words": [{
                "word": "calma", "frequency": 2, "suggested_weight": 3, "chosen_weight": 0,
            }]}))
            require(len(cloud["words"]) == 1, "Nuvem de palavras inesperada.")
            require(cloud["words"][0]["effective_weight"] == 0, "Peso escolhido não preservado.")
            require(cloud["words"][0]["effective_source"] == "client_supplied_choice", "Origem de peso inesperada.")
            require(cloud["creates_confirmed_preference"] is False, "Preferência não pode ser confirmada.")
            report["tests"]["prepare_word_cloud"] = {
                "effective_weight": 0, "effective_source": "client_supplied_choice",
                "creates_confirmed_preference": False,
            }
            board = unpack(call(7, "prepare_moodboard", {
                "board_id": "board-fixture", "board_version": "v1", "direction": "acolhimento",
                "elements": [
                    {"id": "ref-a", "kind": "reference", "asset_ref": "ref-a", "label": "minha marca", "aspects": ["color"], "intent": "keep", "priority": 0, "origin_claim": "pessoa"},
                    {"id": "icone-a", "kind": "icon", "value": "folha", "intent": "inspire"},
                ],
                "restrictions": [{"aspect": "color", "value": "azul", "rule": "must_keep"}],
            }))
            require(board["board_id"] == "board-fixture" and board["board_version"] == "v1", "Quadro inesperado.")
            require(board["elements"][0]["priority"] == 0 and board["elements"][1]["priority"] is None, "Prioridades perdidas.")
            require(board["elements"][1]["visual_role"] == "style_hint", "Ícone deve ser pista visual.")
            require(board["origins_verified"] is False and board["creates_confirmed_preference"] is False, "Origem ou preferência indevidamente verificada.")
            require(board["renders_or_generates_image"] is False and board["persists_data"] is False, "Efeitos inesperados no quadro.")
            require(board["client_data_is_untrusted"] is True and board["conflict_detection"] == "literal_only", "Limites do snapshot ausentes.")
            report["tests"]["prepare_moodboard"] = {"snapshot_received": True, "style_hint": True, "priority_zero_and_missing": True, "no_generation_or_persistence": True, "origins_verified": False}
            require(call(8, "load_skill", {"id": "nao-existe"}).get("isError") is True,
                    "Skill desconhecida deveria retornar erro.")
            report["tests"]["unknown_skill_is_error"] = True

            piece = {"piece_id": "piece-fixture", "version": "v1", "width_px": 1080, "height_px": 1350,
                     "campaign_ref": "campanha-fixture", "product_ref": "produto-fixture", "variation_ref": "variante-a",
                     "layers": [
                         {"id": "preco", "kind": "text", "name": "Preço", "z_index": 1,
                          "rect": {"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.1},
                          "text": "R$ 39", "font_size_px": 40, "color_hex": "#112233"},
                         {"id": "fundo", "kind": "image", "name": "Fundo", "z_index": 0,
                          "rect": {"x": 0, "y": 0, "width": 1, "height": 1}, "asset_ref": "fundo-fixture"},
                     ]}
            creative = unpack(call(9, "prepare_layered_creative", {"piece": piece}))
            require([layer["id"] for layer in creative["piece"]["layers"]] == ["fundo", "preco"], "Ordem das camadas inesperada.")
            require(creative["piece"]["layers"][1]["font_size_px"] == 40, "Estilo sintético perdido.")
            require(creative["renders_or_generates_image"] is False and creative["persists_data"] is False, "Efeitos inesperados no criativo.")
            report["tests"]["prepare_layered_creative"] = {"ordered_layers": True, "synthetic_style": True, "no_generation_or_persistence": True}
            annotation = unpack(call(10, "prepare_annotation_context", {
                "piece": creative["piece"],
                "annotations": [
                    {"id": "a", "piece_version": "v1", "target": {"kind": "layer", "layer_id": "preco"}, "note": "Aumente a fonte", "edit_scope_claim": "layer"},
                    {"id": "b", "piece_version": "v1", "target": {"kind": "area", "rect": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.1}}, "note": "Fundo muito forte", "edit_scope_claim": "piece", "memory_scope_claim": "campaign"},
                ],
            }))
            require(annotation["annotations"][0]["candidate_layer_ids"] == ["preco"], "Alvo de camada incorreto.")
            require(set(annotation["annotations"][1]["candidate_layer_ids"]) == {"preco", "fundo"}, "Candidatas por área incorretas.")
            require(annotation["annotations"][1]["candidate_detection"] == "bounding_box_only", "Sobreposição deve ser apenas geométrica.")
            require(annotation["annotations"][1]["edit_scope_claim"] == "piece" and annotation["annotations"][1]["memory_scope_claim"] == "campaign", "Escopos não foram preservados separadamente.")
            require(annotation["scope_claims_verified"] is False and annotation["input_snapshot_authenticated"] is False, "Alegações não são verificadas.")
            require(annotation["updates_memory"] is False and annotation["persists_data"] is False, "Anotação não deve persistir ou atualizar memória.")
            report["tests"]["prepare_annotation_context"] = {"layer_and_area": True, "scope_claim_unverified": True, "no_memory_update": True}
            discovery = unpack(call(11, "discover_visual_references", {
                "briefing": "Exemplo fictício de curso de criatividade",
                "target_format": "carousel_editorial_4:5",
                "client_mode": "web",
                "decision_fallback_mode": "deterministic_mock",
            }))
            require(discovery["decision_engine_source"] == "deterministic_mock", "Motor inesperado.")
            require(discovery["candidate_origin"] == "synthetic", "Origem sintética não identificada.")
            require(len(discovery["candidates"]) > 0, "Busca sintética não retornou candidatos.")
            require(discovery["telemetry"]["board_html_path"] is None, "Busca sintética não deve produzir HTML.")
            report["tests"]["phoenix_synthetic_discovery"] = {
                "engine": discovery["decision_engine_source"],
                "origin": discovery["candidate_origin"],
                "candidate_count": len(discovery["candidates"]),
                "html_created": False,
            }
        finally:
            try:
                process.stdin.close()
            except OSError:
                pass
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            # The process group belongs to this run only. Clean up a remaining
            # stdio child if the app-server exited before it did.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            report["tests"]["own_app_server_exited"] = process.poll() is not None
    return report


if __name__ == "__main__":
    try:
        print(json.dumps(run(), ensure_ascii=False, indent=2))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__, "reason": str(exc)}, ensure_ascii=False))
        sys.exit(1)

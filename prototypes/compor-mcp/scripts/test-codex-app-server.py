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
            require(set(server["tools"]) == {"list_skills", "load_skill", "prepare_word_cloud"},
                    "Tools inesperadas.")
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
            require(call(7, "load_skill", {"id": "nao-existe"}).get("isError") is True,
                    "Skill desconhecida deveria retornar erro.")
            report["tests"]["unknown_skill_is_error"] = True
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

"""Verify the frozen synthetic dataset and replay evidence without network access."""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATASET = HERE / "dataset.v1.json"


def check(condition, message):
    if not condition:
        raise ValueError(message)


def source(path, base=ROOT):
    check(isinstance(path, str), "Caminho inválido")
    relative = Path(path)
    result = (base / relative).resolve()
    check(not relative.is_absolute() and result.is_relative_to(base) and result.is_file(),
          f"Arquivo ausente ou fora do corpus: {path}")
    return result


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def index_by_id(rows):
    indexed = {item["id"]: item for item in rows}
    check(len(indexed) == len(rows), "IDs repetidos")
    check(all(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", id_) for id_ in indexed), "ID inválido")
    return indexed


def valid_text(value):
    return isinstance(value, str) and bool(value.strip())


def valid_text_list(values):
    return isinstance(values, list) and all(valid_text(value) for value in values)


def verify_replay(replay, cases):
    check(cases[replay["caseId"]]["partition"] == "development", "Replay expõe caso reservado")
    check(re.fullmatch(r"[a-f0-9]{40}", replay["sourceCommit"]), "Commit histórico inválido")
    packet = source(replay["packet"])
    stages = json.loads(packet.read_text(encoding="utf-8"))["stages"]
    artifacts = [artifact for stage in stages for artifact in stage["artifacts"]]
    ids = {artifact["id"] for artifact in artifacts}
    check(len(ids) == len(artifacts) and bool(ids), f"Inventário inválido em {replay['packet']}")
    digest = hashlib.sha256()
    for artifact in artifacts:
        digest.update((artifact["id"] + "\n" + artifact["caption"] + "\n").encode("utf-8"))
        digest.update(source(artifact["preview_360"], packet.parent).read_bytes())
    check(digest.hexdigest() == replay["manifestAndPreviewsSha256"],
          f"Hash de replay divergente: {replay['caseId']}")
    return len(artifacts)


def verify(dataset):
    check(type(dataset["version"]) is int and dataset["version"] == 1, "Versão de corpus incompatível")
    cases = index_by_id(dataset["cases"])
    controls = index_by_id(dataset["controls"])
    check({row["partition"] for row in cases.values()} == {"development", "holdout"}, "Divisão de casos inválida")
    paths = set()
    for id_, case in cases.items():
        check(case["provenance"]["kind"] == "synthetic" and valid_text(case["provenance"]["source"]),
              f"Proveniência inválida: {id_}")
        check(case["humanFeedback"] is None, f"Fixture com reação humana: {id_}")
        request = case["input"]
        check(all(valid_text(request[key]) for key in ("locale", "format", "project", "request")),
              f"Entrada incompleta: {id_}")
        for turn in request["turns"]:
            check(turn["role"] in {"user", "assistant"} and valid_text(turn["content"]),
                  f"Turno inválido: {id_}")
        for reference in request["references"]:
            attributes = reference["selectedAttributes"]
            check(bool(attributes) and valid_text_list(attributes), f"Referência sem seleção: {id_}")
            paths.add(reference["asset"])
        expectation_keys = ("confirmedFacts", "unknowns", "creativeAnchors", "forbiddenClaims", "visualChecks")
        check(all(valid_text_list(case["expectations"][key]) for key in expectation_keys),
              f"Gabarito incompleto: {id_}")
    for id_, control in controls.items():
        check(cases[control["caseId"]]["partition"] == "development", f"Controle expõe caso reservado: {id_}")
        artifact, expected = control["artifact"], control["expected"]
        check(all(valid_text(artifact[key]) for key in ("briefing", "imagePrompt", "caption")),
              f"Artefato incompleto: {id_}")
        check(expected["disposition"] in {"pass", "revise", "block", "abstain"}, f"Decisão inválida: {id_}")
        check(valid_text_list(expected["findings"]), f"Achados inválidos: {id_}")
        if "image" in artifact:
            paths.add(artifact["image"])
        else:
            check(expected["disposition"] in {"block", "abstain"}, f"Decisão sem pixels: {id_}")

    check(paths == dataset["assetSha256"].keys(), "Inventário de assets divergente")
    for path in sorted(paths):
        asset = source(path)
        check(sha256(asset) == dataset["assetSha256"][path], f"Hash de PNG divergente: {path}")
        with Image.open(asset) as png:
            check(png.format == "PNG", f"Asset com formato inválido: {path}")
            png.verify()

    replays = dataset["replays"]
    check(len({replay["caseId"] for replay in replays}) == len(replays), "Replay duplicado")
    replay_count = sum(verify_replay(replay, cases) for replay in replays)
    return len(cases), len(controls), len(paths), replay_count


if __name__ == "__main__":
    cases, controls, assets, versions = verify(json.loads(DATASET.read_text(encoding="utf-8")))
    print(f"{cases} casos, {controls} controles, {assets} PNGs e {versions} versões históricas conferidos")

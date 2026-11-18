"""Confere localmente a cadeia de quatro rodadas e as imagens que sustentam os pareceres."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def check(ok, reason):
    if not ok:
        raise ValueError(reason)


def moment(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def audit(root):
    fixtures = root / "cases.json"
    cases = read(fixtures)
    ids = [entry["id"] for entry in cases]
    check(3 <= len(ids) <= 5 and len(set(ids)) == len(ids), "Cada marco exige três a cinco casos distintos.")
    known = {case["id"]: {ref["id"]: ref["transport"]["sha256"]
                          for ref in case["visualInput"]["entries"]} for case in cases}
    rounds = []
    receipts_seen = set()
    previous_judges = {}
    latest_end = None
    for r in range(4):
        folder = root / f"round-{r}"
        release = read(root / f"ready-{r}.json")
        summary = read(folder / "complete.json")
        check(release["round"] == r == summary["round"], "Identidade da rodada divergente.")
        check(release["revision"] == summary["revision"], "Revisão da execução divergente.")
        check(release.get("previousJudgeSha256", {}) == previous_judges, "A candidata exige os três pareceres anteriores.")
        index = read(folder / "index.json")
        check([entry["id"] for entry in index] == ids, "Casos mudaram durante o ciclo.")
        intervals = []
        image_count = attachment_count = 0
        launches = []
        for entry in index:
            case_id = entry["id"]
            records = read(folder / case_id / "receipts.json")
            plan = read(folder / case_id / "plan.json")
            check(len(records) == 4 and len(entry["slots"]) == 3, "Lote incompleto.")
            check(records[0]["plan"] == plan == entry["plan"], "Plano divergente do recibo.")
            check([slot["position"] for slot in entry["slots"]] == [1, 2, 3], "Slots repetidos ou ausentes.")
            for rec in records:
                check(rec["state"] == "complete" and rec["revision"] == release["revision"] and
                      rec["fixture"] == digest(fixtures), "Recibo incompleto ou de outro ensaio.")
                check(rec["receipt"] not in receipts_seen, "Recibo reutilizado.")
                receipts_seen.add(rec["receipt"])
            starts = [moment(rec["started"]) for rec in records[1:]]
            if latest_end is not None:
                gap = (moment(records[0]["started"]) - latest_end).total_seconds()
                check(gap >= 15, "Novo plano iniciado antes dos 15 segundos após o lote.")
                intervals.append(gap)
            latest_end = max(moment(rec["updated"]) for rec in records[1:])
            launches.append((max(starts)-min(starts)).total_seconds())
            for slot, rec in zip(entry["slots"], records[1:]):
                image = folder / case_id / f"art-{slot['position']}.png"
                check(rec["sha256"] == slot["sha256"] == digest(image), "Pixels diferentes do recibo.")
                check(rec["referenceIds"] == plan["referenceIds"], "Seleção do plano e do envio divergem.")
                delivered = [{"id": k, "sha256": known[case_id][k]} for k in plan["referenceIds"]]
                check(slot["delivered"] == delivered, "Bytes selecionados divergem do manifesto.")
                attachment_count += len(delivered)
                image_count += 1
        previous_judges = {str(stage): digest(folder / f"judge-{stage}.json") for stage in (3, 4, 5)}
        check((summary["plans"], summary["images"]) == (len(cases), image_count), "Denominador do ensaio incorreto.")
        rounds.append({"rodada": r, "revisao": release["revision"], "planos": len(cases), "imagens": image_count,
                       "anexosSomados": attachment_count, "menorIntervaloAposLoteSegundos": min(intervals),
                       "maiorDiferencaEntreInicioDosTresEnviosSegundos": max(launches), "hashesPareceres": previous_judges})
    return {"rodadas": rounds, "recibosUnicos": len(receipts_seen)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pasta", type=Path)
    print(json.dumps(audit(parser.parse_args().pasta.resolve()), indent=2, ensure_ascii=False))

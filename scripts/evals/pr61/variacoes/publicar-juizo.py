"""Vincula duas sessões independentes e publica um resumo atômico de desenvolvimento."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
from resumo import summarize


def publish(directory, stage):
    destination = directory / f"judge-{stage}.json"
    views = {}
    expected_ids={row["id"] for row in json.loads((directory/"index.json").read_text())}
    if not 3<=len(expected_ids)<=5: raise ValueError("Grupo deve conter 3–5 casos únicos")
    splits={}
    for mode in ("plan","pixels"):
        folder = directory / f"jury-{stage}-{mode}"
        view = summarize(folder,False)
        cases=json.loads((folder/"blind-index.json").read_text())["cases"].values()
        current_splits={record["id"]:record["split"] for record in cases}
        if set(current_splits)!=expected_ids or (splits and current_splits!=splits):
            raise ValueError("As sessões não cobrem o mesmo grupo")
        splits=current_splits
        development={case for case,split in splits.items() if split=="desenvolvimento"}
        if view["stage"]!=stage or view["modality"]!=mode or {row["case"] for row in view["cases"]}!=development:
            raise ValueError("Resumo incompatível")
        views[mode] = {"independentSessions":view["threadIds"], "answerSha256":view["answerSha256"],
                       "receipt":str((folder/"judge-receipt.json").relative_to(directory)),
                       "development":view["cases"],"sealedResults":str((folder/"judge-answer.json").relative_to(directory))}
    sessions=[s for view in views.values() for s in view["independentSessions"]]
    if len(sessions)!=2 or len(set(sessions))!=2: raise ValueError("Sessões independentes ausentes")
    result={"stage":stage,"round":directory.name,"casesJudged":len(splits),"developmentCases":len(development),"reservedCases":len(splits)-len(development),
            "indexSha256":hashlib.sha256((directory/"index.json").read_bytes()).hexdigest(),"views":views}
    if destination.exists():
        if json.loads(destination.read_text())!=result: raise FileExistsError("Juízo diferente já publicado")
        return
    with tempfile.NamedTemporaryFile("w",dir=directory,delete=False) as stream:
        json.dump(result,stream,ensure_ascii=False,indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
        name=stream.name
    os.replace(name,destination)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("round",type=Path)
    parser.add_argument("stage",type=int,choices=[3,4])
    args=parser.parse_args()
    publish(args.round,args.stage)

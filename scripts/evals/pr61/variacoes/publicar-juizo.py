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
    for mode in ("plan","pixels"):
        folder = directory / f"jury-{stage}-{mode}"
        view = summarize(folder,False)
        if view["stage"]!=stage or view["modality"]!=mode or len(view["cases"])!=3:
            raise ValueError("Resumo incompatível")
        views[mode] = {"independentSessions":view["threadIds"], "answerSha256":view["answerSha256"],
                       "receipt":str((folder/"judge-receipt.json").relative_to(directory)),
                       "development":view["cases"],"sealedResults":str((folder/"judge-answer.json").relative_to(directory))}
    sessions=[s for view in views.values() for s in view["independentSessions"]]
    if len(sessions)!=2 or len(set(sessions))!=2: raise ValueError("Sessões independentes ausentes")
    result={"stage":stage,"round":directory.name,"casesJudged":5,"developmentCases":3,"reservedCases":2,
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

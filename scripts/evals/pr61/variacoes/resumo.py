"""Resume as avaliações de uma rodada e deixa a reserva selada por padrão."""
import argparse
import collections
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def summarize(path, unseal):
    receipt=read(path/'judge-receipt.json')
    raw=(path/'judge-answer.json').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=receipt['answerSha256']:
        raise ValueError('Hash da resposta divergente')
    answer=json.loads(raw)['cases']
    index=read(path/'blind-index.json')
    cases=[]
    for output in answer:
        entry=index['cases'][output['case']]
        if entry['split']=='reserva' and not unseal:
            continue
        scores=[r['score'] for r in output['observations']]
        known=[n for n in scores if n is not None]
        kinds=collections.Counter(r['kind'] for r in output['problems'])
        rows={'case':entry['id'],'known':len(known),'denominator':len(scores),
              'points':sum(known) if known else None,'maxKnown':2*len(known),'scores':{str(k):v for k,v in collections.Counter(known).items()},
              'problems':dict(kinds),'advice':output['change']}
        if index['stage']==3:
            rows['byAttribute']={}
            for n in range(1,5):
                vals=[o['score'] for o in output['observations'] if o['unit'].endswith(str(n))]
                rows['byAttribute'][str(n)]={'fullyMet':vals.count(2),'absentOrContradicted':vals.count(0),'unknown':vals.count(None)}
        cases.append(rows)
    return {'stage':index['stage'],'modality':index['mode'],'cases':sorted(cases,key=lambda item:item['case']),
            'threadIds':receipt['threadIds'],'answerSha256':receipt['answerSha256']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jury',nargs='+',type=Path)
    parser.add_argument('--unseal',action='store_true',help='Usar após congelar a rodada final')
    args=parser.parse_args()
    print(json.dumps([summarize(d,args.unseal) for d in args.jury],ensure_ascii=False,indent=2))

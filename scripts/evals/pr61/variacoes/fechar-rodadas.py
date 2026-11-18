"""Consolida os quatro grupos completos, depois da última decisão de instrução."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import subprocess
from comparar import compare
from resumo import summarize

HERE=Path(__file__).resolve().parent
TRIAGE=HERE.parent/'triagem'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def counters(records):
    points=[n for row in records for n in row['observations'].values() if n is not None]
    denominator=sum(len(row['observations']) for row in records)
    problems=collections.Counter(p['kind'] for row in records for p in row['problems'])
    return {'cases':len(records),'known':len(points),'denominator':denominator,
            'points':sum(points) if points else None,'maxKnown':2*len(points),
            'fullyMet':points.count(2),'partial':points.count(1),'absentOrContradicted':points.count(0),
            'issues':dict(problems)}


def jury(directory,stage,mode):
    folder=directory/f'jury-{stage}-{mode}'
    summary=summarize(folder,True)
    mapping=json.loads((folder/'blind-index.json').read_text())['cases']
    items=[]
    for c in json.loads((folder/'judge-answer.json').read_text())['cases']:
        original=mapping[c['case']]
        slots={alias:str(s['position']) for alias,s in original['slots'].items()}
        scores={}
        for o in c['observations']:
            unit=o['unit']
            if stage==3: translated=slots[unit[0]]+'.'+unit[1]
            else: translated='-'.join(sorted(slots[s] for s in unit))
            scores[translated]=o['score']
        issues=[{'slot':int(slots[p['slot']]),'kind':p['kind'],'evidence':p['quote_or_location']} for p in c['problems']]
        items.append({'id':original['id'],'split':original['split'],'observations':dict(sorted(scores.items())),'problems':issues})
    items.sort(key=lambda c:c['id'])
    return {'runIds':summary['threadIds'],'answerSha256':summary['answerSha256'],'cases':items,
            'all':counters(items),'development':counters([c for c in items if c['split']=='desenvolvimento']),
            'holdout':counters([c for c in items if c['split']=='reserva'])}


def read_group(directory):
    complete=json.loads((directory/'complete.json').read_text())
    index=directory/'index.json'
    rows=json.loads(index.read_text())
    replay=json.loads(subprocess.check_output(['node',str(TRIAGE/'replay-rodada.mjs'),str(index)]))
    receipts=[]
    for row,observed in zip(rows,replay):
        if row['id']!=observed['id']: raise ValueError('Índices fora de ordem')
        receipts.append({'id':row['id'],'references':observed.get('selected'),'bytesPerImage':observed.get('expectedInputBytes'),
                         'planSha256':sha((directory/row['id']/'plan.json').read_bytes()) if row.get('plan') else None,
                         'receiptsSha256':sha((directory/row['id']/'receipts.json').read_bytes()),
                         'slots':[{'position':s['position'],'state':s['state'],'sha256':s.get('sha256'),
                                   'deliveryConfirmed':obs['delivered']} for s,obs in zip(row['slots'],observed['slots'])]})
    return {'round':complete['round'],'revision':complete['revision'],'indexSha256':sha(index.read_bytes()),
            'plans':complete['plans'],'images':complete['images'],'receipts':receipts,
            'stages':{str(stage):{mode:jury(directory,stage,mode) for mode in ('plan','pixels')} for stage in (3,4)}}


def close(root):
    dirs=[root/f'round-{i}' for i in range(4)]
    if not all((d/'judge-5.json').is_file() for d in dirs): raise ValueError('Aguardar os quatro grupos e o marco 5')
    rounds=[read_group(directory) for directory in dirs]
    for r in rounds:
        if r['plans']!=5 or r['images']!=15: raise ValueError('Grupo real incompleto')
    comparisons=[]
    for d,r in zip(dirs[1:],rounds[1:]):
        paired=compare(dirs[0],d,True)
        for label,key in [('3','triageImprovedCases'),('4','variationImprovedCases')]:
            unsupported=sum(view['all']['issues'].get('unsupported_fact',0) for view in r['stages'][label].values())
            paired.setdefault('stages',{})[label]={
                'casesMeetingImprovement':paired[key],'required':2,'unsupportedFactObservations':unsupported,
                'meetsLocalCriteria':paired[key]>=2 and paired['casesWithBlockingFindings']==0 and unsupported==0}
        comparisons.append(paired)
    corpus=subprocess.check_output(['node',str(TRIAGE/'corpus.mjs')])
    return {'baselineRevision':rounds[0]['revision'],'corpusSha256':sha(corpus),
            'rubricSha256':sha((TRIAGE/'protocolo-rodadas.md').read_bytes()),
            'scale':'0 ausente/contradito, 1 parcial, 2 fiel ou distintivo; null não observável',
            'units':{'3':'posição.atributo; quatro atributos por posição','4':'posição-posição; pares por lote'},
            'rounds':rounds,'comparisonsWithBaseline':comparisons}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifacts',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    args.output.write_text(json.dumps(close(args.artifacts),ensure_ascii=False,indent=2)+'\n')

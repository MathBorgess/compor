"""Compara dois índices reais conforme a rubrica congelada. Por padrão usa apenas desenvolvimento."""
import argparse
import json
from pathlib import Path
import subprocess
from resumo import summarize

REPLAY=Path(__file__).resolve().parents[1]/'triagem/replay-rodada.mjs'


def read_round(directory,unseal):
    stages={}
    for stage in (3,4):
        summary=summarize(directory/f'jury-{stage}-pixels',unseal)
        stages[stage]={row['case']:row for row in summary['cases']}
    transport=json.loads(subprocess.check_output(['node',str(REPLAY),str(directory/'index.json')]))
    return stages,{row['id']:row for row in transport}


def transferred(row):
    if row['completed']!=3 or not all(s['delivered'] is True for s in row['slots']):
        return None
    return 3*row['expectedInputBytes']


def compare(control,candidate,unseal):
    old,old_files=read_round(control,unseal)
    new,new_files=read_round(candidate,unseal)
    ids=sorted(old[3])
    if set(ids)!=set(new[3]) or set(ids)!=set(old[4]) or set(ids)!=set(new[4]):
        raise ValueError('Cobertura não pareada')
    cases=[]
    for case in ids:
        reasons=[]
        a,b=old[3][case],new[3][case]
        c,d=old[4][case],new[4][case]
        before_bytes,after_bytes=transferred(old_files[case]),transferred(new_files[case])
        if new_files[case]['planValid'] is None:
            reasons.append('sem_plano_validado_ou_arte')
        elif before_bytes is None or after_bytes is None:
            reasons.append('entrega_nao_comprovada')
        if any(v['known']!=v['denominator'] for v in (a,b,c,d)): reasons.append('julgamento_incompleto')
        for kind in ('unsupported_fact','extra_copy','missing_fact','unreadable'):
            if kind in b['problems'] or kind in d['problems']: reasons.append(kind)
        for key,old_attr in a['byAttribute'].items():
            new_attr=b['byAttribute'][key]
            if old_attr['unknown'] or new_attr['unknown']: continue
            if new_attr['fullyMet']<old_attr['fullyMet'] or new_attr['absentOrContradicted']>old_attr['absentOrContradicted']:
                reasons.append('atributo_'+key+'_piorou')
        old_pairs=c['scores'].get('2',0) if c['known']==c['denominator'] else None
        new_pairs=d['scores'].get('2',0) if d['known']==d['denominator'] else None
        comparable=old_pairs is not None and new_pairs is not None
        if comparable and (new_pairs<old_pairs or d['scores'].get('0',0)>c['scores'].get('0',0)):
            reasons.append('divergencia_piorou')
        perfect=b['points']==2*b['denominator']
        fidelity_gain=(b['points'] is not None and a['points'] is not None and b['points']>a['points'])
        savings=perfect and before_bytes is not None and after_bytes is not None and after_bytes<before_bytes
        cases.append({'id':case,'triagePoints':[a['points'],b['points']],'fullyDistinctPairs':[old_pairs,new_pairs],
                      'transferredReferenceBytes':[before_bytes,after_bytes],'triageImproved':fidelity_gain or savings,
                      'variationImproved':comparable and new_pairs>old_pairs,'blockingFindings':reasons})
    return {'control':control.name,'candidate':candidate.name,'reservedIncluded':unseal,'cases':cases,
            'triageImprovedCases':sum(v['triageImproved'] for v in cases),
            'variationImprovedCases':sum(v['variationImproved'] for v in cases),
            'casesWithBlockingFindings':sum(bool(v['blockingFindings']) for v in cases)}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('control',type=Path);parser.add_argument('candidate',type=Path)
    parser.add_argument('--unseal',action='store_true')
    args=parser.parse_args()
    print(json.dumps(compare(args.control,args.candidate,args.unseal),ensure_ascii=False,indent=2))

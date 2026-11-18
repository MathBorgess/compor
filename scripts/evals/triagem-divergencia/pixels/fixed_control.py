"""Blind pixel assessment of a single fixed-prompt pair per case, without generation."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html import escape
import json
from pathlib import Path
import secrets
import shutil
import subprocess

from PIL import Image
import gallery
import judge as j


ORIGIN = 'dataset-fixed-control'
RUBRIC = j.INSTRUCTIONS.partition('Para os pares AB')[0] + """
Cada ficha tem no máximo uma peça observada, identificada por A. Julgue a peça por si.
Preencha slots apenas para peças observadas, mantenha pairs vazio. Inclua todas as fichas.
Em change indique uma melhoria concreta localizada, ou ausência de evidência se não houver arte.
Não use ferramentas. Não infira o braço experimental, custo, preferência da pessoa ou autoria.
"""


def observations(root):
    cmd = ['node', str(j.HERE/'fixed-inputs.mjs'), str(root)]
    return json.loads(subprocess.check_output(cmd))


def keep(path, value):
    content = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    try:
        with path.open('x') as f:
            f.write(content)
    except FileExistsError:
        j.require(path.read_text() == content, 'A evidência já existe e os dados mudaram.')


def panel(folder, round_dir, rows, packets, sides, seed):
    blind = folder/'blind'
    blind.mkdir(parents=True, mode=0o700)
    private, files, cards = {}, {}, []
    for n, row in enumerate(j.ordered(rows,seed,lambda c:c['caseId']),1):
        label = f'P{n}'
        case_id = row['caseId']
        arm = sides[case_id]
        case = packets[case_id]
        ref = case['rubric']['references']
        rec = row['arms'][arm]
        complete_pair = all(s['state']=='observed' for s in row['arms'].values())
        image, strip = None, None
        if complete_pair:
            image, strip = f'{label}-A.png', f'{label}-R.png'
            shutil.copyfile(round_dir/rec['path'], blind/image)
            j.require(j.digest((blind/image).read_bytes())==rec['sha256'],'Pixels alterados.')
            with Image.open(blind/image) as im:
                j.require(im.format=='PNG','Formato do arquivo inválido.')
                im.load()
            j.reference_strip(case,blind/strip)
            files[strip] = j.digest((blind/strip).read_bytes())
            files[image] = rec['sha256']
        private[label] = {'caseId':case_id,'arm':arm,'refIds':[r['id'] for r in ref], 'shown':complete_pair,
                          'sha256':rec['sha256'] if complete_pair else None}
        cards.append({'case':label,'brief':{key:case['context'][key] for key in ('idea','audience','goal')},
                      'direction':case['context']['direction'].split('\n',1)[0],
                      'allowedCopy':case['rubric']['allowedCopy'],'invariants':case['rubric']['invariants'],
                      'attributes':[{'ref':f'R{i}', **{k:r[k] for k in ('intent','attribute','placement','forbidden')}}
                                    for i,r in enumerate(ref,1)], 'references':strip,'outputs':{'A':image}})
    prompt = RUBRIC + '\n' + json.dumps({'attachmentOrder':list(files),'cases':cards},ensure_ascii=False)
    (blind/'prompt.txt').write_text(prompt)
    j.write_json(blind/'schema.json',j.schema())
    j.write_json(folder/'index.json',{'cases':private,'files':files,'promptSha256':j.digest(prompt.encode()),
                                     'schemaSha256':j.digest((blind/'schema.json').read_bytes())})


def prepare(root):
    obs=observations(root)
    out=root/'fixed-control/pixels'
    out.mkdir(mode=0o700,exist_ok=False)
    keep(out/'input-receipts.json',obs)
    rows=obs['cases']
    j.require(len(rows)==5 and len({c['caseId'] for c in rows})==5,'O grupo deve ter cinco casos.')
    ids=[c['caseId'] for c in rows]
    packets={i:j.expected_packet(i) for i in ids}
    seed=secrets.token_hex(24)
    first=set(j.ordered(ids,seed,str)[:len(ids)//2])
    for n in range(2):
        sides={i:j.ARMS[(int(i in first)+n)%2] for i in ids}
        panel(out/f'group-{n+1}',root/'fixed-control/round-0',rows,packets,sides,seed+str(n))


def unblind(index,answer,originals):
    rows=j.keyed(answer['cases'],'case',index['cases'])
    j.require(sorted(meta['caseId'] for meta in index['cases'].values())==sorted(originals),'Divergência no conjunto dos casos julgados.')
    results=[]
    for label,meta in index['cases'].items():
        case=originals[meta['caseId']]
        rec=case['arms'][meta['arm']]
        submitted=rows[label]
        j.require(submitted['pairs']==[],'Não há comparações entre rotas neste controle.')
        shown=all(s['state']=='observed' for s in case['arms'].values())
        j.require(shown==meta['shown'] and meta['sha256']==(rec['sha256'] if shown else None),'Estímulo divergente.')
        art=j.keyed(submitted['slots'],'slot',['A'] if shown else []).get('A')
        ids=meta['refIds']
        if 'attributeIds' in case:
            j.require(ids==case['attributeIds'],'Identidade do atributo divergente.')
        if 'files' in index:
            j.require(index['files'].get(label+'-A.png')==meta['sha256'],'Anexo cego não corresponde à unidade julgada.')
        attrs=j.keyed(art['attributes'],'ref',[f'R{i+1}' for i in range(len(ids))]) if art else {}
        reason=j.evidence(art,'reason') if art else rec.get('reason','par sem duas imagens verificadas')
        usable=art['usable'] if art else None
        j.require(usable is None or type(usable) is bool,'Usabilidade inválida.')
        failures=art['criticalFailures'] if art else []
        for failure in failures:
            j.require(failure['kind'] in j.PROBLEMS and usable is False,'Falha crítica incompatível.')
            j.evidence(failure,'location')
        scores=[]
        for i,ref in enumerate(ids,1):
            a=attrs.get(f'R{i}')
            scores.append({'refId':ref,'score':j.score(a['score']) if a else None,
                           'evidence':j.evidence(a,'evidence') if a else reason})
        results.append((case['caseId'],meta['arm'],{**rec,'judged':shown,'usable':usable,'reason':reason,
                       'criticalFailures':failures,'attributes':scores,'change':j.evidence(submitted,'change')}))
    return results


def stats(cases):
    arms={}
    for arm in j.ARMS:
        records=[c['arms'][arm] for c in cases]
        paid=[r for r in records if r['estimatedUsd'] is not None]
        scores=[a['score'] for r in records for a in r['attributes'] if a['score'] is not None]
        usability=[r['usable'] for r in records if r['usable'] is not None]
        usd=sum(r['estimatedUsd'] for r in paid) if len(paid)==len(cases) else None
        uncertain=any(r['usable'] is None and r['state']!='not-submitted' for r in records)
        arms[arm]={'expected':len(cases),'observed':sum(r['judged'] for r in records),'usabilityDecisions':len(usability),
                   'usable':sum(usability),'criticalFailures':sum(len(r['criticalFailures']) for r in records),
                   'fidelityObserved':len(scores),'fidelityExpected':sum(len(r['attributes']) for r in records),
                   'fidelityMeanPoints':sum(scores)/len(scores) if scores else None,
                   'knownSubtotalUsd':sum(r['estimatedUsd'] for r in paid),'imageCostUsd':usd,
                   'imageUsdPerUsable':usd/sum(usability) if usd is not None and any(usability) and not uncertain else None}
    matched=[]
    for c in cases:
        a,b=(c['arms'][arm] for arm in j.ARMS)
        pairs=[]
        for x,y in zip(a['attributes'],b['attributes'],strict=True):
            j.require(x['refId']==y['refId'],'O par não avaliou a mesma referência.')
            pairs.append({'refId':x['refId'],'optional':x['refId']==c['optionalId'],
                          'delta':x['score']-y['score'] if None not in (x['score'],y['score']) else None})
        known=[p['delta'] for p in pairs if p['delta'] is not None]
        matched.append({'caseId':c['caseId'],'attributes':pairs,
                        'observedMeanDelta':sum(known)/len(known) if known else None,
                        'fullMeanDelta':sum(known)/len(known) if known and len(known)==len(pairs) else None})
    means=[c['observedMeanDelta'] for c in matched if c['observedMeanDelta'] is not None]
    return {'arms':arms,'cases':matched,'effectDirection':'with minus without',
            'matchedCases':len(means),'observedCaseMacroDelta':sum(means)/len(means) if means else None,
            'fullCaseMacroDelta':sum(means)/len(means) if means and all(c['fullMeanDelta'] is not None for c in matched) else None}


def gallery_html(root, entries):
    blocks=[]
    for c in entries:
        p=j.expected_packet(c['caseId'])
        prefix='<section class="case"><h2>'+escape(p['context']['offer'])+'</h2>'+gallery.refs_html(p)
        figures=[]
        for arm in j.ARMS:
            item=c['arms'][arm]
            preview=''
            if item['judged']:
                preview='<img class="art" alt="Arte avaliada" src="'+gallery.thumb(root/'fixed-control/round-0'/item['path'])+'">'
            attr=next(a for a in item['attributes'] if a['refId']==c['optionalId'])
            lines=[escape(item['reason'])]
            if attr['score'] is not None:
                lines.append('Atributo opcional · '+str(attr['score'])+'/2 · '+escape(attr['evidence']))
            figures.append('<figure><strong>'+gallery.ARMS[arm]+'</strong>'+preview+'<figcaption>'+
                           '<br>'.join(lines)+'</figcaption></figure>')
        blocks.append(prefix+'<div class="pair">' + ''.join(figures)+'</div></section>')
    description=('Cada par usa o mesmo prompt. A coluna à direita retira a referência opcional. As notas vêm de duas avaliações cegas independentes.'
                 if any(c['arms']['with']['judged'] for c in entries)
                 else 'Os cinco casos ficaram sem pares de imagens verificadas. O motivo de cada abstenção aparece abaixo.')
    return ('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Controle de prompt fixo</title><style>'+gallery.STYLES+'</style><main><h1>Uma referência, o mesmo pedido</h1>'
            '<p>'+description+'</p>'
            +''.join(blocks)+'</main></html>')


def judge(root):
    out=root/'fixed-control/pixels'
    snapshot=j.read(out/'input-receipts.json')
    live=observations(root)
    # Other work may reserve J1/J2 slots while judges are running.
    j.require(snapshot['cases']==live['cases'] and snapshot['origin']==live['origin'] and snapshot['rateCard']==live['rateCard'],
              'Recibos ou preços mudaram desde o cegamento.')
    orig={c['caseId']:{**c,'attributeIds':[r['id'] for r in j.expected_packet(c['caseId'])['rubric']['references']]}
          for c in live['cases']}
    result={k:{**c,'arms':{}} for k,c in orig.items()}
    def grade(n):
        folder=out/f'group-{n}'
        index=j.read(folder/'index.json')
        return unblind(index,j.run_judge(folder,index),orig)
    with ThreadPoolExecutor(max_workers=2) as pool:
        for group in pool.map(grade,[1,2]):
            for case_id,arm,art in group:
                j.require(arm not in result[case_id]['arms'],'Braço duplicado.')
                result[case_id]['arms'][arm]=art
    entries=list(result.values())
    j.require(all(set(c['arms'])==set(j.ARMS) for c in entries),'Cobertura dos braços incompleta.')
    sessions=[j.read(file) for file in sorted(out.glob('group-*/judge-receipt.json'))]
    keep(out/'judgments.json',{'version':1,'origin':ORIGIN,'caseCount':len(entries),'judgeSessions':sessions,'cases':entries})
    keep(out/'summary.json',{'scope':'all',**stats(entries),'bySplit':{
        s:stats([c for c in entries if c['split']==s]) for s in ('dev','holdout')},
        'rateCard':live['rateCard'],'method':'one generation per arm and case; stochastic draws; image token estimates; human preference unknown'})
    keep(out/'summary-development.json',{'scope':'development',**stats([c for c in entries if c['split']=='dev'])})
    html=gallery_html(root,entries)
    if (out/'gallery.html').exists():
        j.require((out/'gallery.html').read_text()==html,'A galeria existente é diferente.')
    else:
        (out/'gallery.html').write_text(html)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('action',choices=['prepare','judge'])
    args=parser.parse_args()
    (prepare if args.action=='prepare' else judge)(args.root.resolve())

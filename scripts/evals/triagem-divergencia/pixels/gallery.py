"""Render the verified image pairs of rounds 0 and 5 as a local-only HTML review."""
import argparse
import base64
from html import escape
from io import BytesIO
import json
import os
from pathlib import Path
from urllib.parse import quote

from PIL import Image

import judge

ARMS = {'with':'Com a opcional','without':'Sem a opcional'}
REASONS = {
    'missing_ablation_receipt':'O par ainda não tem recibo de ablação concluído.',
    'missing_image_file':'O PNG do recibo está ausente.',
    'missing_image_receipt':'Falta o recibo da imagem.',
    'identical_after_triage':'A triagem já tinha retirado a opcional, por isso os braços seriam idênticos.',
    'held_before_dispatch':'A revisão reteve este lote antes da geração.',
    'plan_unavailable':'O planejamento terminou sem um plano aceito.',
    'round_missing':'A rodada ainda não tem registro.',
}
STYLES = """
:root{color-scheme:light;--ink:#142e31;--green:#16594b;--edge:#cbd8d1;--paper:#f7f8f3}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
main{max-width:1240px;margin:auto;padding:2.6rem clamp(1rem,4vw,3rem) 4rem}h1,h2,h3,p{margin:0 0 .6rem}
h1,h2{font-family:Georgia,serif;font-weight:500;letter-spacing:-.035em;line-height:1.12}h1{font-size:clamp(2.5rem,6vw,4.8rem)}h2{font-size:clamp(2rem,4vw,3rem)}
h3{font-size:1.32rem}a{color:var(--green)}nav,header,.case{border-bottom:1px solid var(--edge);padding-bottom:1.25rem;margin-bottom:1.8rem}
nav a{display:inline-block;margin:.6rem 1.2rem 0 0}details{margin:.8rem 0}summary{cursor:pointer;color:var(--green);font-weight:650}
.refs{display:flex;flex-wrap:wrap;gap:1rem}.ref{width:8rem;margin:0}.ref img{width:4rem;height:4rem;image-rendering:pixelated;object-fit:contain}
figcaption,.minor{font-size:.88rem}article{margin:2.1rem 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(.4rem,2vw,1.7rem)}
.pair figure{margin:0}.art{width:100%;height:auto;max-height:67vh;object-fit:contain;background:#eaece6;border:1px solid var(--edge)}
.pair strong{display:block;margin-bottom:.25rem}.route{margin:1.2rem 0 2rem}.route h4{font-size:1rem;margin:.6rem 0}
fieldset{border:1px solid var(--edge);min-width:0;margin:0;padding:1rem}legend{font-weight:650}label{display:block;cursor:pointer}
textarea{width:100%;max-width:36rem;min-height:4rem;font:inherit}button{display:inline-block;padding:.7rem 1.2rem;background:var(--green);color:white;border:0;border-radius:.35rem;font:inherit;cursor:pointer}
output{display:block;margin-top:.5rem} .state{border-left:3px solid var(--edge);padding:.45rem .8rem} :focus-visible{outline:3px solid #c45e28}
@media(max-width:540px){.pair.forms{grid-template-columns:1fr}.pair figcaption{font-size:.8rem}nav{margin-bottom:1.2rem}}
"""
SCRIPT = """
const button=document.querySelector('#download');
button.addEventListener('click',()=>{
 const choices=[];
 document.querySelectorAll('fieldset[data-case]').forEach(f=>{
   const pick=f.querySelector('input:checked');
   if(!pick)return;
   choices.push({caseId:f.dataset.case,round:Number(f.dataset.round),arm:f.dataset.arm,
     route:pick.value==='none'?null:Number(pick.value),decision:pick.value==='none'?'none':'chosen',
     reason:f.querySelector('textarea').value.trim()||null,
     threeOutputSha256:JSON.parse(f.dataset.hashes),threePromptSha256:JSON.parse(f.dataset.prompts)});
 });
 const msg=document.querySelector('output');
 if(!choices.length){msg.textContent='Selecione uma rota ou marque “Nenhuma” para incluir uma decisão.';return;}
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,source:'voluntary-local-review',choices},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='escolhas-de-rotas.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);msg.textContent=choices.length+' decisão(ões) no arquivo local.';
});
"""


def thumb(path):
    with Image.open(path) as image:
        rgb=image.convert('RGB')
        rgb.thumbnail((540,675),Image.Resampling.LANCZOS)
        data=BytesIO()
        rgb.save(data,format='JPEG',quality=86)
    return 'data:image/jpeg;base64,'+base64.b64encode(data.getvalue()).decode()


def refs_html(p):
    refs=[]
    for item,im in zip(p['rubric']['references'],p['referenceImages'],strict=True):
        label=escape(item['label'])
        optional=' · opcional do par' if item['id']==p['rubric']['optionalId'] else ''
        refs.append(f'<figure class="ref"><img alt="{label}" src="data:image/png;base64,{im["data"]}"><figcaption>{label}{optional}</figcaption></figure>')
    return f'<details><summary>Ver {len(refs)} referências selecionadas</summary><div class="refs">{"".join(refs)}</div></details>'


def choice(p, revision, arm, slots, prompts):
    name=f'{p["id"]}-{revision}-{arm}'
    radios=''.join(f'<label><input type="radio" name="{name}" value="{n}"> {v}</label>'
                   for n,v in [(1,'Rota 1'),(2,'Rota 2'),(3,'Rota 3'),('none','Nenhuma')])
    hashes=escape(json.dumps([s['sha256'] for s in slots]),quote=True)
    ph=escape(json.dumps(prompts),quote=True)
    return (f'<fieldset data-case="{escape(p["id"])}" data-round="{revision}" data-arm="{arm}" data-hashes="{hashes}" data-prompts="{ph}">'
            f'<legend>Minha escolha · {ARMS[arm]}</legend>{radios}<label>Motivo (opcional)<br><textarea maxlength="2000"></textarea></label></fieldset>')


def render_round(run, out, p, revision):
    folder=run/f'round-{revision}'
    title='Baseline' if revision==0 else 'Rodada 5'
    heading=f'<h3>{title}</h3>'
    if not (folder/'revision.json').is_file():
        return heading+'<p class="state">'+REASONS['round_missing']+'</p>',0
    slots=judge.load_case(folder,p)
    states={s['state'] for side in slots.values() for s in side if s['state']!='observed'}
    n=sum(s['state']=='observed' for side in slots.values() for s in side)
    notice='<p class="state">'+escape(' '.join(REASONS.get(s,s) for s in sorted(states)))+'</p>' if states else ''
    if not n:
        return heading+notice,0
    root=folder/p['id']
    ablation=judge.read(root/'ablation.json')
    plan=judge.read(root/'with'/'plan.json')['plan']
    by_pos={s['position']:s for s in plan['items']}
    pieces=[heading,notice]
    for pos in (1,2,3):
        prompt=by_pos[pos]['prompt']
        judge.require(judge.digest(prompt.encode())==ablation['prompts'][pos-1], 'Prompt diverge do recibo.')
        pieces.append(f'<div class="route"><h4>Rota {pos}</h4><div class="pair">')
        for arm,label in ARMS.items():
            slot=slots[arm][pos-1]
            if slot['state']!='observed':
                pieces.append(f'<figure><strong>{label}</strong><p>{escape(REASONS.get(slot["state"],slot["state"]))}</p></figure>')
                continue
            art=folder/slot['path']
            original=quote(os.path.relpath(art,out.parent),safe='/')
            label_image=f'{title}, rota {pos}, {label.lower()}'
            pieces.append(f'<figure><strong>{label}</strong><a href="{original}" target="_blank" rel="noopener" aria-label="Abrir PNG original: {label_image}">'
                          f'<img class="art" loading="lazy" alt="{label_image}" src="{thumb(art)}"></a>'
                          f'<figcaption><a href="{original}" target="_blank" rel="noopener">Abrir original</a> · SHA-256 <code>{slot["sha256"][:12]}</code></figcaption></figure>')
        pieces.append(f'</div><details><summary>Prompt comum desta rota</summary><p>{escape(prompt)}</p></details></div>')
    if n==6:
        pieces.append('<div class="pair forms">'+''.join(choice(p,revision,a,slots[a],ablation['prompts']) for a in ARMS)+'</div>')
    else:
        pieces.append('<p class="state">Escolha de rotas disponível quando os seis PNGs desta comparação estiverem conferidos.</p>')
    return ''.join(pieces),n


def generate(run, out):
    cases=[judge.expected_packet(c['id']) for c in judge.read(judge.DATA/'cases.json')]
    sections=[]
    count=0
    for p in cases:
        section=(f'<section class="case" id="{p["id"]}"><h2>{escape(p["context"]["offer"])}</h2>'
                 f'<p>{escape(p["context"]["idea"])} {escape(p["context"]["goal"])}</p>'+refs_html(p))
        for revision in (0,5):
            contents,n=render_round(run,out,p,revision)
            count+=n
            section+='<article>'+contents+'</article>'
        sections.append(section+'</section>')
    if count==0:
        return False
    nav=''.join(f'<a href="#{p["id"]}">{escape(p["context"]["offer"])}</a>' for p in cases)
    page=(f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
          f'<title>Comparação das propostas · Compor</title><style>{STYLES}</style></head><body><main>'
          f'<header><h1>Comparação das propostas</h1><p>Dentro de cada rodada, cada par usa o mesmo prompt. Só a presença da referência opcional muda entre os braços. '
          'Para avaliar a divergência, compare as rotas 1, 2 e 3 do mesmo braço. Cada rodada tem seu próprio plano.</p></header>'
          f'<nav aria-label="Casos">{nav}</nav>'+''.join(sections)+
          '<footer><p>As escolhas são voluntárias e ficam nesta página até fechá-la. Para guardá-las, baixe o arquivo.</p>'
          '<button id="download" type="button">Baixar minhas escolhas</button><output aria-live="polite"></output></footer>'
          f'</main><script>{SCRIPT}</script></body></html>')
    with out.open('x',encoding='utf-8') as handle:
        handle.write(page)
    return True


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('run',type=Path)
    cli.add_argument('html',type=Path)
    args=cli.parse_args()
    if generate(args.run.resolve(),args.html.resolve()):
        print(args.html)
    else:
        print('Ainda não há PNG reconciliado de uma ablação da baseline ou da rodada 5.')

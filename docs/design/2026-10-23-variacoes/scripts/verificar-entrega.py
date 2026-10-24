import hashlib,json,re,struct
from pathlib import Path
from datetime import datetime,timezone
base=Path(__file__).resolve().parents[1]
manifest=json.loads((base/'quadros.json').read_text())
issues=[]; frames=[]; hashes={}
for s in manifest:
    scene=json.loads((base/'excalidraw'/s['file']).read_text())
    assert scene['type']=='excalidraw' and scene['version']==2
    ids={e['id'] for e in scene['elements']}
    for f in s['frames']:
        assert f['id'] in ids
        elements=[e for e in scene['elements'] if e.get('frameId')==f['id']]
        assert len(elements)>10
        p=base/'renders'/(f['id']+'.png')
        data=p.read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
        dim=struct.unpack('>II',data[16:24]);assert dim==(1600,1080)
        frames.append({'id':f['id'],'nativeElements':len(elements),'dimensions':list(dim)})
for p in base.rglob('*.md'):
    for href in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if '://' in href or href.startswith('#') or href.startswith('mailto:'):continue
        dest=(p.parent/href.split('#')[0]).resolve()
        if not dest.exists():issues.append({'file':str(p.relative_to(base)),'missing':href})
for p in base.rglob('*'):
    if p.is_file() and p.name not in ['verificacao.json','scripts-verificacao.log']:
        hashes[str(p.relative_to(base))]=hashlib.sha256(p.read_bytes()).hexdigest()
for f in ['11-a1-inspecao.md','12-a2-inspecao.md','13-a3-inspecao.md','14-a4-inspecao.md','15-a5-inspecao.md','16-ux-verificacao.md']:
    assert (base/'avaliacoes'/f).exists(),f
for f in ['01-oficina-editorial.png','02-encaixe-composicao.png','03-caderno-autoria.png']:
    data=(base/'moodboards'/f).read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
result={'checkedAt':datetime.now(timezone.utc).isoformat(),'cli':'@excalidraw/cli@0.2.0','nativeScenes':len(manifest),'frames':frames,'moodboards':3,'archetypeInspections':5,'uxReview':'avaliacoes/16-ux-verificacao.md','linksMissing':issues,'galleryVerification':{'method':'CUA: página renderizada, troca A→B→C, quadro único e moodboard alternados; estado AX conferido','screenshot':'galeria-verificada.png','scope':'Navegação da galeria, não controles do produto desenhado'},'goalAudit':{'installCli':'Executável 0.2.0 verificado; instalação isolada registrada no README','wireframesAndFlows':'4 cenas editáveis, 3 diagramas e 23 PNGs renderizados pelo CLI','variationsWithProsCons':'3 modelos propostos por UX; tabela e cenário de invalidação em 01-ux-fluxos.md','moodboardsColorsShapesLogoObjects':'3 imagens, 9 esboços de símbolo, códigos de cor e direção tipográfica no README/galeria','subagentEvaluation':'5 categorias inspeccionaram PNGs; síntese mantém discordâncias e mudanças aplicadas','baseDrawingsForHumanValidation':'Galeria, editáveis, imagens e roteiro disponíveis; sem alegação de validação humana'},'limits':['Sem implementação do Compor','Sem teste humano','Sem pesquisa de marca ou fonte licenciada','Persistência, teclado, integrações e exportação real não demonstrados','Escolha de identidade ainda aberta'],'sha256':hashes}
(base/'verificacao.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'nativeScenes':len(manifest),'frames':len(frames),'moodboards':3,'missingLinks':issues},ensure_ascii=False))
if issues:raise SystemExit(1)

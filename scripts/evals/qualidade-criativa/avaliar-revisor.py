"""Run the captured image reviewer instructions on synthetic controls using Codex."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import random
import subprocess

from executar import DATASET, ENV, HERE, ROOT, codex, digest, read, write

CONTROL_DECISIONS = {
    'feira-conceito-especifico': ('approve', None),
    'feira-polida-mas-generica': ('reject', 'generic_direction'),
    'feira-data-contaminada': ('reject', 'required_text'),
    'feira-pote-fundido': ('reject', 'visual_integrity'),
}
RESERVE = [
    ('linha-papel-escuro', 'reserva-linha-secreta-candidata-r3', 'reserva-linha-secreta-candidata-r3',
     'd81d48ec2918443b980e983af16723cddfb7583737f2a2135f991339d126d0a6',
     '4d88783a7105aa51d563b82e780a9a24808419807a40e12692883e0509a153fd', 'approve', None),
    ('linha-sem-juncao', 'reserva-linha-secreta-base-r2', 'reserva-linha-secreta-candidata-r3',
     'e01320b39ee9f918ae91d8e56af219bd32e0ba4b9ca0b03870eb4b9a3cfbc63c',
     '4d88783a7105aa51d563b82e780a9a24808419807a40e12692883e0509a153fd', 'reject', 'factual_fidelity'),
    ('sombra-xerox-surreal', 'reserva-sombra-de-bolso-candidata-r2', 'reserva-sombra-de-bolso-candidata-r2',
     'e292f36da259a9bcf554f080c2476c0883b3f9b5748f6bc57603c26f26f3cbb7',
     '85d4caaf045ca14de0595ee3034c9a63afabb3e51d2e6b9756f7f11370e6232c', 'approve', None),
    ('bordado-textura-tatil', 'reserva-bordado-no-pano-candidata-r2', 'reserva-bordado-no-pano-candidata-r2',
     '0040de0ac64eb2a809409bc00b7c96f69aa8e16ce58116a21deb54cadc2ed2bf',
     '699e7a73830034c2f22a504fbe3f0db80857e108bd4495b55b30ce5f9eeaafd8', 'approve', None),
]


def controls():
    dataset = read(DATASET)
    indexed = {row['id']: row for row in dataset['controls']}
    positive = indexed['feira-conceito-especifico']
    case = next(row for row in dataset['cases'] if row['id'] == positive['caseId'])
    if case['provenance']['kind'] != 'synthetic':
        raise ValueError('O replay do revisor aceita somente controles sintéticos')
    root = HERE / 'fixtures'
    selected = []
    for id_, (decision, code) in CONTROL_DECISIONS.items():
        row = indexed[id_]
        relative = row['artifact']['image']
        image = (ROOT / relative).resolve(strict=True)
        if row['caseId'] != case['id'] or image.parent != root or digest(image) != dataset['assetSha256'][relative]:
            raise ValueError('Controle sintético diferente do arquivo congelado')
        selected.append((id_, image, decision, code))
    return positive['artifact']['imagePrompt'], selected


def reserved_controls(root):
    root = root.resolve(strict=True)
    selected, requested = [], {}
    for id_, image_dir, prompt_dir, image_sha, prompt_sha, decision, code in RESERVE:
        image = (root / image_dir / 'image.png').resolve(strict=True)
        prompt_file = (root / prompt_dir / 'image-prompt-effective.txt').resolve(strict=True)
        if not image.is_relative_to(root) or not prompt_file.is_relative_to(root) or digest(image) != image_sha:
            raise ValueError('Pixels da reserva diferentes do original sintético')
        prompt = prompt_file.read_text(encoding='utf-8').strip()
        if hashlib.sha256(prompt.encode()).hexdigest() != prompt_sha:
            raise ValueError('Prompt da reserva diferente do original sintético')
        selected.append((id_, image, decision, code))
        requested[id_] = prompt
    return selected, requested


def review(directory, policy, request, file):
    framed = policy['instructions'] + '\n\nDados do pedido e PNG anexo:\n' + json.dumps(
        request, ensure_ascii=False, separators=(',', ':'))
    schema = policy['text']['format']['schema']
    return codex(directory, policy['model'], policy['reasoning']['effort'], framed, [file], schema)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--calibrado', action='store_true', help='Especifica o friso permitido e testa datas aprovadas')
    mode.add_argument('--reservas', type=Path, help='Raiz dos quatro PNGs sintéticos de trabalhos anteriores')
    args = parser.parse_args()
    auth = subprocess.run(['codex', 'login', 'status'], env=ENV, text=True, capture_output=True, timeout=20)
    if auth.returncode or 'Logged in using ChatGPT' not in auth.stdout + auth.stderr:
        parser.error('A execução requer autenticação via ChatGPT')
    prompt, selected = controls()
    requested = {}
    if args.reservas:
        selected, requested = reserved_controls(args.reservas)
    if args.calibrado:
        target = 'Sem outro texto, rótulo, faixas ou marcas.'
        if prompt.count(target) != 1:
            raise ValueError('O esclarecimento deve partir do pedido congelado')
        prompt = prompt.replace(target, 'Sem outro texto, rótulos, marcas ou faixas decorativas separadas do pote. '
                                       'O friso horizontal fino na tampa é parte da ilustração.')
    approved_text = {}
    if args.calibrado:
        positive = selected[0][1]
        approved_text = {
            'data-aprovada-coincide': ['Feira de compotas', '14 de agosto'],
            'data-aprovada-conflita': ['Feira de compotas', '15 de agosto'],
        }
        selected.extend([
            ('data-aprovada-coincide', positive, 'approve', None),
            ('data-aprovada-conflita', positive, 'reject', 'required_text'),
        ])
    policy = json.loads(subprocess.check_output(
        ['node', HERE / 'reexecutar-revisor-offline.mjs', '--politica'], text=True, timeout=20,
    ))
    root = args.output.resolve()
    root.mkdir()
    write(root / 'politica.json', policy)
    random.Random(18072026).shuffle(selected)
    jobs = []
    for index, (id_, source, decision, code) in enumerate(selected, 1):
        name = f'item-{index:02}'
        files = root / 'inputs' / name
        files.mkdir(parents=True)
        image = files / 'peca.png'
        image.write_bytes(source.read_bytes())
        request = {'pedido': requested.get(id_, prompt)}
        if id_ in approved_text:
            request['textosLiteraisAprovados'] = approved_text[id_]
        jobs.append((name, image, request, {'id': id_, 'sha256': digest(image), 'expected': decision, 'expectedFinding': code}))
    write(root / 'gabarito.json', {name: labels for name, _, _, labels in jobs})
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(review, root / name, policy, request, image) for name, image, request, _ in jobs]
        verdicts = [future.result() for future in futures]
    validated = json.loads(subprocess.check_output(
        ['node', HERE / 'reexecutar-revisor-offline.mjs', '--respostas'],
        input=json.dumps(verdicts, ensure_ascii=False), text=True, timeout=20,
    ))
    rows = []
    for (name, _, _, labels), verdict, outcome in zip(jobs, verdicts, validated, strict=True):
        codes = {finding['code'] for finding in verdict['findings']}
        finding_ok = not codes if labels['expectedFinding'] is None else labels['expectedFinding'] in codes
        expected_status = 200 if labels['expected'] == 'approve' else 422
        rows.append({
            **labels, 'decision': verdict['decision'], 'findings': verdict['findings'], 'checks': verdict['checks'],
            'status': outcome['status'], 'match': outcome['status'] == expected_status and finding_ok,
            'receipt': read(root / name / 'receipt.json'),
        })
    write(root / 'resultado.json', {'mode': 'codex_proxy', 'policyFileSha256': digest(root / 'politica.json'), 'rows': rows})
    print(f"{sum(row['match'] for row in rows)}/{len(rows)} decisões e evidências esperadas no replay Codex")


if __name__ == '__main__':
    main()

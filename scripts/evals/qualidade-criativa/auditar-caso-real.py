"""Confere localmente um caso autorizado e o julgamento já realizado, sem conexão externa."""
import argparse
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory

from PIL import Image, ImageChops

from executar import HERE, RUBRIC, digest, packet, read, read_judge_answer, validate


def check(condition, message):
    if not condition:
        raise ValueError(message)


def local_path(package, value, recorded_root=None):
    path = Path(value)
    if path.is_absolute() and recorded_root is not None:
        path = path.relative_to(recorded_root)
    resolved = (package / path).resolve(strict=True)
    check(resolved.is_relative_to(package), 'Arquivo fora do pacote privado')
    return resolved


def review_inventory(dataset, evidence, package, recorded_root):
    cases = {case['id']: case for case in dataset['cases']}
    expected = [
        {'case': control['caseId'], 'name': control['id'], 'artifact': control['artifact']}
        for control in dataset['controls']
    ]
    check(evidence == expected, 'Artefatos divergem dos controles congelados')
    check(len(cases) == len(dataset['cases']) and len(cases) == 1
          and all(case['partition'] == 'development' and case['humanFeedback'] is None
                  and case['provenance']['kind'] == 'creator-approved-case' for case in cases.values()),
          'Use o pacote local de um caso real autorizado, separado da reserva e dos autorrelatos')
    series = {}
    seen = set()
    for row in evidence:
        case, name = row['case'], row['name']
        check(case in cases and (case, name) not in seen, 'Inventário privado inválido')
        seen.add((case, name))
        artifact = dict(row['artifact'])
        artifact['image'] = str(local_path(package, artifact['image'], recorded_root))
        series.setdefault(case, []).append((name, artifact))
    return cases, series


def same_pixels(first, second):
    with Image.open(first) as a, Image.open(second) as b:
        return (a.format == b.format == 'PNG' and a.size == b.size
                and ImageChops.difference(a.convert('RGB'), b.convert('RGB')).getbbox() is None)


def verify_order(order, report, package, run, cases, series, seed, approved_sha):
    reverse = order == 'BA'
    session = local_path(package, run / f'development-{int(reverse)}')
    receipt = read(local_path(package, session / 'receipt.json'))
    prompt = local_path(package, session / 'prompt.txt')
    answer = local_path(package, session / 'answer.json')
    check(report['partition'] == 'development' and report['receipt'] == receipt and receipt['tools'] == 0,
          'O relatório diverge do recibo cego')
    check(receipt['promptSha256'] == digest(prompt) and receipt['answerSha256'] == digest(answer),
          'Pedido ou resposta do juiz mudou desde a coleta')

    with TemporaryDirectory(prefix='compor-auditoria-') as temporary:
        rows, inventory, decoding, attachments = packet(
            Path(temporary) / 'ordem', cases, series, reverse, 'development', seed,
        )
        raw_packet = prompt.read_text(encoding='utf-8').split('\n\nDADOS:\n', 1)
        check(len(raw_packet) == 2 and json.loads(raw_packet[1]) == rows, 'Entrada cega divergente')
        check({path.name for path in attachments} == receipt['attachments'].keys(),
              'Inventário de anexos diverge do recibo')
        for attachment in attachments:
            frozen = local_path(package, session / attachment.name)
            check(receipt['attachments'][attachment.name] == digest(frozen) and same_pixels(attachment, frozen),
                  'Imagem ou prévia do pacote cego alterada')
        judged = read_judge_answer(answer)['rows']
        validate(judged, inventory)
        decoded = [{**decoding[row['id']], **{key: value for key, value in row.items() if key != 'id'}}
                   for row in judged]
        check(report['rows'] == decoded, 'Os pareceres decodificados divergem da resposta original')
        matches = [row for row in decoded if row['imageSha256'] == approved_sha]
        check(len(matches) == 1, 'Referência aprovada ausente ou repetida no julgamento')
        reference = matches[0]
        return {
            'reviewed': len(decoded),
            'referenceDisposition': reference['disposition'],
            'referenceScores': {stage: reference[stage]['score'] for stage in ('briefing', 'image', 'post')},
        }


def audit(dataset_path, reference_path, run, recorded_root=None):
    dataset_path = dataset_path.resolve(strict=True)
    package = dataset_path.parent
    reference_path = local_path(package, reference_path)
    run = local_path(package, run)
    dataset = read(dataset_path)
    check(dataset['version'] == 1 and bool(dataset.get('privacy')), 'Dataset privado incompatível')
    artifacts = local_path(package, run.parent / 'controls.json')
    seed = digest(dataset_path)
    check(read(local_path(package, run / 'manifest.json')) == {
        'datasetSha256': seed, 'rubricSha256': digest(RUBRIC), 'artifactsSha256': digest(artifacts),
    }, 'Dataset, rubrica ou artes divergentes do manifesto da execução')
    cases, series = review_inventory(dataset, read(artifacts), package, recorded_root)
    reference = runpy.run_path(str(HERE / 'verificar-referencia.py'))['verify'](reference_path)
    record = read(reference_path)
    matches = [
        artifact for arms in series.values() for _, artifact in arms
        if digest(Path(artifact['image'])) == reference['imageSha256']
    ]
    check(len(matches) == 1, 'A referência visual deve identificar uma única entrega')
    for field, role in (('briefing', 'briefing'), ('caption', 'caption'), ('imagePrompt', 'prompt')):
        text = local_path(reference_path.parent, record[role]['path']).read_text(encoding='utf-8')
        check(text.removesuffix('\n') == matches[0][field].removesuffix('\n'),
              'O briefing, a legenda ou o prompt do julgamento diverge da versão aprovada')
    reports = read(local_path(package, run / 'judgments.json'))
    check(sorted(report['order'] for report in reports) == ['AB', 'BA'], 'São necessárias as duas ordens cegas')
    verified = {
        report['order']: verify_order(report['order'], report, package, run, cases, series, seed,
                                      reference['imageSha256'])
        for report in reports
    }
    return {
        'cases': len(cases),
        'reviewedOrders': verified,
        'visualApproved': reference['visualApproved'],
        'approvedImageSha256': reference['imageSha256'],
        'human': {key: reference[key] for key in ('excitement', 'specificity', 'favorable')},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path)
    parser.add_argument('reference', type=Path, help='Manifesto da referência dentro do pacote do dataset')
    parser.add_argument('run', type=Path, help='Pasta run do julgamento dentro do pacote')
    parser.add_argument('--recorded-root', type=Path,
                        help='Raiz original indicada nos caminhos absolutos, para um pacote movido')
    args = parser.parse_args()
    if args.recorded_root and not args.recorded_root.is_absolute():
        parser.error('--recorded-root exige a raiz absoluta registrada')
    print(json.dumps(audit(args.dataset, args.reference, args.run, args.recorded_root), ensure_ascii=False, indent=2))

"""Release held visual judgments only after the four fixed rounds are complete."""

import argparse
import os
import tempfile
from pathlib import Path

from judge import DIMENSIONS, json_file, write_once


def cell(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def save_report(path, lines):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', prefix='.' + path.name, dir=path.parent) as pending:
        pending.write('\n'.join(lines) + '\n')
        pending.flush()
        os.fsync(pending.fileno())
        os.link(pending.name, path)


def render(rounds):
    lines = [
        '# Marco 5. Julgamento independente da arte', '',
        'Pontuação de 0 a 2 em gancho, leitura a 360 px e adequação ao objetivo. Uma arte conta como pronta no proxy se recebe três notas 2 e preserva os fatos. O estudo avaliou tarefas sintéticas com um único juiz Codex por rodada. O resultado se limita à arte. Legenda, versão, publicação e aceitação humana ficam fora da avaliação.', '',
        '| Rodada | Grupo | Casos | Artes avaliadas | Sem pixels | Prontas no proxy | Com falha crítica |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ]
    for run in rounds:
        for split, summary in run['grupos'].items():
            values = [run['round'], split, *[summary[key] for key in ('casos', 'disponiveis', 'semPixels', 'prontasNoProxy', 'comFalhaCritica')]]
            lines.append('| ' + ' | '.join(map(str, values)) + ' |')
    baseline = rounds[0]['grupos']['reserva']
    final = rounds[-1]['grupos']['reserva']
    if baseline['semPixels'] or final['semPixels']:
        summary = 'A comparação de reserva entre a primeira e a última rodada ficou incompleta por falta de pixels.'
    elif final['prontasNoProxy'] > baseline['prontasNoProxy'] and final['comFalhaCritica'] <= baseline['comFalhaCritica']:
        summary = 'O grupo reservado melhorou no proxy entre a primeira e a última rodada, sem aumento de erros críticos.'
    else:
        summary = 'O grupo reservado deixou de demonstrar o ganho exigido entre a primeira e a última rodada.'
    lines.extend(['', summary + ' A comparação envolve apenas dois casos reservados.', ''])
    if any(group['semPixels'] for run in rounds for group in run['grupos'].values()):
        lines.extend(['A ausência de pixels é uma falha de cobertura da geração. A sessão independente se absteve de pontuar os slots faltantes.', ''])
    for run in rounds:
        lines.extend([f"## Rodada {run['round']}", '', f"Revisão `{run['revision']}` · juiz `{run['judge']['model']}` · sessão `{run['judge']['thread']}`", ''])
        for split, cases in run['casos'].items():
            lines.extend([f'### Grupo de {split}', ''])
            for case in cases:
                result = 'Sem avaliação visual.'
                if any(art['status'] == 'avaliada' for art in case['artes']):
                    result = f"{case['resumo']['prontasNoProxy']} de três artes prontas."
                lines.extend([f"#### {case['id']}", '', f"{result} {case['diagnostico']}", '', '| Arte | Gancho | Leitura | Adequação | Fidelidade factual |', '| --- | --- | --- | --- | --- |'])
                for art in case['artes']:
                    if art['status'] == 'sem_pixels':
                        lines.append(f"| {art['slot']} | — | — | — | Sem pixels |")
                        continue
                    scores = [f"{art['dimensoes'][dim]['nota']} · {cell(art['dimensoes'][dim]['evidencia'])}" for dim in DIMENSIONS]
                    lines.append(f"| {art['slot']} | " + ' | '.join(scores) + f" | {art['fidelidadeFactual']} |")
                lines.append('')
                if interruption := case.get('interrupcao'):
                    lines.extend([f"A execução registrou `{interruption['state']}` em `{interruption['stage']}`. Situação dos slots `{interruption['slots']}`.", ''])
                for art in case['artes']:
                    for fact in art.get('fatos', []):
                        lines.append(f"- Arte {art['slot']} · {fact['fato']} · {fact['estado']}. {fact['evidencia']}")
                    for failure in art.get('falhasCriticas', []):
                        lines.append(f"- Arte {art['slot']} · falha crítica ({failure['tipo']}) · {failure['trecho']}. {failure['justificativa']}")
                lines.append('')
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, help='diretório privado da bancada')
    args = parser.parse_args()
    root = args.root.resolve()
    rounds = []
    for index in range(4):
        folder = root / f'round-{index}'
        complete = json_file(folder / 'complete.json')
        published = json_file(folder / 'judge-5.json')
        held = json_file(root / 'juiz-visual-retido' / f'round-{index}.json')
        if not (complete['round'] == held['round'] == published['round'] == index and complete['revision'] == held['revision'] == published['revision'] and held['judge'] == published['judge'] and published['casos'] == held['casos']['desenvolvimento'] and len(held['casos']['reserva']) == 2):
            raise ValueError('registro da rodada não corresponde ao julgamento visual retido')
        rounds.append(held)
    if any((run['rubricaSha256'], run['fixtureSha256']) != (rounds[0]['rubricaSha256'], rounds[0]['fixtureSha256']) for run in rounds):
        raise ValueError('rubrica e casos devem permanecer fixos nas quatro rodadas')
    write_once(root / 'juiz-visual-quatro-rodadas.json', {'rodadas': rounds})
    save_report(root / 'juiz-visual-quatro-rodadas.md', render(rounds))


if __name__ == '__main__':
    main()

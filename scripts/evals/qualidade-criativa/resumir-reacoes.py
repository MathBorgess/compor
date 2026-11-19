"""Resume somente autorrelatos associados à versão efetivamente exibida."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path


QUESTIONS = ('excitement', 'specificity')
ABSTENTIONS = ('unsure', 'declined')
ARMS = ('base', 'candidata')


def valid_answer(answer):
    return answer is None or answer in ABSTENTIONS or (type(answer) is int and 1 <= answer <= 5)


def summarize(rows):
    arms = {name: [] for name in ARMS}
    pairs = defaultdict(set)
    seen = set()
    for row in rows:
        key = (row['pair'], row['arm'])
        if (not isinstance(row['pair'], str) or not row['pair'].strip() or row['arm'] not in ARMS
                or key in seen or not isinstance(row['version'], str) or not row['version'].strip()):
            raise ValueError('Cada pessoa e pedido exige uma versão identificada por braço')
        seen.add(key)
        shown = row['shown']
        answers = [row[q] for q in QUESTIONS]
        if type(shown) is not bool or not all(valid_answer(x) for x in answers) or (
                not shown and any(x is not None for x in answers)):
            raise ValueError('Respostas exigem exposição à versão e valores previstos')
        if shown and all(type(x) is int for x in answers):
            pairs[row['pair']].add(row['arm'])
        arms[row['arm']].append(row)

    summary = {}
    for arm, group in sorted(arms.items()):
        exposed = [row for row in group if row['shown']]
        complete = [row for row in exposed if all(type(row[q]) is int for q in QUESTIONS)]
        favorable = sum(all(row[q] >= 4 for q in QUESTIONS) for row in complete)
        result = {'eligible': len(group), 'shown': len(exposed), 'complete': len(complete),
                  'favorable': favorable, 'rate': favorable / len(complete) if complete else None}
        for question in QUESTIONS:
            counts = Counter(row[question] for row in exposed)
            result[question] = {
                'distribution': {str(score): counts[score] for score in range(1, 6)},
                'answered': sum(counts[score] for score in range(1, 6)),
                'favorable': counts[4] + counts[5],
                'unsure': counts['unsure'], 'declined': counts['declined'],
                'missing': counts[None],
            }
        summary[arm] = result
    return {'arms': summary, 'completePairs': sum(len(answered) == len(ARMS) for answered in pairs.values())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('responses', type=Path)
    args = parser.parse_args()
    print(json.dumps(summarize(json.loads(args.responses.read_text(encoding='utf-8'))), ensure_ascii=False, indent=2))

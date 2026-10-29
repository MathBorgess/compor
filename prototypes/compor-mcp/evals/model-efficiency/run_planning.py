#!/usr/bin/env python3
"""Run an explicit contiguous slice of the frozen schedule, sequentially to T3."""
import argparse
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--first', type=int, required=True)
    parser.add_argument('--last', type=int, required=True)
    parser.add_argument('--schedule', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    schedule = json.loads((args.schedule or root / 'schedule.json').read_text())
    selected = [r for r in schedule if args.first <= r['order'] <= args.last]
    if not selected or len(selected) != args.last - args.first + 1:
        parser.error('Orders must describe a nonempty contiguous part of schedule.json')
    for row in selected:
        if (root / 'runs' / row['run_id']).exists():
            parser.error('Refusing to overwrite or silently skip: ' + row['run_id'])
    for row in selected:
        print(json.dumps({'starting_order': row['order'], 'run_id': row['run_id']}), flush=True)
        command = [sys.executable, str(root / 'runtime/runner.py'), '--model', row['model'],
                   '--effort', row['effort'], '--guidance', row['guidance'],
                   '--case-json', str(root / 'inputs' / (row['case_id'] + '.json')),
                   '--run-dir', str(root / 'runs' / row['run_id']), '--through-turn', '3']
        outcome = subprocess.run(command)
        if outcome.returncode:
            print(json.dumps({'stopped_on_failure': row['run_id'], 'exit_code': outcome.returncode}), flush=True)
            return outcome.returncode
    return 0


if __name__ == '__main__':
    sys.exit(main())

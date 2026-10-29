#!/usr/bin/env python3
"""Execute T4/render/T5/render for explicit already-prepared runs, sequentially."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--first', type=int, required=True)
parser.add_argument('--last', type=int, required=True)
parser.add_argument('--schedule', type=Path)
args = parser.parse_args()
base = Path(__file__).resolve().parent
rows = [r for r in json.loads((args.schedule or base / 'schedule.json').read_text()) if args.first <= r['order'] <= args.last]
if not rows or len(rows) != args.last - args.first + 1:
    parser.error('Invalid explicit schedule slice')
for row in rows:
    run = base / 'runs' / row['run_id']
    if not (run / 'resume-after-t3.json').is_file() or (run / 'turn-04.json').exists():
        parser.error('Run not ready or already submitted: ' + row['run_id'])
exit_status = 0
for row in rows:
    run = base / 'runs' / row['run_id']
    manifest = json.loads((run / 'manifest.json').read_text())
    # Keep the MCP process command exactly as frozen in the first invocation.
    # The compositor may require a different Python installation with Pillow.
    runner_python = manifest['configuration']['mcp_servers.compor_benchmark.command']
    for turn in (4, 5):
        source = run / f'resume-after-t{turn - 1}.json'
        print(json.dumps({'run': row['run_id'], 'starting_turn': turn}), flush=True)
        result = subprocess.run([runner_python, str(base / 'runtime/runner.py'),
                    '--model', row['model'], '--effort', row['effort'], '--guidance', row['guidance'],
                    '--case-json', str(source), '--run-dir', str(run),
                    '--resume-run', '--through-turn', str(turn)])
        if result.returncode:
            exit_status = 1
            print(json.dumps({'run': row['run_id'], 'stage_failed': f'model_t{turn}'}), flush=True)
            break
        result = subprocess.run([sys.executable, str(base / 'advance.py'), '--run', str(run),
                    '--turn', str(turn), '--source-case', str(source), '--assets', str(run / 'assets.json')])
        if result.returncode:
            exit_status = 1
            print(json.dumps({'run': row['run_id'], 'stage_failed': f'artifacts_t{turn}'}), flush=True)
            break

sys.exit(exit_status)

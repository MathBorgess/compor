"""Run an approved six-condition study, resuming the same local evidence ledger."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parents[1]

def run(root, start):
    import json
    protocol=json.loads((root/'protocol.json').read_bytes())
    if start not in range(6):
        raise ValueError('Invalid start round')
    # Only the paid subprocesses receive the key via a private pipe. Judges inherit no provider credentials.
    if sys.platform=='darwin' and sys.stdin.isatty():
        secret=subprocess.check_output(['/usr/bin/pbpaste']).strip()
    else:
        secret=sys.stdin.buffer.readline(512).strip()
    import re
    if not re.fullmatch(rb'sk-[A-Za-z0-9_-]{20,300}',secret):
        raise ValueError('Missing key on authorized input')
    clean={k:os.environ[k] for k in ['HOME','PATH','USER','LOGNAME','TMPDIR','LANG','SHELL'] if k in os.environ}
    clean['PYTHONDONTWRITEBYTECODE']='1'
    def node(file,*args,paid=False):
        env=dict(clean)
        if paid:
            env['COMPOR_EVAL_KEY_STDIN']='1'
        subprocess.run(['node',str(HERE/file),*map(str,args)],cwd=HERE,env=env,input=secret if paid else b'',check=True)
    def python(file,*args):
        subprocess.run([sys.executable,'-B',str(HERE/file),*map(str,args)],cwd=HERE,env=clean,stdin=subprocess.DEVNULL,check=True)
    for r in range(start,6):
        if r:
            python('runner/refine.py',root,r)
        node('runner/round.mjs','plans',root,r,paid=True)
        node('plan-judge/round.mjs',root,r)
        if r in protocol['pixelRounds']:
            node('runner/round.mjs','pixels',root,r,paid=True)
            out=root/f'round-{r}'/'pixels'
            if not (out/'blind-index.json').exists() and not out.exists():
                python('pixels/judge.py','prepare',root,r,out)
            python('pixels/judge.py','judge',out)
        print(f'Condition {r} complete',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('--start',type=int,default=0,choices=range(6))
    args=parser.parse_args()
    run(args.root.resolve(),args.start)

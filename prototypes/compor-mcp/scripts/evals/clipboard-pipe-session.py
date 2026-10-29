#!/usr/bin/env python3
"""Start the synthetic MCP harness with its API credential only in an inherited pipe."""
import os
import subprocess
import sys
import tempfile

p = subprocess.run(['pbpaste'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
secret = p.stdout.strip()
if not secret.startswith(b'sk-') or len(secret) < 30:
    raise SystemExit('Chave indisponível no clipboard')
root = tempfile.mkdtemp(prefix='compor-persona-profile-')
os.chmod(root, 0o700)
r, w = os.pipe()
os.write(w, secret)
os.close(w)
env = dict(os.environ)
env.pop('OPENAI_API_KEY', None)
env['COMPOR_API_KEY_FD'] = str(r)
proc = subprocess.Popen(['node', 'scripts/evals/decision-mcp-session.mjs', root], env=env, pass_fds=(r,))
os.close(r)
sys.exit(proc.wait())

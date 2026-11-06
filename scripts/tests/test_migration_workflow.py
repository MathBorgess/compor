#!/usr/bin/env python3
"""Test the draft workflow without a network or real credentials (requires PyYAML)."""
from pathlib import Path
import os, shutil, subprocess, tempfile, yaml
root=Path(__file__).resolve().parents[2]
doc=yaml.load((root/'.github/workflows/supabase-migrations.yml').read_text(),Loader=yaml.BaseLoader)
assert set(doc['on'])=={'push','workflow_dispatch'} and doc['on']['push']['branches']==['main']
assert doc['concurrency']['cancel-in-progress']=='false' and doc['concurrency']['queue']=='max'
pre=doc['jobs']['preflight']['steps'][0]['run']; migrate=doc['jobs']['migrate']['steps'][-1]['run']
subprocess.run(['bash','-n'],input=pre,text=True,check=True);subprocess.run(['bash','-n'],input=migrate,text=True,check=True)
sha_guard=doc['jobs']['migrate']['steps'][1]['run']
sha=subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
assert subprocess.run(['bash','-e','-c',sha_guard],cwd=root,env={**os.environ,'GITHUB_SHA':sha},capture_output=True).returncode == 0
assert subprocess.run(['bash','-e','-c',sha_guard],cwd=root,env={**os.environ,'GITHUB_SHA':'0'*40},capture_output=True).returncode != 0
with tempfile.TemporaryDirectory() as tmp:
 d=Path(tmp); (d/'bin').mkdir();log=d/'log'
 psql=d/'bin'/'psql';psql.write_text('''#!/usr/bin/env python3
import os,sys
assert os.environ['PGPASSWORD']=='synthetic-secret'
assert os.environ['PGSSLMODE']=='verify-full'
assert os.environ['PGUSER'] in ['postgres','postgres.abcdefghijklmnopqrst']
assert os.environ['PGDATABASE']=='postgres' and os.environ['PGPORT']=='5432'
assert 'PGHOSTADDR' not in os.environ
assert all('synthetic-secret' not in s for s in sys.argv)
with open(os.environ['FAKE_LOG'],'a') as f:f.write(('acquire' if 'acquire' in sys.argv[-1] else 'release')+'\\n')
''');psql.chmod(0o755)
 cli=d/'bin'/'supabase';cli.write_text('''#!/usr/bin/env python3
import os,sys,pathlib
assert os.environ['PGPASSWORD']=='synthetic-secret' and os.environ['PGSSLMODE']=='verify-full'
assert not any(k.startswith('SUPABASE_') for k in os.environ)
assert os.environ['HOME'].startswith(os.environ['RUNNER_TEMP'])
assert os.environ['XDG_CONFIG_HOME'].startswith(os.environ['HOME'])
assert 'PGHOSTADDR' not in os.environ
assert all('synthetic-secret' not in s for s in sys.argv)
assert sys.argv[1:3]==['db','push'] and '--skip-vault' in sys.argv
assert pathlib.Path('supabase/config.toml').exists() and not pathlib.Path('supabase/.env').exists()
with open(os.environ['FAKE_LOG'],'a') as f:f.write('cli\\n')
sys.exit(int(os.environ.get('FAIL_CLI','0')))
''');cli.chmod(0o755)
 env=os.environ.copy();env.update(PATH=str(d/'bin')+':'+env['PATH'],RUNNER_TEMP=tmp,FAKE_LOG=str(log),GITHUB_WORKSPACE=str(root),GITHUB_RUN_ID='101',GITHUB_RUN_ATTEMPT='1',SUPABASE_DB_PASSWORD='synthetic-secret',SUPABASE_PROJECT_REF='abcdefghijklmnopqrst',VERIFIED_PROJECT_REF='abcdefghijklmnopqrst',SUPABASE_DB_HOST='db.abcdefghijklmnopqrst.supabase.co',SUPABASE_DB_MIGRATIONS_ENABLED='false',PGHOSTADDR='203.0.113.1')
 for ref,enabled,checked in [('refs/heads/dev','true','abcdefghijklmnopqrst'),('refs/heads/main','','abcdefghijklmnopqrst'),('refs/heads/main','true','aaaaaaaaaaaaaaaaaaaa'),('refs/heads/main','true','abcdefghijklmnopqrst')]:
  x=subprocess.run(['bash','-e','-c',pre],cwd=root,env={**env,'GITHUB_REF':ref,'MIGRATIONS_READY':enabled,'PROJECT_REF':'abcdefghijklmnopqrst','VERIFIED_PROJECT_REF':checked},capture_output=True,text=True)
  assert x.returncode and not log.exists()
 for host,fail,expected in [('db.abcdefghijklmnopqrst.supabase.co','0',['acquire','cli','release']),('aws-0-us-east-1.pooler.supabase.com','1',['acquire','cli']),('db.aaaaaaaaaaaaaaaaaaaa.supabase.co','0',[])]:
  if log.exists():log.unlink()
  x=subprocess.run(['bash','-e','-c',migrate],cwd=root,env={**env,'SUPABASE_DB_HOST':host,'FAIL_CLI':fail},capture_output=True,text=True)
  assert (x.returncode==0)==(fail=='0' and bool(expected)),(host,x.stdout,x.stderr)
  assert (log.read_text().splitlines() if log.exists() else [])==expected
  assert 'synthetic-secret' not in x.stdout+x.stderr
 # Disabled migrations must stop before acquiring a latch.
 if log.exists(): log.unlink()
 sandbox=d/'disabled';(sandbox/'supabase').mkdir(parents=True)
 for child in ('migrations','certs','automation'): shutil.copytree(root/'supabase'/child,sandbox/'supabase'/child)
 config=(root/'supabase'/'config.toml').read_text(); head,section=config.split('[db.migrations]',1)
 section=section.replace('enabled = true','enabled = false',1)
 (sandbox/'supabase'/'config.toml').write_text(head+'[db.migrations]'+section)
 x=subprocess.run(['bash','-e','-c',migrate],cwd=sandbox,env={**env,'GITHUB_WORKSPACE':str(sandbox),'PYTHONOPTIMIZE':'1'},capture_output=True,text=True)
 assert x.returncode != 0 and not log.exists()
print('PASS: blocked preflight, SHA/target, sanitized env, disabled config, no password argv/log, no release on failure')

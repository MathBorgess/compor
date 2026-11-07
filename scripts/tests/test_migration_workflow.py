#!/usr/bin/env python3
"""Test the migration workflow without a network or real credentials (requires PyYAML)."""
from pathlib import Path
import os, shutil, subprocess, sys, tempfile, yaml
root=Path(__file__).resolve().parents[2]
doc=yaml.load((root/'.github/workflows/supabase-migrations.yml').read_text(),Loader=yaml.BaseLoader)
assert set(doc['on'])=={'push','workflow_dispatch'} and doc['on']['push']['branches']==['main']
assert 'paths' not in doc['on']['push'] and 'paths-ignore' not in doc['on']['push']
operation=doc['on']['workflow_dispatch']['inputs']['operation']
assert operation['default']=='migrate' and operation['options']==['migrate','bootstrap']
assert doc['concurrency']['cancel-in-progress']=='false' and doc['concurrency']['queue']=='max'
pre=doc['jobs']['preflight']['steps'][0]['run']; migrate=doc['jobs']['migrate']['steps'][-1]['run']
subprocess.run(['bash','-n'],input=pre,text=True,check=True);subprocess.run(['bash','-n'],input=migrate,text=True,check=True)
sha_guard=doc['jobs']['migrate']['steps'][1]['run']
sha=subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
bootstrap_code='import runpy,sys; d=sys.argv[1]; commit=sys.argv[2]; sys.path.insert(0,d); sys.argv=[d+"/prepare_migration_baseline.py",commit]; runpy.run_path(sys.argv[0],run_name="__main__")'
assert f"-I -c '{bootstrap_code}'" in migrate
generated=subprocess.run([sys.executable,'-I','-c',bootstrap_code,str(root/'scripts'),sha],cwd=root,capture_output=True,text=True,check=True).stdout
assert generated.startswith(f'-- Generated from commit {sha}\n') and generated.rstrip().endswith('COMMIT;')
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
assert '-X' in sys.argv and 'ON_ERROR_STOP=1' in sys.argv
action='bootstrap' if sys.argv[-1].endswith('/baseline.sql') else ('acquire' if 'acquire' in sys.argv[-1] else 'release')
if action=='bootstrap':
 assert open(sys.argv[-1]).read()=='BEGIN; COMMIT;\\n'
with open(os.environ['FAKE_LOG'],'a') as f:f.write(action+'\\n')
if action=='bootstrap':sys.exit(int(os.environ.get('FAIL_BOOTSTRAP','0')))
''');psql.chmod(0o755)
 runner=d/'compor-migration-venv'/'bin'/'python';runner.parent.mkdir(parents=True);runner.write_text('''#!/usr/bin/env python3
import os,sys,pathlib
assert sys.argv[1]=='-I'
if sys.argv[2]=='-c':
 assert 'runpy.run_path' in sys.argv[3] and sys.argv[4].endswith('/scripts')
 assert 'SUPABASE_DB_PASSWORD' not in os.environ and 'PGPASSWORD' not in os.environ
 with open(os.environ['FAKE_LOG'],'a') as f:f.write('prepare\\n')
 print('BEGIN; COMMIT;')
 sys.exit(0)
assert sys.argv[2].endswith('/scripts/run_atomic_migrations.py')
if '--check' in sys.argv:
 assert 'PGPASSWORD' not in os.environ and 'SUPABASE_DB_PASSWORD' not in os.environ
 assert pathlib.Path(sys.argv[-1]).is_dir()
 with open(os.environ['FAKE_LOG'],'a') as f:f.write('validate\\n')
 sys.exit(0)
assert os.environ['PGPASSWORD']=='synthetic-secret' and os.environ['PGSSLMODE']=='verify-full'
assert not any(k.startswith('SUPABASE_') for k in os.environ)
assert os.environ['HOME'].startswith(os.environ['RUNNER_TEMP'])
assert os.environ['XDG_CONFIG_HOME'].startswith(os.environ['HOME'])
assert os.environ['PGHOST'] in ['db.abcdefghijklmnopqrst.supabase.co','aws-0-us-east-1.pooler.supabase.com']
assert os.environ['PGUSER'] in ['postgres','postgres.abcdefghijklmnopqrst']
assert os.environ['PGDATABASE']=='postgres' and os.environ['PGPORT']=='5432'
assert 'PGHOSTADDR' not in os.environ
assert all('synthetic-secret' not in s for s in sys.argv)
assert pathlib.Path('supabase/config.toml').exists() and not pathlib.Path('supabase/.env').exists()
with open(os.environ['FAKE_LOG'],'a') as f:f.write('runner\\n')
sys.exit(int(os.environ.get('FAIL_RUNNER','0')))
''');runner.chmod(0o755)
 env=os.environ.copy();env.update(PATH=str(d/'bin')+':'+env['PATH'],RUNNER_TEMP=tmp,FAKE_LOG=str(log),GITHUB_WORKSPACE=str(root),GITHUB_RUN_ID='101',GITHUB_RUN_ATTEMPT='1',GITHUB_SHA=sha,GITHUB_EVENT_NAME='push',OPERATION='migrate',BOOTSTRAP_READY='false',SUPABASE_DB_PASSWORD='synthetic-secret',SUPABASE_PROJECT_REF='abcdefghijklmnopqrst',VERIFIED_PROJECT_REF='abcdefghijklmnopqrst',SUPABASE_DB_HOST='db.abcdefghijklmnopqrst.supabase.co',SUPABASE_DB_MIGRATIONS_ENABLED='false',PGHOSTADDR='203.0.113.1')
 for ref,enabled,checked in [('refs/heads/dev','true','abcdefghijklmnopqrst'),('refs/heads/main','','abcdefghijklmnopqrst'),('refs/heads/main','true','aaaaaaaaaaaaaaaaaaaa')]:
  x=subprocess.run(['bash','-e','-c',pre],cwd=root,env={**env,'GITHUB_REF':ref,'MIGRATIONS_READY':enabled,'PROJECT_REF':'abcdefghijklmnopqrst','VERIFIED_PROJECT_REF':checked},capture_output=True,text=True)
  assert x.returncode and not log.exists()
 x=subprocess.run(['bash','-e','-c',pre],cwd=root,env={**env,'GITHUB_REF':'refs/heads/main','MIGRATIONS_READY':'true','PROJECT_REF':'abcdefghijklmnopqrst','VERIFIED_PROJECT_REF':'abcdefghijklmnopqrst'},capture_output=True,text=True)
 assert x.returncode==0 and not log.exists()
 for event,enabled,expected in [('push','true',False),('workflow_dispatch','false',False),('workflow_dispatch','true',True)]:
  x=subprocess.run(['bash','-e','-c',pre],cwd=root,env={**env,'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':event,'OPERATION':'bootstrap','BOOTSTRAP_READY':enabled,'PROJECT_REF':'abcdefghijklmnopqrst','VERIFIED_PROJECT_REF':'abcdefghijklmnopqrst','MIGRATIONS_READY':'false'},capture_output=True,text=True)
  assert (x.returncode==0)==expected and not log.exists()
 for host,fail,expected in [('db.abcdefghijklmnopqrst.supabase.co','0',['validate','acquire','runner','release']),('aws-0-us-east-1.pooler.supabase.com','1',['validate','acquire','runner']),('db.aaaaaaaaaaaaaaaaaaaa.supabase.co','0',[])]:
  if log.exists():log.unlink()
  x=subprocess.run(['bash','-e','-c',migrate],cwd=root,env={**env,'SUPABASE_DB_HOST':host,'FAIL_RUNNER':fail},capture_output=True,text=True)
  assert (x.returncode==0)==(fail=='0' and bool(expected)),(host,x.stdout,x.stderr)
  assert (log.read_text().splitlines() if log.exists() else [])==expected
  assert 'synthetic-secret' not in x.stdout+x.stderr
 for event,enabled,fail,expected in [('push','true','0',[]),('workflow_dispatch','false','0',[]),('workflow_dispatch','true','0',['validate','prepare','bootstrap']),('workflow_dispatch','true','1',['validate','prepare','bootstrap'])]:
  if log.exists():log.unlink()
  x=subprocess.run(['bash','-e','-c',migrate],cwd=root,env={**env,'GITHUB_EVENT_NAME':event,'OPERATION':'bootstrap','BOOTSTRAP_READY':enabled,'FAIL_BOOTSTRAP':fail},capture_output=True,text=True)
  assert (x.returncode==0)==(event=='workflow_dispatch' and enabled=='true' and fail=='0'),(event,enabled,fail,x.stderr)
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
print('PASS: manual-only bootstrap, enabled preflight, SHA/target, sanitized env, no password argv/log, no release on failure')

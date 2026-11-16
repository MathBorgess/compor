import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digestJson,sha256} from './contracts.mjs';
import {freezeSuite,trustedSuite} from './trust.mjs';

test('preparing a changed evaluator cannot silently replace the separately fixed suite',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'compor-trust-')),previous=process.env.COMPOR_VERIFICATION_TRUST;
  process.env.COMPOR_VERIFICATION_TRUST=join(directory,'trusted.json');
  t.after(async()=>{if(previous===undefined)delete process.env.COMPOR_VERIFICATION_TRUST;else process.env.COMPOR_VERIFICATION_TRUST=previous;await rm(directory,{recursive:true,force:true});});
  const entries=[{path:'scripts/verification/goals/G01.json',sha256:sha256('required criterion')}];
  const source={entries,suiteDigest:digestJson(entries)};
  await assert.rejects(trustedSuite(directory,source),/trusted_suite_missing/);
  await freezeSuite(directory,source);
  assert.equal((await trustedSuite(directory,source)).suiteDigest,source.suiteDigest);
  const changed={entries:[{...entries[0],sha256:sha256('weakened criterion')}]};changed.suiteDigest=digestJson(changed.entries);
  await assert.rejects(trustedSuite(directory,changed),/trusted_suite_changed/);
  await assert.rejects(freezeSuite(directory,changed),/EEXIST/);
  assert.equal((await trustedSuite(directory,source)).suiteDigest,source.suiteDigest);
});

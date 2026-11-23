import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { defaultRepoRoot, onlyLoopback, verifyMigrations } from './preflight.mjs';
import { FIXTURE_USERS, FIXTURE_OPENAI_KEY } from './stack.mjs';

test('manifest refuses a changed migration instead of reporting the pinned schema', async t => {
  const expected = await verifyMigrations();
  assert.equal(expected.migrations.length, 49);
  const root = await mkdtemp(join(tmpdir(), 'compor-infra-migration-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'supabase/migrations'), { recursive: true });
  for (const migration of expected.migrations) await copyFile(join(defaultRepoRoot, 'supabase/migrations', migration.name), join(root, 'supabase/migrations', migration.name));
  await appendFile(join(root, 'supabase/migrations', expected.migrations[0].name), '\n-- divergent candidate\n');
  await assert.rejects(verifyMigrations(root), /migration_digest_mismatch/);
});

test('network precondition rejects an interface able to leave loopback', () => {
  assert.equal(onlyLoopback({ lo: [{ internal: true }] }), true);
  assert.equal(onlyLoopback({ lo: [{ internal: true }], eth0: [{ internal: false }] }), false);
});

async function createSyntheticDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'compor-infra-sql-'));
  let db = new PGlite(directory);
  t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }); });
  await db.exec('create database compor_verify');
  await db.close();
  db = new PGlite(directory, { database: 'compor_verify', username: 'postgres' });
  const baseline = await readFile(new URL('./baseline.sql', import.meta.url), 'utf8');
  await assert.rejects(db.exec(baseline), /refusing non-empty or unguarded/);
  const inventory = await verifyMigrations();
  const sources = [];
  for (const migration of inventory.migrations) sources.push(await readFile(join(defaultRepoRoot, 'supabase/migrations', migration.name), 'utf8'));
  await db.exec("begin; set local compor.verification_baseline='synthetic-offline-v1';\n" + baseline + '\n' + sources.join('\n') + '\ncommit;');
  return db;
}

test('all unchanged migrations run on the declared fixture and preserve roles, RLS and the fixed Vault RPC', { timeout: 30_000 }, async t => {
  const db = await createSyntheticDatabase(t);
  await db.query('insert into auth.users(id) values ($1),($2)', [FIXTURE_USERS.alice, FIXTURE_USERS.bob]);
  await db.query('insert into vault.synthetic_secrets(name,decrypted_secret) values ($1,$2)', ['COMPOR_CIN_OPENAI', FIXTURE_OPENAI_KEY]);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: FIXTURE_USERS.alice })]);
  const project = (await db.query("insert into public.projects(title) values ('Synthetic isolation') returning id,owner_id")).rows[0];
  assert.equal(project.owner_id, FIXTURE_USERS.alice);
  const post = '33333333-3333-4333-8333-333333333333';
  const created = (await db.query('select public.create_project_post($1,$2,$3) as value', [project.id, post, 'Synthetic post'])).rows[0].value;
  assert.equal(created.status, 'created');
  const content = { headline: '', price: '', date: '', caption: 'Synthetic', captionOrigin: 'user' };
  const version = (await db.query('select public.save_piece_version($1,$2,0,$3::jsonb) as value', [project.id, post, JSON.stringify(content)])).rows[0].value;
  assert.equal(version.status, 'saved');
  const storagePath = `${FIXTURE_USERS.alice}/${project.id}/${post}/1/44444444-4444-4444-8444-444444444444.png`;
  await db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)", [storagePath]);
  assert.equal((await db.query('select name from storage.objects')).rows[0].name, storagePath);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: FIXTURE_USERS.bob })]);
  assert.deepEqual((await db.query('select * from public.projects')).rows, []);
  assert.deepEqual((await db.query('select * from public.project_posts')).rows, []);
  assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)", [storagePath]), error => error.code === '42501');
  const denied = (await db.query('select public.create_project_post($1,$2,$3) as value', [project.id, post, 'Intrusion'])).rows[0].value;
  assert.equal(denied.status, 'not_found');
  await assert.rejects(db.query('select public.compor_default_openai_key()'), error => error.code === '42501');
  await db.exec('reset role; set role service_role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  assert.equal((await db.query('select public.compor_default_openai_key() as key')).rows[0].key, FIXTURE_OPENAI_KEY);
  await assert.rejects(db.query('select * from vault.decrypted_secrets'), error => error.code === '42501');
  await assert.rejects(db.query('select * from public.projects'), error => error.code === '42501');
});

test('image reconciliation keeps the original reservation and fences only unclaimed actions', { timeout: 30_000 }, async t => {
  const db = await createSyntheticDatabase(t);
  const owner = FIXTURE_USERS.alice;
  await db.query('insert into auth.users(id) values ($1),($2)', [owner, FIXTURE_USERS.bob]);
  await db.exec('set role authenticated');
  const authenticate = user => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: user })]);
  await authenticate(owner);
  const { id: project } = (await db.query("insert into public.projects(title) values ('Synthetic recovery') returning id")).rows[0];
  const piece = '33333333-3333-4333-8333-333333333333';
  const content = JSON.stringify({ headline: '', price: '', date: '', caption: 'Synthetic', captionOrigin: 'user' });
  await db.query('select public.create_project_post($1,$2,$3)', [project, piece, 'Synthetic post']);
  for (const baseVersion of [0, 1]) {
    const { value } = (await db.query('select public.save_piece_version($1,$2,$3,$4::jsonb) as value', [project, piece, baseVersion, content])).rows[0];
    assert.equal(value.status, 'saved');
  }
  const start = async request => {
    const { value } = (await db.query('select public.reserve_studio_turn($1,$2,$3) as value', [project, request, 'a'.repeat(64)])).rows[0];
    assert.equal(value.status, 'reserved');
    await db.query("select public.set_studio_turn_state($1,$2,'action_required','turn_test')", [project, request]);
    return value.turn.attempt_id;
  };
  const finish = async (request, attempt, state) => {
    await db.query("select public.set_studio_turn_state($1,$2,$3,'turn_test')", [project, request, state]);
    await db.query('select public.finish_agent_attempt($1,$2,$3)', [project, attempt, state === 'failed' ? 'unknown' : 'completed']);
  };
  const reserve = args => db.query('select * from public.reserve_image_tool_call($1,$2,$3,$4,$5,$6,$7)', args).then(result => result.rows[0]);
  const fence = args => db.query('select public.fence_unsubmitted_image_tool_call($1,$2,$3,$4,$5,$6,$7) as value', args).then(result => result.rows[0].value);
  const confirm = request => db.query('select public.confirm_closed_image_attempt($1,$2) as value', [project, request]).then(result => result.rows[0].value);
  const declare = reservation => db.query('select * from public.declare_image_generation_consent($1,true)', [reservation]);
  const proof = '56'.repeat(32);
  const digest = createHash('sha256').update(Buffer.from(proof, 'hex')).digest('hex');
  const claim = reservation => db.query('select * from public.claim_post_image_execution_proven($1,$2)', [reservation, digest]).then(result => result.rows[0]);
  const unavailable = error => error.code === '42501';

  const request = '44444444-4444-4444-8444-444444444444';
  const attempt = await start(request);
  const original = [project, piece, 1, attempt, 'sess_test', 'turn_test', 'exec_original'];
  const staleVersion = [project, piece, 2, ...original.slice(3)];
  const { reservation_id: reservation } = await reserve(original);
  await declare(reservation);
  await db.exec('reset role');
  await db.query("insert into public.foreground_image_waits values($1,$2,now()+interval '15 seconds')", [owner, reservation]);
  await db.exec('set role authenticated');
  await authenticate(FIXTURE_USERS.bob);
  await assert.rejects(fence(staleVersion), unavailable, 'another account cannot fence the reservation');
  assert.equal(await confirm(request), 'unverified');
  await authenticate(owner);
  await assert.rejects(fence([project, piece, 3, ...original.slice(3)]), unavailable, 'the submitted version must belong to this post');
  assert.equal(await fence(staleVersion), 'fenced');
  assert.equal(await fence(original), 'fenced', 'a retry records no additional fence');
  assert.deepEqual((await db.query('select piece_version,state from public.image_tool_reservations where id=$1', [reservation])).rows, [{ piece_version: 1, state: 'unknown' }]);
  await assert.rejects(reserve(staleVersion), unavailable, 'reconciliation does not let the generation path rebind the image');
  await assert.rejects(claim(reservation), unavailable, 'a late claimant cannot turn the fence into an execution');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select reservation_id from public.image_non_dispatch_fences')).rows, [{ reservation_id: reservation }]);
  assert.deepEqual((await db.query('select reservation_id from public.foreground_image_waits')).rows, []);
  await db.exec('set role authenticated');
  assert.equal(await confirm(request), 'unverified', 'a fenced action alone cannot close the provider turn');
  await finish(request, attempt, 'failed');
  assert.equal(await confirm(request), 'failed_without_dispatch', 'a terminal failed turn may release a fully fenced marker');
  await assert.rejects(reserve([...original.slice(0, 6), 'exec_late']), unavailable, 'the closed parent cannot reserve another image');

  const completed = '55555555-5555-4555-8555-555555555555';
  await finish(completed, await start(completed), 'completed');
  assert.equal(await confirm(completed), 'confirmed', 'legacy completed attempts may have no reservations');
  const failed = '66666666-6666-4666-8666-666666666666';
  await finish(failed, await start(failed), 'failed');
  assert.equal(await confirm(failed), 'unverified', 'the legacy failed path still requires durable evidence');

  const active = '77777777-7777-4777-8777-777777777777';
  const activeAttempt = await start(active);
  const activeCall = [project, piece, 1, activeAttempt, 'sess_test', 'turn_test', 'exec_claimed'];
  const freshCall = [...activeCall.slice(0, 6), 'exec_fence_first'];
  assert.equal(await fence(freshCall), 'fenced', 'a first fence still reserves the exact requested version');
  const unfenced = [...activeCall.slice(0, 6), 'exec_unknown_without_fence'];
  await reserve(unfenced);
  await db.query('select public.mark_image_tool_call_unknown($1,$2,$3,$4)', [project, ...unfenced.slice(4)]);
  assert.equal(await fence(unfenced), 'unverified', 'legacy uncertainty without a fence supplies no evidence');
  const { reservation_id: claimedReservation } = await reserve(activeCall);
  await declare(claimedReservation);
  const execution = await claim(claimedReservation);
  assert.equal(execution.state, 'running');
  assert.equal(await fence([project, piece, 2, ...activeCall.slice(3)]), 'unverified', 'an execution takes precedence over the fence');
  await assert.rejects(db.query('select public.mark_image_tool_execution_unknown($1)', [execution.execution_id]), unavailable, 'a legacy caller cannot end an active lease');
  await db.query('select public.mark_image_tool_execution_unknown($1,$2)', [execution.execution_id, proof]);
  assert.equal(await fence(activeCall), 'unverified', 'an unknown execution cannot become non-dispatch evidence');
  await finish(active, activeAttempt, 'completed');
  assert.equal(await confirm(active), 'unverified', 'a mixed attempt cannot release its marker');
});

test('a post image hold settles only the proven execution and conserves the original scope', { timeout: 30_000 }, async t => {
  const db = await createSyntheticDatabase(t);
  const owner = FIXTURE_USERS.alice, other = FIXTURE_USERS.bob;
  const request = '44444444-4444-4444-8444-444444444444';
  const piece = '33333333-3333-4333-8333-333333333333';
  const proof = '12'.repeat(32);
  const digest = createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex');
  const denied = error => error.code === '42501';
  const row = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
  const as = user => db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:user})]);
  await db.query('insert into auth.users(id) values ($1),($2)',[owner,other]);
  await db.exec('set role authenticated');
  await as(owner);
  const {id:project} = await row("insert into public.projects(title) values ('Hold fixture') returning id");
  await db.query("select public.create_project_post($1,$2,'Post fixture')",[project,piece]);
  const content = JSON.stringify({headline:'',price:'',date:'',caption:'Synthetic',captionOrigin:'user'});
  assert.equal((await row('select public.save_piece_version($1,$2,0,$3::jsonb) as value',[project,piece,content])).value.status,'saved');
  const start = id => row('select public.reserve_studio_turn($1,$2,$3) as value',[project,id,'a'.repeat(64)]);
  const {value:{turn:{attempt_id:attempt}}} = await start(request);
  await db.query("select public.set_studio_turn_state($1,$2,'action_required','turn_test')",[project,request]);
  await db.query("select public.start_usage_measurement_v3($1,$2,'agent',$2,'gpt-6.1-terra')",[project,attempt]);
  const call = [project,piece,1,attempt,'sess_test','turn_test','exec_original'];
  const {reservation_id:reservation} = await row('select * from public.reserve_image_tool_call($1,$2,$3,$4,$5,$6,$7)',call);
  await db.query('select public.declare_image_generation_consent($1,true)',[reservation]);
  const claim = value => row('select * from public.claim_post_image_execution_proven($1,$2)',[reservation,value]);
  const execution = await claim(digest);
  assert.equal(execution.is_new,true);
  assert.equal((await claim('4'.repeat(64))).is_new,false,'a second caller cannot change the proof');
  const hold = (secret=proof,reason='image_quality_rejected') => row('select public.hold_post_image_candidate($1,$2,$3) as value',[execution.execution_id,secret,reason]);
  const closed = () => row('select public.confirm_closed_image_attempt($1,$2) as value',[project,request]);
  await assert.rejects(db.query('select * from public.post_image_quality_claims'),denied);
  await assert.rejects(hold('34'.repeat(32)),denied);
  await as(other);
  await assert.rejects(hold(),denied);
  assert.equal((await closed()).value,'unverified');
  await as(owner);
  assert.equal((await closed()).value,'unverified');
  await db.query('select public.mark_image_tool_execution_unknown($1,$2)',[execution.execution_id,proof]);
  await db.query("select public.set_studio_turn_state($1,$2,'failed','turn_test')",[project,request]);
  await db.query("select public.finish_agent_attempt($1,$2,'unknown')",[project,attempt]);
  assert.equal((await closed()).value,'unverified','provider turn failure does not prove what happened to an image');
  assert.equal((await hold()).value,true,'the original claimant can recover a settlement after uncertain delivery');
  assert.equal((await hold()).value,true);
  assert.equal((await hold(proof,'image_quality_inconclusive')).value,false);
  assert.equal((await closed()).value,'image_quality_rejected');
  assert.deepEqual(await claim(digest),{...execution,state:'quality_held',is_new:false});
  assert.equal((await row('select public.fence_unsubmitted_image_tool_call($1,$2,$3,$4,$5,$6,$7) as value',call)).value,'unverified','a withheld candidate was dispatched');
  await assert.rejects(db.query('select public.mark_image_tool_execution_unknown($1,$2)',[execution.execution_id,proof]),denied);
  const assetPath=`${owner}/${project}/${piece}/1/${execution.asset_id}.png`;
  assert.equal((await row('select count(*)::int as value from storage.objects')).value,0);
  await db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)",[assetPath]);
  await assert.rejects(db.query('select public.complete_image_tool_execution($1)',[execution.execution_id]),denied);
  await assert.rejects(db.query('select public.claim_image_tool_result_submission($1,$2,$3,$4,$5,$6,$7,$8)',[execution.execution_id,...call]),denied);
  assert.equal((await row("select state from public.usage_measurements where attempt_id=$1 and part='agent'",[attempt])).state,'unknown');
  assert.equal((await start('55555555-5555-4555-8555-555555555555')).value.status,'reserved');
});

test('a closed serial exploration preserves the uncertain receipt and releases other projects', { timeout: 30_000 }, async t => {
  const db = await createSyntheticDatabase(t);
  const owner = FIXTURE_USERS.alice;
  const oldImage = '44444444-4444-4444-8444-444444444444';
  const oldBatch = '55555555-5555-4555-8555-555555555555';
  const newImage = '66666666-6666-4666-8666-666666666666';
  const request = '77777777-7777-4777-8777-777777777777';
  const piece = '88888888-8888-4888-8888-888888888888';
  const promptDigest = 'a'.repeat(64);
  const proof = 'ab'.repeat(32);
  const proofDigest = createHash('sha256').update(Buffer.from(proof, 'hex')).digest('hex');
  const row = async (query, values = []) => (await db.query(query, values)).rows[0];
  const denied = error => error.code === '42501';
  const invalidClosure = error => error.code === '23514';
  await db.query('insert into auth.users(id) values ($1),($2)', [owner, FIXTURE_USERS.bob]);
  await db.exec('set role authenticated');
  const authenticate = user => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: user })]);
  await authenticate(owner);
  const { id: deletedProject } = await row("insert into public.projects(title) values ('Old project') returning id");
  const { id: activeProject } = await row("insert into public.projects(title) values ('Active project') returning id");
  const reserveOld = () => row('select * from public.reserve_exploration_image_batched_proven($1,$2,$3,$4,1,$5)', [deletedProject, oldImage, promptDigest, oldBatch, proofDigest]);
  const reserveNew = () => row('select * from public.reserve_exploration_image_proven($1,$2,$3,$4)', [activeProject, newImage, promptDigest, proofDigest]);
  assert.deepEqual(await reserveOld(), { state: 'running', is_new: true });
  await db.query("insert into public.exploration_plans(image_id,project_id,composition,contrast) values ($1,$2,'Synthetic composition','Synthetic contrast')", [oldImage, deletedProject]);
  await assert.rejects(db.query("select public.finish_exploration_image($1,$2,'unknown')", [deletedProject, oldImage]), denied);
  await db.query('select public.mark_exploration_image_unknown_proven($1,$2,$3)', [deletedProject, oldImage, proof]);

  await db.query("select public.create_project_post($1,$2,'Synthetic post')", [activeProject, piece]);
  const content = JSON.stringify({ headline: '', price: '', date: '', caption: 'Synthetic', captionOrigin: 'user' });
  assert.equal((await row('select public.save_piece_version($1,$2,0,$3::jsonb) as value', [activeProject, piece, content])).value.status, 'saved');
  const { value: turn } = await row('select public.reserve_studio_turn($1,$2,$3) as value', [activeProject, request, promptDigest]);
  assert.equal(turn.status, 'reserved');
  const { reservation_id: reservation } = await row("select * from public.reserve_image_tool_call($1,$2,1,$3,'sess_test','turn_test','exec_test')", [activeProject, piece, turn.turn.attempt_id]);
  await db.query('select * from public.declare_image_generation_consent($1,true)', [reservation]);
  const claim = () => row('select * from public.claim_image_tool_execution($1)', [reservation]);
  const close = expression => db.query(`update public.exploration_images set state='closed_unknown',closed_at=${expression} where id=$1`, [oldImage]);
  await assert.rejects(close('clock_timestamp()'), denied, 'ordinary owners cannot perform an administrative closure');

  await db.exec('reset role');
  // Simulate the historical soft delete from before the current pending guard.
  await db.query('update public.projects set deleted_at=now() where id=$1', [deletedProject]);
  const history = () => row(`select e.*, p.digest, x.composition, x.contrast from public.exploration_images e
    join public.exploration_rejection_proofs p on p.image_id=e.id
    join public.exploration_plans x on x.image_id=e.id where e.id=$1`, [oldImage]);
  const original = await history();
  assert.equal(original.state, 'unknown');
  assert.equal(original.closed_at, null);
  await db.exec('set role authenticated');
  assert.deepEqual(await reserveNew(), { state: 'blocked', is_new: false });
  assert.equal((await claim()).state, 'blocked');
  await db.exec('reset role');
  await assert.rejects(close('null'), invalidClosure);
  await assert.rejects(close("updated_at-interval '1 second'"), invalidClosure);
  await assert.rejects(db.query('update public.exploration_images set closed_at=clock_timestamp() where id=$1', [oldImage]), invalidClosure);

  await db.exec('begin');
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [owner]);
  await close('clock_timestamp()');
  await db.exec('commit');
  const closed = await history();
  assert.ok(closed.closed_at instanceof Date && closed.closed_at >= original.updated_at);
  assert.equal(Number(closed.revision), Number(original.revision) + 1);
  assert.deepEqual(closed, { ...original, state: 'closed_unknown', revision: closed.revision, closed_at: closed.closed_at });
  assert.equal((await row('select count(*)::int as count from public.image_tool_executions')).count, 0);

  await db.exec('set role authenticated');
  await authenticate(FIXTURE_USERS.bob);
  assert.deepEqual((await db.query('select id from public.exploration_images where id=$1', [oldImage])).rows, []);
  await authenticate(owner);
  assert.deepEqual(await reserveOld(), { state: 'closed_unknown', is_new: false }, 'the exact old ID always replays its receipt');
  await assert.rejects(db.query("select public.finish_exploration_image($1,$2,'unknown')", [deletedProject, oldImage]), denied);
  await db.exec('begin');
  assert.equal((await claim()).state, 'running', 'foreground admission no longer counts the closed receipt');
  await db.exec('rollback');
  assert.deepEqual(await reserveNew(), { state: 'running', is_new: true }, 'a fresh ID in the other project is admitted');
});

test('exploration quality holds preserve receipts and admit only a proven explicit replacement', { timeout: 30_000 }, async t => {
  const db = await createSyntheticDatabase(t);
  const { createHash } = await import('node:crypto');
  const owner = FIXTURE_USERS.alice;
  const row = async (query, args = []) => (await db.query(query, args)).rows[0];
  const as = user => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: user })]);
  const digest = secret => createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
  const id = n => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const proof = n => n.toString(16).padStart(64, '0');
  const denied = error => error.code === '42501';
  await db.query('insert into auth.users(id) values ($1),($2)', [owner, FIXTURE_USERS.bob]);
  await db.exec('set role authenticated');
  await as(owner);
  const { id: project } = await row("insert into public.projects(title) values ('Synthetic quality holds') returning id");
  const prompt = 'a'.repeat(64);
  const path = image => `${owner}/${project}/${image}.png`;
  const put = image => db.query("insert into storage.objects(bucket_id,name) values ('compor-exploration-images',$1)", [path(image)]);
  const hold = (image, secret, reason = 'image_quality_rejected') => row('select public.hold_exploration_image_quality($1,$2,$3,$4) as value', [project, image, secret, reason]);
  const complete = (image, secret) => row('select public.complete_exploration_image_proven($1,$2,$3) as value', [project, image, secret]);
  const serial = (image, secret) => row('select * from public.reserve_exploration_image_batched_proven($1,$2,$3,$4,1,$5)', [project, image, prompt, id(2), digest(secret)]);
  const receipt = image => row('select state,quality_reason,revision from public.exploration_images where id=$1', [image]);
  assert.deepEqual(await serial(id(1), proof(1)), { state: 'running', is_new: true });
  await assert.rejects(hold(id(1), proof(2)), denied);
  await as(FIXTURE_USERS.bob);
  await assert.rejects(hold(id(1), proof(1)), denied);
  assert.equal(await receipt(id(1)), undefined);
  await as(owner);
  assert.equal((await hold(id(1), proof(1))).value, true);
  assert.equal((await receipt(id(1))).quality_reason, 'image_quality_rejected');
  assert.deepEqual(await serial(id(1), proof(2)), { state: 'quality_held', is_new: false });
  await assert.rejects(hold(id(1), proof(1), 'image_quality_inconclusive'), denied);
  await assert.rejects(put(id(1)), denied);
  assert.deepEqual((await db.query('select name from storage.objects where name=$1', [path(id(1))])).rows, []);

  assert.deepEqual(await serial(id(3), proof(3)), { state: 'running', is_new: true }, 'a fresh explicit ID may reuse the held slot');
  await put(id(3));
  await assert.rejects(hold(id(3), proof(3)), denied, 'holding a stored image cannot consume its proof');
  assert.equal((await complete(id(3), proof(3))).value, true);

  const batch = id(4), intentForBatch = id(5), planning = id(6), children = [id(7), id(8), id(9)];
  const intentReserve = (intent, epoch, secret, purpose, position = null, previous = null) => row(
    "select public.reserve_exploration_intent($1,null,$2,$3,$4,$5,$5,$6,$7,$8,$9) as value",
    [project, batch, intent, epoch, prompt, digest(secret), purpose, position, previous],
  );
  assert.equal((await intentReserve(intentForBatch, 0, proof(5), 'batch')).value.status, 'reserved');
  assert.equal((await row('select public.reserve_exploration_plan($1,null,$2,$3,$4,$5,$6,$7) as value', [project, batch, planning, prompt, digest(proof(6)), intentForBatch, proof(5)])).value.status, 'reserved');
  await db.query("select public.bind_exploration_plan($1,$2,'valid-opaque-synthetic-binding',$3)", [project, planning, proof(6)]);
  await db.query("select public.finish_exploration_plan($1,$2,'completed',$3)", [project, planning, proof(6)]);
  assert.deepEqual(await row('select * from public.reserve_exploration_batch_proven($1,$2,null,$3,$4,$5,$6,$7,$8)',
    [project, batch, prompt, children, children.map(() => prompt), [7, 8, 9].map(n => digest(proof(n))), intentForBatch, proof(5)]), { state: 'running', is_new: true });
  await put(id(7));
  await complete(id(7), proof(7));
  await hold(id(8), proof(8), 'image_quality_inconclusive');
  await db.query('select public.reject_exploration_image($1,$2,$3)', [project, id(9), proof(9)]);
  const observe = async () => (await row('select public.get_exploration_batch($1,$2) as value', [project, batch])).value;
  const partial = await observe();
  assert.equal(partial.state, 'partial');
  assert.equal(partial.completed_at, null);
  assert.equal(partial.next_at, null);
  assert.deepEqual(partial.images.map(image => [image.state, image.quality_reason]), [['completed', undefined], ['quality_held', 'image_quality_inconclusive'], ['rejected', undefined]]);

  const replacement = (intent = id(10)) => row('select * from public.replace_rejected_exploration_batch_slot_proven($1,$2,2,$3,$4,$5,$6,$7,$8)',
    [project, batch, id(8), id(11), prompt, digest(proof(11)), intent, proof(10)]);
  assert.deepEqual(await replacement(), { state: 'revoked', is_new: false });
  assert.equal((await intentReserve(id(10), 1, proof(10), 'replacement', 2, id(8))).value.status, 'reserved');
  assert.deepEqual(await replacement(), { state: 'running', is_new: true });
  assert.deepEqual(await replacement(), { state: 'running', is_new: false });
  await hold(id(11), proof(11));
  const after = await observe();
  assert.equal(after.state, 'partial');
  assert.equal(after.images[1].id, id(11));
  assert.equal(after.images[1].replaces_image_id, id(8));
  assert.equal(after.images[1].quality_reason, 'image_quality_rejected');
  assert.equal((await receipt(id(8))).quality_reason, 'image_quality_inconclusive');
  assert.deepEqual(after.images[0], partial.images[0]);
});

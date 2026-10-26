import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { testSandbox } from './sandbox-api.test.mjs';

const databaseUrl = process.env.DATABASE_URL_TEST ??
  'postgresql://luxledger:luxledger@127.0.0.1:5433/luxledger_demo_test';
const apiUrl = 'http://127.0.0.1:3100';
const testEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  PORT: '3100',
  NODE_ENV: 'test',
  BOOTSTRAP_TENANT_NAME: 'LL-82 integration tenant',
  BOOTSTRAP_ADMIN_KEY_NAME: 'LL-82 integration key',
  BOOTSTRAP_ADMIN_API_KEY: 'll_ll82_integration_admin_key',
  JWT_SIGNING_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
};

const run = (command, args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });

const json = async (path, init) => {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};

const waitForApi = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${apiUrl}/ready`)).ok) return;
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Integration API did not become ready');
};

await run('node', ['scripts/prepare-test-db.mjs'], testEnvironment);
const api = spawn('npm', ['run', 'start'], { env: testEnvironment, stdio: 'inherit' });

try {
  await waitForApi();
  const seeded = await json('/demo/reset', { method: 'POST' });
  assert.deepEqual(
    seeded.accounts.map(({ address, balance_minor }) => ({ address, balance_minor })),
    [
      { address: 'wallet:alice', balance_minor: '10000' },
      { address: 'wallet:bob', balance_minor: '0' },
    ],
  );
  assert.equal(seeded.transactions.length, 1);
  assert.equal(seeded.transactions[0].reference, 'demo-seed-funding-alice-v1');
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [funding] = await sql`
      select side, balance_minor::text as balance_minor
      from accounts
      where name = 'system:funding'
    `;
    assert.deepEqual(funding, { side: 'DEBIT', balance_minor: '10000' });
  } finally {
    await sql.end({ timeout: 5 });
  }

  const transferred = await json('/demo/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'wallet:alice', to: 'wallet:bob', amount_minor: '2500' }),
  });
  assert.deepEqual(
    transferred.accounts.map(({ address, balance_minor }) => ({ address, balance_minor })),
    [
      { address: 'wallet:alice', balance_minor: '7500' },
      { address: 'wallet:bob', balance_minor: '2500' },
    ],
  );
  const transfer = transferred.transactions.at(-1);
  assert.deepEqual(
    transfer.entries
      .map(({ account_address, signed_amount_minor }) => ({
        account_address,
        signed_amount_minor,
      }))
      .sort((left, right) => left.account_address.localeCompare(right.account_address)),
    [
      { account_address: 'wallet:alice', signed_amount_minor: '2500' },
      { account_address: 'wallet:bob', signed_amount_minor: '-2500' },
    ],
  );

  const post = (path, body) => json(path, { method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const held = await post('/demo/holds', { from: 'wallet:alice', to: 'wallet:bob', amount_minor: '1000' });
  assert.equal(held.accounts[0].balance_minor, '7500');
  assert.equal((await json('/demo/accounts/wallet:alice/details')).available_minor, '6500');
  assert.equal(held.holds[0].state, 'HELD');
  assert.equal(held.holds[0].description, 'wallet:alice to wallet:bob');
  assert.equal(held.holds[0].original_amount_minor, '1000');
  const holdId = held.holds[0].id;
  const rejected = await fetch(`${apiUrl}/demo/transfers`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'wallet:alice', to: 'wallet:bob', amount_minor: '7000' }) });
  assert.equal(rejected.status, 409);
  const committed = await post(`/demo/holds/${holdId}/commit`);
  assert.equal(committed.accounts[0].balance_minor, '6500');
  assert.equal(committed.accounts[1].balance_minor, '3500');
  assert.equal(committed.holds[0].state, 'APPLIED');
  assert.equal(committed.holds[0].original_amount_minor, '1000');
  assert.equal(committed.holds[0].remaining_amount_minor, '0');
  const replay = await post(`/demo/holds/${holdId}/commit`);
  assert.equal(replay.transactions.length, committed.transactions.length);
  const heldAgain = await post('/demo/holds', { from: 'wallet:alice', to: 'wallet:bob', amount_minor: '500' });
  const voided = await post(`/demo/holds/${heldAgain.holds[0].id}/void`);
  assert.equal(voided.holds[0].state, 'VOIDED');
  const details = await json('/demo/accounts/wallet:alice/details');
  assert.equal(details.available_minor, '6500');
  assert.equal(voided.accounts[0].balance_minor, '6500');
  for (const event of ['HOLD_CREATED', 'HOLD_COMMITTED', 'HOLD_VOIDED']) {
    assert.ok(details.history.some(item => item.event === event));
  }
  assert.equal(voided.trial_balance.debits_minor, voided.trial_balance.credits_minor);
  const matched = await post('/demo/reconciliation', { reference: transfer.reference, amount_minor: '2500' });
  assert.equal(matched.matchedCount, 1);
  const mismatch = await post('/demo/reconciliation', { reference: transfer.reference, amount_minor: '2400' });
  assert.equal(mismatch.mismatchedCount, 1);
  const missing = await post('/demo/reconciliation', { reference: 'missing-reference', amount_minor: '100' });
  assert.equal(missing.unmatchedExternalCount, 1);
  assert.ok(missing.unmatchedInternalCount > 0);

  const [resetAgain, concurrentReset] = await Promise.all([
    json('/demo/reset', { method: 'POST' }),
    json('/demo/reset', { method: 'POST' }),
  ]);
  for (const resetState of [resetAgain, concurrentReset]) {
    assert.equal(resetState.transactions[0].reference, 'demo-seed-funding-alice-v1');
    assert.equal(resetState.accounts[0].balance_minor, '10000');
    assert.equal(resetState.accounts[1].balance_minor, '0');
    assert.equal(resetState.holds.length, 0);
    assert.equal((await json('/demo/accounts/wallet:alice/details')).available_minor, '10000');
  }
  // Completed history must never hide a reservation that still locks funds.
  const active = await post('/demo/holds', { from: 'wallet:alice', to: 'wallet:bob', amount_minor: '1000' });
  const activeId = active.holds[0].id;
  for (let index = 0; index < 100; index++) {
    const newer = await post('/demo/holds', { from: 'wallet:alice', to: 'wallet:bob', amount_minor: '1' });
    await post(`/demo/holds/${newer.holds[0].id}/void`);
  }
  const fullHistory = await json('/demo/state');
  assert.equal(fullHistory.holds.length, 101);
  assert.equal(fullHistory.holds.find(hold => hold.id === activeId)?.state, 'HELD');
  assert.equal((await json('/demo/accounts/wallet:alice/details')).available_minor, '9000');
  const released = await post(`/demo/holds/${activeId}/void`);
  assert.equal(released.holds.length, 100);
  assert.ok(released.holds.every(hold => hold.state === 'VOIDED'));
  assert.equal((await json('/demo/accounts/wallet:alice/details')).available_minor, '10000');
  console.log('Demo API integration flow passed');
  await testSandbox(apiUrl, databaseUrl);
} finally {
  api.kill('SIGTERM');
  await new Promise((resolve) => api.once('exit', resolve));
}

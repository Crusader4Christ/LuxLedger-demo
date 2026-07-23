import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

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
      .map(({ account_address, direction, amount_minor }) => ({
        account_address,
        direction,
        amount_minor,
      }))
      .sort((left, right) => left.account_address.localeCompare(right.account_address)),
    [
      { account_address: 'wallet:alice', direction: 'DEBIT', amount_minor: '2500' },
      { account_address: 'wallet:bob', direction: 'CREDIT', amount_minor: '2500' },
    ],
  );

  const resetAgain = await json('/demo/reset', { method: 'POST' });
  assert.equal(resetAgain.transactions[0].reference, 'demo-seed-funding-alice-v1');
  assert.equal(resetAgain.accounts[0].balance_minor, '10000');
  assert.equal(resetAgain.accounts[1].balance_minor, '0');
  console.log('Demo API integration flow passed');
} finally {
  api.kill('SIGTERM');
  await new Promise((resolve) => api.once('exit', resolve));
}

import { expect, test } from '@playwright/test';
import { requestToCurl } from '../../apps/web/src/api';
import { entriesAreBalanced, toEntryDisplay } from '../../apps/web/src/ledger-display';

test('signed entry display rejects zero and derives balance from the entries', () => {
  expect(toEntryDisplay('25')).toEqual({ direction: 'DEBIT', magnitudeMinor: '25' });
  expect(toEntryDisplay('-25')).toEqual({ direction: 'CREDIT', magnitudeMinor: '25' });
  expect(toEntryDisplay('0')).toBeNull();
  expect(entriesAreBalanced([{ signed_amount_minor: '25' }, { signed_amount_minor: '-25' }])).toBe(
    true,
  );
  expect(entriesAreBalanced([{ signed_amount_minor: '25' }])).toBe(false);
  expect(entriesAreBalanced([{ signed_amount_minor: '0' }])).toBe(false);
});

test('curl preview safely quotes apostrophes in JSON values', () => {
  const curl = requestToCurl(
    {
      method: 'POST',
      path: '/demo/accounts',
      body: { address: "wallet:alice's" },
    },
    'http://127.0.0.1:5174',
  );

  expect(curl).toContain(`--data '{"address":"wallet:alice'"'"'s"}'`);
});

test('reset and transfer expose balances and balanced entries', async ({ page, request }) => {
  const reset = await request.post('/demo/reset');
  expect(reset.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByTestId('account-wallet:alice')).toContainText('100.00 USD');
  await expect(page.getByTestId('account-wallet:bob')).toContainText('0.00 USD');

  await page.getByRole('button', { name: 'Send transfer' }).click();

  await expect(page.getByTestId('account-wallet:alice')).toContainText('75.00 USD');
  await expect(page.getByTestId('account-wallet:bob')).toContainText('25.00 USD');
  await expect(page.getByText('DEBIT', { exact: true })).toBeVisible();
  await expect(page.getByText('CREDIT', { exact: true })).toBeVisible();
  await expect(page.getByText('✓ Debits and credits balance', { exact: true })).toBeVisible();
  await expect(page.getByText('/demo/transfers', { exact: true })).toBeVisible();
  await expect(page.getByTestId('request-body')).toContainText('"amount_minor": "2500"');
  await expect(page.getByTestId('curl-preview')).toContainText("curl -X POST");
  await expect(page.getByTestId('curl-preview')).toContainText('/demo/transfers');
  await page.getByRole('button', { name: 'Copy curl' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const navigation = page.getByRole('navigation');
  await expect(navigation.getByRole('link', { name: 'API docs' })).toHaveAttribute(
    'href',
    '/docs',
  );
  await expect(page.getByRole('link', { name: 'OpenAPI' })).toHaveAttribute(
    'href',
    '/openapi.yaml',
  );
  await expect(
    page.getByRole('heading', {
      name: 'The ledger layer for products that move money.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Become a design partner' })).toHaveAttribute(
    'href',
    'mailto:herman.klushin@gmail.com?subject=LuxLedger%20design%20partnership',
  );
  await expect(navigation.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/Crusader4Christ/LuxLedger',
  );
});


test('holds, history and finance reconciliation complete the lifecycle', async ({ page, request }) => {
  await request.post('/demo/reset');
  await page.goto('/');
  await page.getByRole('button', { name: 'Reserve transfer' }).click();
  const holds = page.getByRole('region', { name: 'Transfer holds' });
  await expect(holds.getByText('HELD', { exact: true })).toBeVisible();
  await expect(page.getByTestId('available-balance')).toContainText('Available: 75.00 USD');
  await holds.getByRole('button', { name: 'Commit hold' }).click();
  await expect(holds.getByText('APPLIED', { exact: true })).toBeVisible();
  await expect(page.getByTestId('account-wallet:alice')).toContainText('75.00 USD');
  await page.getByRole('button', { name: 'Reserve transfer' }).click();
  await holds.getByRole('button', { name: 'Void hold' }).click();
  await expect(holds.getByText('VOIDED', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ledger history' })).toContainText('HOLD_VOIDED');
  await page.getByLabel('Demo view').selectOption('finance');
  await expect(page.getByRole('button', { name: 'Reserve transfer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset demo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await expect(page.getByRole('status')).toContainText('Matched: 1');
  await page.getByLabel('Statement amount').fill('99.00');
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await expect(page.getByRole('status')).toContainText('Mismatched: 1');
  await page.getByLabel('Statement reference').fill('missing');
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await expect(page.getByRole('status')).toContainText('Unmatched external: 1');
  await page.getByLabel('Demo view').selectOption('operator');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(holds).toContainText('No holds yet');
  await expect(page.getByTestId('available-balance')).toContainText('Available: 100.00 USD');
});


test('loads details only for the selected account and recovers selection after reset', async ({ page, request }) => {
  await request.post('/demo/reset');
  const detailsRequests: string[] = [];
  page.on('request', req => {
    if (req.url().endsWith('/details')) detailsRequests.push(decodeURIComponent(new URL(req.url()).pathname));
  });
  await page.goto('/');
  await expect(page.getByTestId('available-balance')).toContainText('100.00 USD');
  expect(detailsRequests.every(path => path === '/demo/accounts/wallet:alice/details')).toBe(true);
  await page.getByLabel('History account').selectOption('wallet:bob');
  await expect(page.getByTestId('available-balance')).toContainText('0.00 USD');
  expect(detailsRequests.at(-1)).toBe('/demo/accounts/wallet:bob/details');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await page.getByLabel('History account').selectOption('wallet:carol');
  await expect(page.getByTestId('available-balance')).toContainText('0.00 USD');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByLabel('History account')).toHaveValue('wallet:alice');
  await expect(page.getByTestId('available-balance')).toContainText('100.00 USD');
});

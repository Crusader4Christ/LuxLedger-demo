import { expect, test } from '@playwright/test';

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
});

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
  await expect(page.getByText('/demo/transfers', { exact: true })).toBeVisible();
  await expect(page.getByTestId('request-body')).toContainText('"amount_minor": "2500"');
  await expect(page.getByTestId('curl-preview')).toContainText("curl -X POST");
  await expect(page.getByTestId('curl-preview')).toContainText('/demo/transfers');
  await page.getByRole('button', { name: 'Copy curl' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API docs' })).toHaveAttribute('href', '/docs');
  await expect(page.getByRole('link', { name: 'OpenAPI' })).toHaveAttribute(
    'href',
    '/openapi.yaml',
  );
});

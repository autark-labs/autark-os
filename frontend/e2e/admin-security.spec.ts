import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const setupCode = 'TEST-LOCAL-CODE';
const password = 'correct horse battery';

test('claims an unclaimed appliance without disclosing the local setup proof', async ({ page }) => {
  await installMockApi(page, 'auth-unclaimed');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/storage');

  await expect(page.getByRole('heading', { name: 'Protect this dashboard' })).toBeVisible();
  await expect(page.getByText('sudo autark-os admin setup-code')).toBeVisible();
  await expect(page.getByText(setupCode)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.getByLabel('Confirm setup code').fill(setupCode);
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Claim and continue' }).click();

  await expect(page).toHaveURL(/\/storage$/);
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
  await page.getByRole('button', { name: 'Open system status' }).click();
  await page.locator('button[aria-label="Log out of Autark-OS"]:visible').click();
  await expect(page.getByText('You are logged out. Log in again when you are ready.')).toBeVisible();
});

test('logs in, logs out, and shows the local root recovery handoff', async ({ page }) => {
  await installMockApi(page, 'auth-claimed');
  await page.goto('/home');

  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toBeVisible();
  await expect(page.getByText('sudo autark-os admin reset-password')).toBeVisible();
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().click();
  await expect(page.getByText('You are logged out. Log in again when you are ready.')).toBeVisible();
});

test('an expired cookie session returns an unauthorized deep link to one login flow', async ({ page }) => {
  const auth = await installMockApi(page, 'auth-claimed');
  await page.goto('/backups');
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible();

  auth.expireAdminSession();
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toBeVisible();
  await expect(page).toHaveURL(/\/backups$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

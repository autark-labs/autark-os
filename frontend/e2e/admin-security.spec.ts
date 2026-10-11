import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const setupCode = 'TEST-LOCAL-CODE';
const password = 'correct horse battery';

test('a rejected logout keeps the session visible and offers an honest retry', async ({ page }) => {
  await installMockApi(page, 'auth-claimed');
  await page.goto('/home');
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out of Autark-OS' }).first()).toBeVisible();
  await page.route('**/api/admin/security/logout', (route) => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().click();
  await expect(page.getByText('Log out was not confirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Browser session ended', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toHaveCount(0);
  await page.unroute('**/api/admin/security/logout');
  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().click();
  await expect(page.getByText('You are logged out. Log in again when you are ready.')).toBeVisible();
});

test('a lost successful logout response is reconciled with the server', async ({ page }) => {
  const auth = await installMockApi(page, 'auth-claimed');
  await page.goto('/home');
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out of Autark-OS' }).first()).toBeVisible();
  let checkedAfterLogout = false;
  await page.route('**/api/admin/security/logout', async (route) => {
    auth.expireAdminSession();
    await route.abort('connectionreset');
  });
  page.on('request', (request) => { if (request.url().endsWith('/api/admin/security/session') && request.method() === 'GET') checkedAfterLogout = true; });
  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().click();
  await expect(page.getByText('You are logged out. Log in again when you are ready.')).toBeVisible();
  expect(checkedAfterLogout).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toBeVisible();
});

test('unreachable logout and session checks never claim success', async ({ page }) => {
  await installMockApi(page, 'auth-claimed');
  await page.goto('/home');
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out of Autark-OS' }).first()).toBeVisible();
  await page.route('**/api/admin/security/logout', (route) => route.abort());
  await page.route('**/api/admin/security/session', (route) => route.abort());
  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().click();
  await expect(page.getByText('Log out was not confirmed', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toHaveCount(0);
});

test('only trusted interaction renews the session and logout clears cached data', async ({ page }) => {
  await installMockApi(page, 'auth-claimed');
  let storageReads = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/system/storage') storageReads++; });
  await page.goto('/storage');
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true, level: 1 })).toBeVisible();
  let renewals = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/admin/security/session') && request.method() === 'POST') renewals++; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
  await page.waitForTimeout(500);
  expect(renewals).toBe(0);
  await page.keyboard.press('Shift');
  await expect.poll(() => renewals).toBe(1);
  await page.keyboard.press('Shift');
  expect(renewals).toBe(1);
  // Read the real query cache only after the page has populated it.
  expect(await page.evaluate(async () => (await import('/src/repositories/queryClient.ts')).queryClient.getQueryCache().getAll().length)).toBeGreaterThan(0);
  const readsBeforeLogout = storageReads;
  await page.getByRole('button', { name: 'Log out of Autark-OS' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Unlock this dashboard' })).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/repositories/queryClient.ts')).queryClient.getQueryCache().getAll().length)).toBe(0);
  await page.getByRole('textbox', { name: 'Admin password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true, level: 1 })).toBeVisible();
  await expect.poll(() => storageReads).toBeGreaterThan(readsBeforeLogout);
});

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
  await expect(page.getByRole('heading', { name: 'Storage', exact: true, level: 1 })).toBeVisible();
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

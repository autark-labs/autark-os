import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const appStateConsumerRoutes = [
  '/home',
  '/apps',
  '/apps/found',
  '/discover',
  '/access',
  '/backups',
  '/storage',
  '/activity',
  '/diagnostics',
];

test('every app-state surface identifies preserved data as out of date', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');

  for (const path of appStateConsumerRoutes) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('App information may be out of date', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('a failed first snapshot never renders the My Apps empty state as current', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No managed apps or linked services', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Refresh app information' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No apps installed yet', { exact: true })).toBeHidden();

  await page.goto('/apps/found', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No unresolved existing apps', { exact: true })).toBeHidden();

  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Refresh app information' }).click();
  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeHidden();
  await expect(page.getByText('Vaultwarden with a deliberately long self-hosted service name', { exact: true }).first()).toBeVisible();
});

test('focused Settings and found-app overlays keep the canonical warning visible', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByText('App information may be out of date', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.goto('/apps/found?service=foreign-immich', { waitUntil: 'domcontentloaded' });

  const serviceDialog = page.getByRole('dialog');
  await expect(serviceDialog).toBeVisible();
  await expect(serviceDialog.getByText('App information may be out of date', { exact: true })).toBeVisible();
});

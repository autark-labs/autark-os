import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const appStateConsumerRoutes = [
  '/home',
  '/apps',
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
    await page.getByRole('button', { name: 'App refresh paused', exact: true }).click();
    await expect(page.getByText(/App information may be out of date/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page);
  }
});

test('a failed first snapshot never renders the My Apps empty state as current', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No managed apps or linked services', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'App information unavailable' })).toBeVisible();
  await expect(page.getByText('No apps installed yet', { exact: true })).toBeHidden();

  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeHidden();
  await expect(page.getByText('Vaultwarden with a deliberately long self-hosted service name', { exact: true }).first()).toBeVisible();
});

test('focused Settings keeps the canonical warning visible', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: 'App refresh paused', exact: true }).click();
  await expect(page.getByText(/App information may be out of date/)).toBeVisible();

});

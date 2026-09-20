import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

test.use({ viewport: { height: 844, width: 390 } });

test('canonical app-state failures remain usable on a narrow screen', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'App refresh paused', exact: true }).click();
  await expect(page.getByText(/App information may be out of date/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh app information' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const settingsDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await settingsDialog.getByRole('button', { name: 'App refresh paused', exact: true }).click();
  await expect(page.getByText(/App information may be out of date/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

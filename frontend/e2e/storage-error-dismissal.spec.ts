import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('Storage keeps the last report usable when a refresh error is dismissed', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/storage', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await expect(page.getByRole('heading', { name: /^Storage$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Refresh$/ })).toBeVisible();

  await page.route('**/api/system/storage', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ message: 'Fixture storage refresh failed.' }),
      contentType: 'application/json',
      status: 503,
    });
  });

  await page.getByRole('button', { name: /^Refresh$/ }).click();
  await expect(page.getByRole('alert')).toContainText('Storage data could not refresh');
  await page.getByRole('button', { name: /Dismiss Storage data could not refresh/i }).click();

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Storage$/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

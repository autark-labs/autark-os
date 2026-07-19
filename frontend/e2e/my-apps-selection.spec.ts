import { expect, test, type Page } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

async function openApps(page: Page) {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

test('clicking a Basic-view app title selects the app for the details rail', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'Grid view' }).click();

  await page.getByRole('button', { name: /Select Vaultwarden with a deliberately long/i }).click();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

test('clicking a non-action area of an Advanced-view row selects the app for the details rail', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'List view' }).click();

  const firstRow = page.getByTestId('advanced-table-scroll-area').locator('tbody tr').first();
  await firstRow.locator('td').nth(3).click();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

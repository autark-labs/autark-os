import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('Storage keeps details in the in-page workspace and retains cleanup confirmation', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/storage', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await expect(page.getByRole('heading', { name: /^Storage$/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Overview$/i })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Vaultwarden with a deliberately long/i }).first().click();

  await expect(page.getByRole('tab', { name: /^App data$/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/storage\?tab=apps&app=vaultwarden$/);
  await expect(page.locator('img[src="/app-images/vaultwarden.svg"]').first()).toBeVisible();
  await expect(page.getByText('Managed app storage')).toBeVisible();

  await page.getByRole('tab', { name: /^Cleanup$/i }).click();
  await expect(page).toHaveURL(/\/storage\?tab=cleanup$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^Review$/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Clean up unused app data/i);
  await expectNoHorizontalOverflow(page);
});

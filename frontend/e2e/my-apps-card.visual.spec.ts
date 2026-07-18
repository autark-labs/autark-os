import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('My Apps basic cards use the compact homepage launcher treatment', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await page.getByRole('button', { name: /^Basic$/i }).click();
  await expect(page.getByText(/My Apps/i).first()).toBeVisible();
  const manageButton = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i });
  await expect(manageButton).toBeVisible();
  await page.getByRole('button', { name: /Vaultwarden with a deliberately long.*actions/i }).click();
  await expect(page.getByRole('menuitem', { name: /Restart app/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/my-apps-basic-final.png', fullPage: false });

  await manageButton.click();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

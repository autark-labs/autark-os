import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('Storage keeps the last report and focus stable while refresh context is closed', async ({ page }) => {
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

  const heading = page.getByRole('heading', { name: 'Storage', exact: true });
  const before = await heading.boundingBox();
  await page.getByRole('button', { name: /^Refresh$/ }).click();
  const chip = page.getByRole('button', { name: 'Refresh paused', exact: true });
  await expect(chip).toBeVisible();
  expect(await heading.boundingBox()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await chip.click();
  await expect(page.getByText('Fixture storage refresh failed.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chip).toBeFocused();
  await expect(chip).toBeVisible();

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Storage$/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

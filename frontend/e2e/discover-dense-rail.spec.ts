import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

async function openDiscover(page: Parameters<typeof installMockApi>[0], viewport: { width: number; height: number }) {
  await installMockApi(page, 'ready');
  await page.setViewportSize(viewport);
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

test('wide Discover keeps a selected app in the dense launcher detail rail', async ({ page }) => {
  await openDiscover(page, { width: 1280, height: 960 });

  const rail = page.getByLabel('Selected Discover app');
  await expect(rail).toContainText('Vaultwarden');
  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(rail).toContainText('Immich');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/discover-dense-rail-wide.png', fullPage: false });
});

test('narrow Discover opens the selected app in the full review sheet', async ({ page }) => {
  await openDiscover(page, { width: 390, height: 844 });

  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(page.getByRole('dialog')).toContainText('Immich');
  await expectNoHorizontalOverflow(page);
});

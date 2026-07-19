import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

async function openDiscover(page: Parameters<typeof installMockApi>[0], viewport: { width: number; height: number }) {
  await installMockApi(page, 'ready');
  await page.setViewportSize(viewport);
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

test('wide Discover keeps a selected app in the dense launcher detail rail', async ({ page }) => {
  await openDiscover(page, { width: 1440, height: 960 });

  const rail = page.getByLabel('Selected Discover app');
  await expect(rail).toContainText('Vaultwarden');
  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(rail).toContainText('Immich');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rail).toContainText('App details');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/discover-dense-rail-wide.png', fullPage: false });
  await page.getByRole('button', { name: 'App details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const detailDrawer = page.getByLabel('Discover app details');
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(detailDrawer.getByRole('tab', { name: 'Details' })).toBeVisible();
  await rail.getByRole('heading', { name: 'Immich' }).click();
  await expect(detailDrawer).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: 'App details' }).click();
  await expect(detailDrawer).toHaveAttribute('aria-hidden', 'false');
  await detailDrawer.getByRole('tab', { name: 'Details' }).click();
  await expect(detailDrawer).toContainText('App details');
  await detailDrawer.getByRole('button', { name: 'Advanced app info' }).click();
  await expect(detailDrawer).toHaveCSS('overflow-y', 'hidden');
  await expect.poll(() => detailDrawer.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/discover-app-drawer.png', fullPage: false });

  await detailDrawer.getByRole('tab', { name: 'Overview' }).click();
  await detailDrawer.getByRole('button', { name: 'Install second copy' }).click();
  const duplicateDialog = page.getByRole('dialog').filter({ hasText: 'Install a second copy?' });
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByRole('button', { name: 'Install second copy anyway' }).click();
  const installDialog = page.getByRole('dialog').filter({ hasText: 'Install Immich' });
  await expect(installDialog).toBeVisible();
  await expect(installDialog).toContainText('Install plan');
  await expect(installDialog).toContainText('Create the app');
  await expect(installDialog.getByRole('button', { name: 'Install app' })).toBeDisabled();
  await installDialog.getByLabel('Confirm install plan').click();
  await expect(installDialog.getByRole('button', { name: 'Install app' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/discover-install-review.png', fullPage: false });
});

test('narrow Discover opens the selected app in the full review sheet', async ({ page }) => {
  await openDiscover(page, { width: 390, height: 844 });

  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(page.getByRole('dialog')).toContainText('Immich');
  await expectNoHorizontalOverflow(page);
});

import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('Storage preserves recommendation severity and priority over blocked cleanup', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/storage');
  const report = await page.evaluate(async () => (await fetch('/api/system/storage')).json());
  report.status = 'healthy';
  report.orphanedData = [];
  report.recommendations = [{ id: 'disk-healthy', tone: 'success', title: 'Storage looks healthy', message: 'Enough space remains.', actionLabel: null }];
  await page.route('**/api/system/storage', route => route.fulfill({ json: report }));
  await page.reload();
  await expect(page.getByText('Storage looks healthy', { exact: true }).locator('..')).toHaveClass(/bg-app-status-success-surface/);
  await expect(page.getByText('Review recommended', { exact: true })).toHaveCount(0);
  report.status = 'critical';
  report.orphanedData = [{ name: 'blocked-folder', path: '/fixture/blocked', usedBytes: 8000, cleanupAllowed: false, cleanupBlockedReason: 'A running container uses this folder.' }];
  report.recommendations = [
    { id: 'disk-critical', tone: 'danger', title: 'Free up space soon', message: 'The host disk is critically full.', actionLabel: 'Review largest apps' },
    { id: 'orphaned-data', tone: 'warning', title: 'Unused app data found', message: 'Review folders before cleanup.', actionLabel: 'Review unused data' },
  ];
  await page.reload();
  const capacity = page.getByText('Free up space soon', { exact: true });
  await expect(capacity.locator('..')).toHaveClass(/bg-app-status-danger-surface/);
  expect((await capacity.boundingBox())!.y).toBeLessThan((await page.getByText('Unused app data found', { exact: true }).boundingBox())!.y);
  await expect(page.getByText(/can be reclaimed after review/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Open cleanup workspace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled();
  await expect(page.getByText(/Cleanup blocked: A running container/)).toBeVisible();
});

test('Storage measurement failure stays unavailable in capacity and advanced details', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/storage');
  const report = await page.evaluate(async () => (await fetch('/api/system/storage')).json());
  report.status = 'warning';
  report.headline = 'Storage has a few notes';
  report.summary = 'Autark-OS could not measure the host disk. Check runtime storage access, then refresh.';
  Object.assign(report.hostDisk, { usedPercent: -1, totalBytes: -1, usedBytes: -1, usableBytes: -1 });
  report.recommendations = [{ id: 'disk-unavailable', tone: 'warning', title: 'Disk usage is unavailable', message: report.summary, actionLabel: null }];
  await page.route('**/api/system/storage', route => route.fulfill({ json: report }));
  await page.reload();
  await expect(page.getByText('Disk usage is unavailable', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Advanced', exact: true }).click();
  const host = page.getByText('Host disk', { exact: true }).locator('../../..');
  await expect(host.getByText('Unknown', { exact: true })).toHaveClass(/bg-app-status-muted-surface/);
  await expect(host.getByText('Unavailable', { exact: true })).toHaveCount(3);
});

test('checkpointed cleanup refreshes the cached Home summary before its polling interval', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  await expect(page.getByRole('region', { name: 'Your Apps' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Fixture/ })).toBeVisible();
  const summary = await page.evaluate(async () => (await fetch('/api/system-summary')).json());
  await page.route('**/api/system-summary', (route) => route.fulfill({ json: { ...summary, deviceName: 'Cleaned' } }));
  let cleaned = false;
  await page.route('**/api/system/storage/orphans/*/cleanup', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(new URL(route.request().url()).pathname).toBe('/api/system/storage/orphans/old-paperless-import/cleanup');
    cleaned = true;
    return route.fulfill({ json: { message: 'Cleanup complete.', safetyCheckpointPath: '/fixture/checkpoint.tar' } });
  });
  await page.locator('a[href="/storage"]').first().click();
  await page.getByRole('tab', { name: /^Cleanup$/ }).click();
  await page.getByRole('button', { name: /^Review$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type `old-paperless-import` to confirm').fill('old-paperless-import');
  await dialog.getByRole('button', { name: 'Create checkpoint and remove' }).click();
  await expect(dialog).toBeHidden();
  expect(cleaned).toBe(true);
  await page.locator('a[href="/home"]').first().click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1, name: /Cleaned/ })).toBeVisible();
});

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

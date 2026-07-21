import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

const fixedAt = '2025-01-15T12:00:00.000Z';

test('Activity Log keeps activity, attention, and system metrics in one bounded workspace', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.route('**/api/apps/reliability', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        posture: 'warning',
        headline: 'One app needs a review',
        summary: 'Most managed apps are ready.',
        totalApps: 3,
        readyApps: 2,
        startingApps: 0,
        pausedApps: 0,
        needsAttentionApps: 1,
        unavailableApps: 0,
        privateApps: 2,
        autoRepairEnabledApps: 2,
        recentSuccessfulRepairs: 1,
        recentFailedRepairs: 0,
        issues: [{ appId: 'paperless-ngx', appName: 'Paperless-ngx', status: 'Needs review', message: 'Storage review is available.', detail: 'An unused import folder is safe to review.', suggestedAction: 'Open My Apps', repairAvailable: false, checkedAt: fixedAt }],
        recentActivity: [],
        checkedAt: fixedAt,
      }),
      contentType: 'application/json',
    });
  });
  await page.route('**/api/monitoring/history*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        windowMinutes: 60,
        retentionMinutes: 1440,
        windowLabel: 'Last 60 minutes',
        hostSamples: [{ systemCpuPercent: 12, processCpuPercent: 1, usedMemoryPercent: 46, runtimeUsedPercent: 9, totalMemoryBytes: 8_000_000_000, freeMemoryBytes: 4_320_000_000, runtimeTotalBytes: 1_000_000_000_000, runtimeUsableBytes: 430_000_000_000, sampledAt: fixedAt }],
        appSamples: [{ appId: 'vaultwarden', cpuPercent: 3, memoryPercent: 4, memoryUsage: '184 MB', sampledAt: fixedAt }],
        checkedAt: fixedAt,
      }),
      contentType: 'application/json',
    });
  });
  await page.route('**/api/activity*', async (route) => {
    await route.fulfill({
      body: JSON.stringify([
        { id: 12, level: 'success', category: 'pro', action: 'cutover', title: 'Pro agent cutover completed', message: 'Autark-OS recorded a cutover event with outcome completed.', appId: null, outcome: 'completed', details: '{"component":"autark-pro-agent","digestPrefix":"sha256:aaaaaaaaaaaa","outcome":"completed"}', createdAt: fixedAt },
        { id: 11, level: 'warning', category: 'system', action: 'review_storage', title: 'Storage review is available', message: 'An unused folder can be reviewed safely.', appId: null, outcome: 'needs_attention', details: 'Fixture warning detail', createdAt: fixedAt },
        { id: 10, level: 'success', category: 'repair', action: 'restart_worker', title: 'App recovered automatically', message: 'Paperless-ngx is responding again.', appId: 'paperless-ngx', outcome: 'completed', details: 'Fixture repair detail', createdAt: '2025-01-15T11:54:00.000Z' },
        { id: 9, level: 'success', category: 'backup', action: 'verify_backup', title: 'Backup verified', message: 'A restore point is ready.', appId: 'vaultwarden', outcome: 'completed', details: 'Fixture backup detail', createdAt: '2025-01-15T11:42:00.000Z' },
      ]),
      contentType: 'application/json',
    });
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/activity', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await expect(page.getByRole('heading', { name: /^Activity Log$/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'All activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByText('Storage review is available').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'All levels' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('tab', { name: 'Pro lifecycle' }).click();
  await expect(page.getByRole('tab', { name: 'Pro lifecycle' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Pro agent cutover completed').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Technical detail/ })).toBeVisible();

  await page.getByRole('tab', { name: 'System metrics' }).click();
  await expect(page.getByText('Device CPU')).toBeVisible();
  await expect(page.getByText('Autark-OS disk')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autark-OS metrics' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/activity?category=pro', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Pro lifecycle' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Pro agent cutover completed').first()).toBeVisible();
});

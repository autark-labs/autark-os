import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';
import type { AutarkOsJob } from '../src/types/jobs';

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
  await page.getByRole('tab', { name: 'Technical details', exact: true }).click();
  const host = page.getByText('Host disk', { exact: true }).locator('../../..');
  await expect(host.getByText('Unknown', { exact: true })).toHaveClass(/bg-app-status-muted-surface/);
  await expect(host.getByText('Unavailable', { exact: true })).toHaveCount(3);
});

for (const fails of [false, true]) {
test(`cleanup ${fails ? 'failure' : 'success'} survives closing and reload, blocks duplicates and refreshes Home`, async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  await expect(page.getByRole('region', { name: 'Your Apps' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Fixture/ })).toBeVisible();
  const summary = await page.evaluate(async () => (await fetch('/api/system-summary')).json());
  const report = await page.evaluate(async () => (await fetch('/api/system/storage')).json());
  const jobs: AutarkOsJob[] = [];
  let finished = false;
  let submissions = 0;
  let cancellations = 0;
  await page.route('**/api/system-summary', route => route.fulfill({ json: { ...summary, deviceName: finished ? 'Cleanup reviewed' : summary.deviceName } }));
  await page.route('**/api/system/storage', route => route.fulfill({ json: { ...report, orphanedData: finished && !fails ? [] : report.orphanedData } }));
  await page.route('**/api/jobs', route => route.fulfill({ json: jobs }));
  await page.route('**/api/jobs/*/cancel', route => { cancellations++; return route.fulfill({ status: 409, json: {} }); });
  await page.route('**/api/system/storage/orphans/*/cleanup', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(new URL(route.request().url()).pathname).toBe('/api/system/storage/orphans/old-paperless-import/cleanup');
    submissions++;
    jobs.push({ jobId: 'cleanup-1', type: 'storage_cleanup', subjectId: 'old-paperless-import', status: 'running', currentStep: 'archive', steps: [{ id: 'archive', label: 'Create manual recovery archive', status: 'running', message: 'Archiving declared app data.' }], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z' });
    return route.fulfill({ json: jobs[0] });
  });
  await page.locator('a[href="/storage"]').first().click();
  await page.getByRole('tab', { name: /^Cleanup$/ }).click();
  await page.getByRole('button', { name: /^Review$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('not a Backups restore point');
  await expect(dialog).toContainText('deletes this unused folder and its contents');
  await expect(dialog.getByRole('button', { name: 'Archive and remove folder' })).toBeDisabled();
  await dialog.getByLabel('Type `old-paperless-import` to confirm').fill('old-paperless-import');
  await dialog.getByRole('button', { name: 'Archive and remove folder' }).click();
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*running/ })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Closing does not cancel cleanup');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*running/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Archive and remove folder' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.locator('a[href="/backups"]').first().click();
  await expect(page.getByRole('button', { name: 'Cleanup in progress', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up all', exact: true })).toBeDisabled();
  await page.locator('a[href="/home"]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: /Fixture/ })).toBeVisible();
  finished = true;
  jobs[0].status = fails ? 'failed' : 'succeeded';
  jobs[0].updatedAt = '2025-01-15T12:01:00Z';
  jobs[0].steps[0].status = fails ? 'failed' : 'succeeded';
  jobs[0].steps[0].message = fails ? 'Archive could not be created. Folder was not removed.' : 'Unused folder removed.';
  if (fails) jobs[0].error = { code: 'cleanup_failed', message: jobs[0].steps[0].message, advancedDetails: {} };
  await expect(page.getByRole('heading', { level: 1, name: /Cleanup\./ })).toBeVisible();
  await page.locator('a[href="/storage"]').first().click();
  await page.getByRole('tab', { name: 'Cleanup', exact: true }).click();
  if (fails) await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeEnabled();
  else await expect(page.getByText('Autark-OS did not find unused app data.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByLabel('Activity', { exact: true })).toContainText(`Storage cleanup ${fails ? 'failed' : 'completed'}`);
  expect(submissions).toBe(1);
  expect(cancellations).toBe(0);
});
}

test('cleanup keeps last known progress during a status outage and retry recovers it', async ({ page }) => {
  await installMockApi(page, 'idle');
  let unavailable = false;
  const job: AutarkOsJob = { jobId: 'cleanup-1', type: 'storage_cleanup', subjectId: 'old-paperless-import', status: 'running', currentStep: 'archive', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z' };
  await page.route('**/api/jobs', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } })
    : route.fulfill({ json: [job] }));
  await page.route('**/api/jobs/cleanup-1', route => route.fulfill({ json: job }));
  await page.goto('/storage?tab=cleanup');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*running/ })).toBeVisible();
  unavailable = true;
  await expect(dialog).toContainText('Cleanup status could not be refreshed.', { timeout: 15_000 });
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*running/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Archive and remove folder' })).toHaveCount(0);
  unavailable = false;
  job.status = 'succeeded';
  await dialog.getByRole('button', { name: 'Retry status' }).click();
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*succeeded/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry status' })).toHaveCount(0);
});

test('a tracked cleanup outside the recent list refreshes Storage on per-job completion', async ({ page }) => {
  await installMockApi(page, 'idle');
  const job: AutarkOsJob = { jobId: 'cleanup-1', type: 'storage_cleanup', subjectId: 'old-paperless-import', status: 'running', currentStep: 'archive', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z' };
  let listed = true;
  let storageReads = 0;
  await page.route('**/api/system/storage', async route => {
    storageReads++;
    await route.fallback();
  });
  await page.route('**/api/jobs', route => route.fulfill({ json: listed ? [job] : [] }));
  await page.route('**/api/jobs/cleanup-1', route => route.fulfill({ json: job }));
  await page.goto('/storage?tab=cleanup');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*running/ })).toBeVisible();
  listed = false;
  await page.waitForResponse(response => response.url().endsWith('/api/jobs/cleanup-1'));
  const beforeCompletion = storageReads;
  job.status = 'succeeded';
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*succeeded/ })).toBeVisible();
  await expect.poll(() => storageReads).toBeGreaterThan(beforeCompletion);
});

test('an immediately failed cleanup remains reviewable and retry requires fresh confirmation', async ({ page }) => {
  await installMockApi(page, 'idle');
  const jobs: AutarkOsJob[] = [];
  let submissions = 0;
  await page.route('**/api/jobs', route => route.fulfill({ json: jobs }));
  await page.route('**/api/system/storage/orphans/*/cleanup', route => {
    submissions++;
    const job: AutarkOsJob = { jobId: `cleanup-${submissions}`, type: 'storage_cleanup', subjectId: 'old-paperless-import', status: submissions === 1 ? 'failed' : 'succeeded', currentStep: 'remove', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z', error: submissions === 1 ? { code: 'cleanup_failed', message: 'Folder removal did not finish. Archive retained.', advancedDetails: {} } : null };
    jobs.unshift(job);
    return route.fulfill({ json: job });
  });
  await page.goto('/storage?tab=cleanup');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type `old-paperless-import` to confirm').fill('old-paperless-import');
  await dialog.getByRole('button', { name: 'Archive and remove folder' }).click();
  await expect(dialog).toContainText('Folder removal did not finish. Archive retained.');
  await dialog.getByRole('button', { name: 'Review cleanup again' }).click();
  await expect(dialog.getByRole('button', { name: 'Archive and remove folder' })).toBeDisabled();
  await dialog.getByLabel('Type `old-paperless-import` to confirm').fill('old-paperless-import');
  await dialog.getByRole('button', { name: 'Archive and remove folder' }).click();
  await expect(dialog.getByRole('region', { name: /Storage cleanup.*succeeded/ })).toBeVisible();
  expect(submissions).toBe(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeFocused();
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
  await expect(page.getByRole('button', { name: 'Copy path', exact: true })).toBeHidden();
  const technicalDetails = page.getByRole('tabpanel', { name: 'App data', exact: true }).locator('summary', { hasText: 'Technical details' });
  await technicalDetails.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Copy path', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /^Cleanup$/i }).click();
  await expect(page).toHaveURL(/\/storage\?tab=cleanup$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^Review$/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Clean up unused app data/i);
  await expectNoHorizontalOverflow(page);
});

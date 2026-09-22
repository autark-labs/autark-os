import { expect, test, type Page } from 'playwright/test';
import { installMockApi, expectNoHorizontalOverflow } from './support/mockApi';
import type { BackupReport, RestorePoint } from '../src/types/backup';
import type { AutarkOsJob } from '../src/types/jobs';

async function fixture(page: Page) {
  await installMockApi(page, 'idle');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/backups');
  const report: BackupReport = await page.evaluate(async () => (await fetch('/api/backups')).json());
  const point = report.recentRestorePoints[0];
  const state = { jobs: [] as AutarkOsJob[], planRequests: 0, planFails: false, restoreFails: false, immediate: false, failVerify: false, mutationCount: 0, restoreRequests: [] as unknown[] };
  function verify(status: string) {
    for (const item of [point, ...report.recentRestorePoints, ...report.apps.flatMap(app => [app.latestBackup, ...app.restorePoints])].filter((p): p is RestorePoint => Boolean(p))) {
      if (item.id !== point.id) continue;
      item.verificationStatus = status;
      item.restoreConfidence = status === 'verified' ? 'high' : 'unknown';
      item.verificationMessage = status === 'verified' ? 'Verification succeeded.' : status === 'failed' ? 'Checksum did not match.' : 'Not checked.';
      item.verifiedAt = status === 'not_checked' ? null : new Date().toISOString();
    }
  }
  verify('not_checked');
  function finish() {
    const job = state.jobs[0];
    job.status = state.failVerify ? 'failed' : 'succeeded';
    job.updatedAt = new Date().toISOString();
    if (state.failVerify) job.error = { code: 'verification_failed', message: 'Checksum did not match.' };
    verify(state.failVerify ? 'failed' : 'verified');
  }
  await page.route('**/api/backups', route => route.fulfill({ json: report }));
  await page.route('**/api/jobs', route => route.fulfill({ json: state.jobs }));
  await page.route('**/api/jobs/*', route => route.fulfill({ json: state.jobs.find(job => route.request().url().endsWith(job.jobId)) }));
  await page.route('**/api/backups/restore-points/*/plan*', route => {
    state.planRequests++;
    return state.planFails ? route.fulfill({ status: 503, json: { message: 'Plan check unavailable.' } }) : route.fulfill({ json: {
      restorePointId: point.id, targetAppId: new URL(route.request().url()).searchParams.get('appId'), title: 'Restore Vaultwarden',
      summary: point.verificationStatus === 'verified' ? 'Verified plan ready.' : 'Verification required.',
      executable: point.verificationStatus === 'verified', warnings: ['A safety backup is created before restoring.'],
      steps: ['Stop the app.', 'Replace app data.', 'Start the app.'], dryRunDetails: [], affectedApps: ['Vaultwarden'],
      verificationStatus: point.verificationStatus, simulation: { status: 'passed', message: 'Checked.', details: [] },
    } });
  });
  await page.route('**/api/backups/restore-points/*/verify', route => {
    state.mutationCount++;
    state.jobs = [{ jobId: `verify-${state.mutationCount}`, type: 'backup_verify', status: 'running', subjectId: String(point.id), steps: [], currentStep: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as AutarkOsJob];
    if (state.immediate) finish();
    return route.fulfill({ json: state.jobs[0] });
  });
  await page.route('**/api/backups/restore-points/*/restore', route => {
    state.restoreRequests.push(route.request().postDataJSON());
    return state.restoreFails ? route.fulfill({ status: 409, json: { message: 'Archive changed; restore rejected.' } })
      : route.fulfill({ json: { ...state.jobs[0], jobId: 'restore-1', type: 'backup_restore', status: 'succeeded', subjectId: `${point.id}:vaultwarden` } });
  });
  await page.reload();
  return { state, point, report, verify, finish };
}

for (const immediate of [false, true]) {
  for (const failVerify of [false, true]) {
    test(`open details follow ${immediate ? 'immediate' : 'polled'} ${failVerify ? 'failed' : 'successful'} verification and retry`, async ({ page }) => {
      const { state, finish } = await fixture(page);
      state.immediate = immediate;
      state.failVerify = failVerify;
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('Not verified yet.');
      await expect(dialog).toContainText('Verification required.');
      const planCount = state.planRequests;
      await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
      if (!immediate) {
        await expect(dialog.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
        finish();
      }
      await expect(dialog).toContainText(failVerify ? 'Verification failed. Do not restore' : 'Verified with high confidence.');
      await expect.poll(() => state.planRequests).toBeGreaterThan(planCount);
      await expect(dialog.getByRole('button', { name: 'Verify', exact: true })).toBeEnabled();
      if (failVerify) {
        state.failVerify = false;
        state.immediate = true;
        await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
        await expect(dialog).toContainText('Verified with high confidence.');
      }
      await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
      await expect(dialog).toContainText('A safety backup is created before restoring.');
      expect(state.restoreRequests).toEqual([]);
      state.restoreFails = true;
      await dialog.getByRole('button', { name: 'Restore now', exact: true }).click();
      await expect(dialog).toContainText('Archive changed; restore rejected.');
      await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
      await dialog.getByRole('button', { name: 'Retry plan', exact: true }).click();
      await expect(dialog.getByRole('alert').filter({ hasText: 'Archive changed; restore rejected.' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('main').getByRole('button', { name: 'Details', exact: true })).toBeFocused();
      await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
}

test('reload recovers verification progress, missing restore points stay unavailable', async ({ page }) => {
  const { state, report, finish } = await fixture(page);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Verify', exact: true }).click();
  await expect.poll(() => state.jobs.length).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Backup in progress', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled();
  finish();
  report.recentRestorePoints = [];
  report.apps.forEach(app => { app.restorePoints = []; app.latestBackup = null; });
  await expect(dialog).toContainText('Restore point unavailable');
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toHaveCount(0);
});

test('failed plan retries in place without enabling destructive confirmation', async ({ page }) => {
  const { state, verify } = await fixture(page);
  verify('verified');
  state.planFails = true;
  await page.reload();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Plan check unavailable.');
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog).toContainText('Restore plan unavailable');
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toHaveCount(0);
  state.planFails = false;
  await dialog.getByRole('button', { name: 'Retry plan', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
  await expect(dialog.getByText('Archive verification', { exact: true })).toBeHidden();
  await dialog.locator('summary', { hasText: 'Technical restore details' }).click();
  await expect(dialog.getByText('Archive verification', { exact: true })).toBeVisible();
  await expect(dialog.getByText('What will change', { exact: true })).toBeVisible();
  expect(state.restoreRequests).toEqual([]);
});

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
  const state = { restoreJobId: 'restore-1', jobs: [] as AutarkOsJob[], planRequests: 0, planFails: false, restoreFails: false, immediate: false, failVerify: false, mutationCount: 0, restoreRequests: [] as unknown[] };
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
  const points = () => [...new Map([...report.apps.flatMap(app => app.restorePoints), ...report.recentRestorePoints].map(item => [item.id, item])).values()];
  await page.route(/\/api\/backups\/restore-points(?:\?.*)?$/, route => route.fulfill({ json: { items: points(), nextBeforeId: null } }));
  await page.route(/\/api\/backups\/restore-points\/\d+$/, route => {
    const item = points().find(item => item.id === Number(route.request().url().split('/').at(-1)));
    return route.fulfill(item ? { json: item } : { status: 404, json: { message: 'Restore point was not found.' } });
  });
  await page.route('**/api/jobs', route => route.fulfill({ json: state.jobs }));
  await page.route('**/api/jobs/*', route => {
    const job = state.jobs.find(job => route.request().url().endsWith(job.jobId));
    return route.fulfill(job ? { json: job } : { status: 404, json: { message: 'Job not found.' } });
  });
  await page.route('**/api/backups/restore-points/*/plan*', route => {
    state.planRequests++;
    return state.planFails ? route.fulfill({ status: 503, json: { message: 'Plan check unavailable.' } }) : route.fulfill({ json: {
      planId: 'review-fixture', jobId: state.restoreJobId, apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', status: 'restorable', message: 'Ready to restore.' }], blockedReasons: [],
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
      expect(state.planRequests).toBe(0);
      const planCount = state.planRequests;
      await dialog.getByRole('button', { name: /^Verify( again)?$/ }).click();
      if (!immediate) {
        await expect(dialog.getByRole('button', { name: /^Verify( again)?$/ })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
        finish();
      }
      await expect(dialog).toContainText(failVerify ? 'Verification failed. Do not restore' : 'Verified with high confidence.');
      expect(state.planRequests).toBe(planCount);
      await expect(dialog.getByRole('button', { name: /^Verify( again)?$/ })).toBeEnabled();
      if (failVerify) {
        state.failVerify = false;
        state.immediate = true;
        await dialog.getByRole('button', { name: /^Verify( again)?$/ }).click();
        await expect(dialog).toContainText('Verified with high confidence.');
      }
      await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
      await expect(dialog).toContainText('A safety backup is created before restoring.');
      expect(state.restoreRequests).toEqual([]);
      state.restoreFails = true;
      await dialog.getByRole('button', { name: 'Restore now', exact: true }).click();
      await expect(dialog).toContainText('Archive changed; restore rejected.');
      await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeDisabled();
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
  await page.getByRole('dialog').getByRole('button', { name: /^Verify( again)?$/ }).click();
  await expect.poll(() => state.jobs.length).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Backup in progress', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /^Verify( again)?$/ })).toBeDisabled();
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
  expect(state.planRequests).toBe(0);
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

test('UF06 explicit missing archive never substitutes a newer restore point', async ({ page }) => {
  await fixture(page);
  await page.goto('/backups?backup=999999');
  await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
  await expect(page.getByText(/restore point unavailable/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review restore plan', exact: true })).toHaveCount(0);
});

test('UF06 saved verification and ordinary details never start verification or planning', async ({ page }) => {
  const { state, verify } = await fixture(page);
  verify('verified');
  await page.reload();
  await page.getByRole('button', { name: 'View verification', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1500 });
  expect(state.mutationCount).toBe(0);
  expect(state.planRequests).toBe(0);
});

test('UF06 details are metadata only', async ({ page }) => {
  const { state } = await fixture(page);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Not verified yet.');
  expect(state.planRequests).toBe(0);
});

for (const width of [390, 1440]) {
  test(`UF06 retained removed-app archive is reachable beyond the first page at ${width}px`, async ({ page }) => {
    const { point } = await fixture(page);
    await page.setViewportSize({ width, height: 960 });
    const newer = Array.from({ length: 50 }, (_, index) => ({ ...point, id: 200 - index }));
    const removed = { ...point, id: 42, appId: 'removed-notes', appName: 'Removed Notes', includedAppIds: 'removed-notes', source: 'manual', path: '/backups/removed-notes.tar' };
    await page.route(/\/api\/backups\/restore-points(?:\?.*)?$/, route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('beforeId')
      ? { items: [removed], nextBeforeId: null } : { items: newer, nextBeforeId: 151 } }));
    await page.route('**/api/backups/restore-points/42', route => route.fulfill({ json: removed }));
    await page.reload();
    await page.getByRole('button', { name: 'Load older archives', exact: true }).click();
    await page.getByRole('button', { name: /removed-notes-.*autark-backup/i }).click();
    await expect(page).toHaveURL(/backup=42/);
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Removed Notes restore point details');
    await expect(dialog).toContainText('Archive deletion is not yet available');
    await expect(dialog).toContainText('/backups/removed-notes.tar');
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
    await expect(page.locator('p:visible').filter({ hasText: /^Removed Notes$/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('UF06 a delayed plan for another archive cannot replace the selected plan', async ({ page }) => {
  const { point, report, verify } = await fixture(page);
  verify('verified');
  const other = { ...point, id: 102, appId: 'other-app', appName: 'Other app', includedAppIds: 'other-app' };
  report.recentRestorePoints.push(other);
  let releaseFirst: () => void = () => {};
  const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstRequested = false;
  await page.route('**/api/backups/restore-points/*/plan*', async route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    if (id === point.id) { firstRequested = true; await firstHeld; }
    await route.fulfill({ json: { jobId: `restore-${id}`, planId: `review-${id}`, restorePointId: id, targetAppId: null, title: id === point.id ? 'Old delayed plan' : 'Selected other plan', summary: 'Review this exact archive.', executable: true, affectedApps: [id === point.id ? 'Vaultwarden' : 'Other app'], apps: [], blockedReasons: [], steps: [], warnings: [], dryRunDetails: [], simulation: { status: 'passed', message: 'Checked.', details: [] } } });
  });
  await page.goto(`/backups?backup=${point.id}`);
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  await expect.poll(() => firstRequested).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'All backups', exact: false }).click();
  await page.getByRole('button', { name: /other-app-.*autark-backup/i }).click();
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Selected other plan');
  const latePlanResponse = page.waitForResponse(response => response.url().includes(`/restore-points/${point.id}/plan`));
  releaseFirst();
  await latePlanResponse;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('dialog')).not.toContainText('Old delayed plan');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
});

test('UF06 accepted restore with a lost response reconciles its exact job and survives Close and reload', async ({ page }) => {
  const { point, state, verify } = await fixture(page);
  state.restoreJobId = 'lost-response-restore';
  verify('verified');
  await page.route('**/api/backups/restore-points/*/restore', async route => {
    state.restoreRequests.push(route.request().postDataJSON());
    state.jobs = [{ jobId: 'lost-response-restore', type: 'backup_restore', subjectId: `${point.id}:all`, status: 'running', steps: [{ id: 'restore_data', label: 'Restoring Vaultwarden data', status: 'running' }], currentStep: 'restore_data', createdAt: '2020-01-01T00:00:00Z', updatedAt: new Date().toISOString() } as AutarkOsJob];
    await route.abort('failed');
  });
  await page.reload();
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Restore now', exact: true }).click();
  await expect(dialog).toContainText('Restoring Vaultwarden data');
  await expect(dialog).toContainText('continues after you close');
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  expect(state.restoreRequests).toEqual([{ appId: null, planId: 'review-fixture' }]);
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.reload();
  await page.getByRole('button', { name: 'Backup in progress', exact: true }).click();
  await expect(page.getByText('Restoring Vaultwarden data').first()).toBeVisible();
  expect(state.restoreRequests).toHaveLength(1);
});

test('UF06 missing full-archive members block all-app restore and an explicit subset names exclusions', async ({ page }) => {
  const { point, report, state, verify } = await fixture(page);
  verify('verified');
  Object.assign(point, { scope: 'full', includedAppIds: 'vaultwarden,removed-notes,blocked-app', appId: '__full__', appName: 'All apps' });
  report.recentRestorePoints = [point];
  await page.route('**/api/backups/restore-points/*/plan*', route => {
    const appId = new URL(route.request().url()).searchParams.get('appId');
    return route.fulfill({ json: { jobId: 'restore-1', planId: appId ? 'review-vaultwarden' : 'review-all', restorePointId: point.id, targetAppId: appId, title: 'Review full archive', summary: appId ? 'Restore Vaultwarden only.' : 'Some included apps are not ready.', executable: Boolean(appId), affectedApps: ['Vaultwarden'], apps: [
      { appId: 'vaultwarden', appName: 'Vaultwarden', status: 'restorable', message: 'Managed app is ready.' },
      { appId: 'removed-notes', appName: 'Removed Notes', status: appId ? 'excluded' : 'missing', message: appId ? 'Outside the selected scope.' : 'Recover this app before restoring it.' },
      { appId: 'blocked-app', appName: 'Blocked app', status: appId ? 'excluded' : 'blocked', message: appId ? 'Outside the selected scope.' : 'Resolve its storage contract before restoring.' },
    ], blockedReasons: appId ? [] : ['Recover or resolve all included apps, or choose a single ready app.'], steps: ['Stop only selected apps.'], warnings: ['A verified safety copy is required.'], dryRunDetails: [], simulation: { status: 'passed', message: 'Checked.', details: [] } } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Removed Notes — Not currently managed');
  await expect(dialog).toContainText('Blocked app — Blocked');
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Vaultwarden.* only/ }).click();
  await expect(dialog).toContainText('Removed Notes — Not selected');
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toBeEnabled();
  state.restoreFails = true;
  await dialog.getByRole('button', { name: 'Restore now', exact: true }).click();
  expect(state.restoreRequests).toEqual([{ appId: 'vaultwarden', planId: 'review-vaultwarden' }]);
});

test('UF06 an unknown submission stays non-retryable when Activity cannot establish acceptance', async ({ page }) => {
  const { state, verify } = await fixture(page);
  verify('verified');
  await page.route('**/api/backups/restore-points/*/restore', async route => {
    state.restoreRequests.push(route.request().postDataJSON());
    await route.abort('failed');
  });
  await page.reload();
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Restore now', exact: true }).click();
  await expect(dialog).toContainText('acceptance is not yet known');
  await dialog.getByRole('button', { name: 'Check Activity', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Restore now', exact: true })).toHaveCount(0);
  expect(state.restoreRequests).toHaveLength(1);
});

test('UF06 closing a pending submission preserves another archive opened before the response arrives', async ({ page }) => {
  const { point, report, state, verify } = await fixture(page);
  state.restoreJobId = 'delayed-acceptance';
  verify('verified');
  const other = { ...point, id: 102, appId: 'other-app', appName: 'Other app', includedAppIds: 'other-app' };
  report.recentRestorePoints.push(other);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let posted = false;
  await page.route('**/api/backups/restore-points/*/restore', async route => {
    posted = true;
    await held;
    state.jobs = [{ jobId: 'delayed-acceptance', type: 'backup_restore', subjectId: `${point.id}:all`, status: 'running', steps: [], currentStep: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as AutarkOsJob];
    await route.fulfill({ json: state.jobs[0] });
  });
  await page.goto(`/backups?backup=${point.id}`);
  await page.getByRole('button', { name: 'Review restore plan', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore now', exact: true }).click();
  await expect.poll(() => posted).toBe(true);
  await expect(page.getByRole('dialog')).toContainText('Closing this dialog does not cancel');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('button', { name: 'All backups', exact: false }).click();
  await page.getByRole('button', { name: /other-app-.*autark-backup/i }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const acceptedResponse = page.waitForResponse(response => response.url().endsWith(`/restore-points/${point.id}/restore`));
  release();
  await acceptedResponse;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Other app restore point details', exact: true })).toBeVisible();
});

test('UF06 archive loading failures remain explicit and cached files survive a failed refresh', async ({ page }) => {
  const { point } = await fixture(page);
  let fail = true;
  await page.route(/\/api\/backups\/restore-points(?:\?.*)?$/, route => fail ? route.fulfill({ status: 503, json: { message: 'Archive inventory is offline.' } }) : route.fulfill({ json: { items: [point], nextBeforeId: null } }));
  await page.reload();
  await expect(page.getByText('Restore points unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry archive list', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: 'Refresh backup status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh paused', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh paused', exact: true }).click();
  await expect(page.getByText('Archive inventory is offline.', { exact: true })).toBeVisible();
});

test('UF06 removed-app folder queries its retained archives independently of newer app records', async ({ page }) => {
  const { point } = await fixture(page);
  const removed = { ...point, id: 42, appId: 'removed-notes', appName: 'Removed Notes', includedAppIds: 'removed-notes' };
  const queriedApps: Array<string | null> = [];
  await page.route(/\/api\/backups\/restore-points(?:\?.*)?$/, route => {
    const appId = new URL(route.request().url()).searchParams.get('appId');
    queriedApps.push(appId);
    return route.fulfill({ json: { items: appId === 'removed-notes' ? [removed] : [point], nextBeforeId: null } });
  });
  await page.route('**/api/backups/restore-points/42', route => route.fulfill({ json: removed }));
  await page.goto('/backups?app=removed-notes');
  await expect(page.getByRole('button', { name: /removed-notes-.*autark-backup/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  expect(queriedApps).toContain('removed-notes');
});

test('UF06 a full-archive folder does not claim empty while older pages remain', async ({ page }) => {
  const { point } = await fixture(page);
  const full = { ...point, id: 42, scope: 'full', appId: '__full__', appName: 'All apps', includedAppIds: 'vaultwarden' };
  await page.route(/\/api\/backups\/restore-points(?:\?.*)?$/, route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('beforeId')
    ? { items: [full], nextBeforeId: null } : { items: [point], nextBeforeId: point.id } }));
  await page.goto('/backups?scope=full');
  await expect(page.getByText('No matching archives loaded yet', { exact: true })).toBeVisible();
  await expect(page.getByText('This folder is empty', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load older archives', exact: true }).click();
  await expect(page.getByRole('button', { name: /checkpoint-.*autark-backup/i })).toBeVisible();
});

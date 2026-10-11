import { expect, test } from 'playwright/test';
import { installMockApi } from './support/mockApi';

for (const width of [390, 1440]) {
  test(`${width}px backups review scope before dispatch and cancel restores focus`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installMockApi(page, 'idle');
    let runs = 0;
    await page.route('**/api/backups/full/run', route => {
      runs++;
      expect(route.request().postDataJSON()).toEqual({ planId: 'fixture-backup-plan' });
      return route.fulfill({ json: { jobId: 'reviewed', type: 'backup', status: 'running', subjectId: '__full__', steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    });
    await page.goto('/backups');
    const trigger = page.getByRole('button', { name: 'Back up all', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Review backup' });
    await expect(dialog).toContainText('Vaultwarden');
    await expect(dialog).toContainText('Apps already paused will stay paused');
    await expect(dialog.getByRole('button', { name: 'Start backup', exact: true })).toBeEnabled();
    if (width === 390) await testInfo.attach('backup-review-mobile', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    expect(runs).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(runs).toBe(0);
    await trigger.click();
    await dialog.getByRole('button', { name: 'Start backup', exact: true }).click();
    await expect.poll(() => runs).toBe(1);
    await expect(dialog).toHaveCount(0);
  });
}

test('backup review fails closed, retries scope, and requires renewed review after dispatch failure', async ({ page }) => {
  await installMockApi(page, 'idle');
  let planAvailable = false;
  let executable = false;
  let runs = 0;
  let plans = 0;
  await page.route('**/api/backups/plan?*', route => {
    plans++;
    return route.fulfill(planAvailable ? { json: { scope: 'full', appId: null, planId: `plan-${plans}`, executable, apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden' }], warnings: [], blockedReasons: executable ? [] : ['Docker inventory is unavailable.'], checkedAt: new Date().toISOString() } } : { status: 503, json: { message: 'Backup scope unavailable.' } });
  });
  await page.route('**/api/backups/full/run', route => { runs++; return route.fulfill({ status: 409, json: { message: 'Backup scope changed. Review again.' } }); });
  await page.goto('/backups');
  await page.getByRole('button', { name: 'Back up all', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review backup' });
  const start = dialog.getByRole('button', { name: 'Start backup', exact: true });
  await expect(dialog).toContainText('Backup scope unavailable.');
  await expect(start).toBeDisabled();
  planAvailable = true;
  await dialog.getByRole('button', { name: 'Review again' }).click();
  await expect(dialog).toContainText('Docker inventory is unavailable.');
  await expect(start).toBeDisabled();
  expect(runs).toBe(0);
  executable = true;
  await dialog.getByRole('button', { name: 'Review again' }).click();
  await start.click();
  await expect(dialog).toContainText('Backup scope changed. Review again.');
  await expect(start).toBeDisabled();
  expect(runs).toBe(1);
  await page.locator('[data-sonner-toast] [data-close-button]').click();
  await dialog.getByRole('button', { name: 'Review again' }).click();
  await expect(start).toBeEnabled();
  expect(plans).toBe(4);
});

test('My Apps backup waits for review before sending the plan identity', async ({ page }) => {
  await installMockApi(page, 'idle');
  let runs = 0;
  await page.route('**/api/backups/apps/vaultwarden/run', route => {
    runs++;
    expect(route.request().postDataJSON()).toEqual({ planId: 'fixture-backup-plan' });
    return route.fulfill({ json: { jobId: 'app-reviewed', type: 'backup', status: 'running', subjectId: 'vaultwarden', steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  });
  await page.goto('/apps?focus=managed%3Avaultwarden&panel=manage');
  await page.getByRole('button', { name: 'App actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review backup' });
  await expect(dialog).toContainText('Vaultwarden');
  expect(runs).toBe(0);
  await dialog.getByRole('button', { name: 'Start backup', exact: true }).click();
  await expect.poll(() => runs).toBe(1);
});

for (const scope of ['app', 'routine'] as const) {
  test(`Backups ${scope} action reviews the server scope before dispatch`, async ({ page }) => {
    await installMockApi(page, 'idle');
    let runs = 0;
    let requestedScope = '';
    await page.route('**/api/backups/plan?*', route => {
      const query = new URL(route.request().url()).searchParams;
      requestedScope = query.get('scope') || '';
      if (scope === 'app') expect(query.get('appId')).toBe('vaultwarden');
      return route.fulfill({ json: { scope, appId: scope === 'app' ? 'vaultwarden' : null, planId: `review-${scope}`, executable: true, apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden' }], warnings: [], blockedReasons: [], checkedAt: new Date().toISOString() } });
    });
    await page.route(scope === 'app' ? '**/api/backups/apps/vaultwarden/run' : '**/api/backups/routine/run', route => {
      runs++;
      expect(route.request().postDataJSON()).toEqual({ planId: `review-${scope}` });
      return route.fulfill({ json: { jobId: 'reviewed', type: 'backup', status: 'running', steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    });
    await page.goto('/backups?app=vaultwarden');
    await page.getByRole('button', { name: scope === 'app' ? 'Back up this app' : 'Run scheduled backup now', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review backup' });
    await expect(dialog).toContainText('Vaultwarden');
    expect(requestedScope).toBe(scope);
    expect(runs).toBe(0);
    await dialog.getByRole('button', { name: 'Start backup', exact: true }).click();
    await expect.poll(() => runs).toBe(1);
  });
}

test('Activity backup POST handoff navigates to review without executing', async ({ page }) => {
  await installMockApi(page, 'idle');
  let runs = 0;
  await page.route('**/api/recommended-action', route => route.fulfill({ json: {
    id: 'backup-review', severity: 'warning', title: 'Create a backup', body: 'Vaultwarden needs a restore point.', sourceIssueIds: [], dismissible: true,
    primaryAction: { id: 'backup', label: 'Create backup', href: '/api/backups/apps/vaultwarden/run', method: 'POST', route: null, confirmationRequired: false, danger: false, disabled: false, reason: null },
  } }));
  await page.route('**/api/backups/apps/vaultwarden/run', route => { runs++; return route.fulfill({ json: {} }); });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('dialog', { name: 'Activity', exact: true }).getByRole('button', { name: 'Create backup', exact: true }).click();
  await expect(page).toHaveURL(/\/backups\?app=vaultwarden/);
  expect(runs).toBe(0);
  await page.getByRole('button', { name: 'Back up this app', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review backup' })).toContainText('Vaultwarden');
  expect(runs).toBe(0);
});

for (const resumeAllowed of [true, false]) {
  test(`Activity retains the ${resumeAllowed ? 'availability' : 'restore'} recovery handoff across reload`, async ({ page }) => {
    await installMockApi(page, 'idle');
    await page.route('**/api/jobs', route => route.fulfill({ json: [{
      jobId: 'recovery-needed', type: 'backup', subjectId: 'vaultwarden', status: 'failed', currentStep: 'resume', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      error: { code: 'recovery_pending', message: 'App recovery needs attention.', advancedDetails: {} },
      steps: [{ id: 'resume', label: 'Restore app availability', status: 'failed', message: 'Recovery is unresolved.', recovery: { appId: 'vaultwarden', appInstanceId: 'fixture', resumeAllowed } }],
    }] }));
    await page.goto('/home');
    await page.reload();
    await page.getByRole('button', { name: /^Open activity:/ }).click();
    const activity = page.getByRole('dialog', { name: 'Activity', exact: true });
    await activity.getByRole('tab', { name: 'History', exact: true }).click();
    await activity.locator('summary').filter({ hasText: 'Backup failed' }).click();
    await activity.getByRole('link', { name: resumeAllowed ? 'Review app recovery · vaultwarden' : 'Review restore points before starting · vaultwarden', exact: true }).click();
    await expect(page).toHaveURL(resumeAllowed ? /\/apps\?focus=managed%3Avaultwarden&panel=manage&tab=overview/ : /\/backups\?app=vaultwarden/);
  });
}

for (const resumeAllowed of [true, false]) {
  test(`My Apps explains unresolved ${resumeAllowed ? 'availability' : 'data'} recovery and honors canonical actions`, async ({ page }) => {
    await installMockApi(page, 'idle');
    await page.goto('/home');
    const snapshot = await page.evaluate(async () => (await fetch('/api/application-state')).json());
    const app = snapshot.applications.find((candidate: { id: string }) => candidate.id === 'vaultwarden');
    app.operation = { kind: 'failed', jobType: 'backup', jobId: 'recovery-needed', label: 'Backup failed', message: 'App recovery needs attention.' };
    app.availableActions.push({ id: 'start', label: 'Start app', kind: 'action', method: 'POST', href: '/api/apps/vaultwarden/start', disabled: true, reason: 'Ownership must be checked.' });
    await page.route('**/api/application-state*', route => route.fulfill({ json: snapshot }));
    await page.route('**/api/jobs', route => route.fulfill({ json: [{
      jobId: 'recovery-needed', type: 'backup', status: 'failed', subjectId: 'vaultwarden', currentStep: 'resume', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      steps: [{ id: 'resume', label: 'Restore availability', status: 'failed', message: 'Review recovery.', recovery: { appId: 'vaultwarden', appInstanceId: app.appInstanceId, resumeAllowed } }],
      error: { code: 'recovery_pending', message: 'App recovery needs attention.', advancedDetails: {} },
    }] }));
    await page.goto('/apps?focus=managed%3Avaultwarden&panel=manage&tab=overview');
    const recovery = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    await expect(recovery).toContainText('App recovery needs attention');
    if (resumeAllowed) {
      await expect(recovery.getByRole('button', { name: 'Start app', exact: true })).toBeDisabled();
      await recovery.getByRole('button', { name: 'Start app', exact: true }).locator('..').hover();
      await expect(page.getByRole('tooltip')).toContainText('Ownership must be checked.');
    } else {
      await expect(recovery).toContainText('Data replacement was interrupted.');
      await expect(recovery.getByRole('button', { name: 'Start app', exact: true })).toHaveCount(0);
      await recovery.getByRole('link', { name: 'Review backups and restore plan' }).click();
      await expect(page).toHaveURL(/\/backups\?app=vaultwarden/);
    }
  });
}

import { expect, test, type Page } from 'playwright/test';
import type { ActivityLog } from '../src/types/activity';
import type { AutarkOsJob } from '../src/types/jobs';
import { installMockApi, expectNoHorizontalOverflow } from './support/mockApi';

async function historyServer(page: Page) {
  const records: ActivityLog[] = [];
  const server = { offline: false, records, writes: 0 };
  await page.route('**/api/activity**', async (route) => {
    if (server.offline) return route.fulfill({ status: 503, json: { message: 'History unavailable' } });
    if (route.request().method() === 'POST') {
      server.writes++;
      const receipt = route.request().postDataJSON();
      const saved = records.find((item) => item.action === `notification:${receipt.id}`) ?? {
        id: records.length + 1, action: `notification:${receipt.id}`, category: 'notification',
        level: receipt.severity, title: receipt.title, message: receipt.message, nextAction: receipt.nextAction,
        appId: null, outcome: 'recorded', details: '', createdAt: new Date().toISOString(),
      };
      if (!records.includes(saved)) records.unshift(saved);
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: records });
  });
  return server;
}

async function copyAppName(page: Page) {
  const copy = page.getByRole('button', { name: /^Copy Vaultwarden/ }).first();
  await copy.focus();
  await copy.click();
}

test('dialog feedback supports keyboard and mouse without losing edits or sticky popups', async ({ page }) => {
  await installMockApi(page, 'idle');
  await historyServer(page);
  await page.goto('/settings');
  const settings = page.locator('[data-slot="dialog-content"]');
  const name = page.getByRole('textbox', { name: /^Device name/ });
  await name.fill('Saved name');
  await page.getByRole('button', { name: /^Save changes$/i }).click();
  const popup = page.locator('[data-sonner-toast]');
  await expect(popup).toContainText('Settings saved');
  await name.fill('Keep my unsaved edits');
  await page.keyboard.press('Alt+t');
  const details = popup.getByRole('button', { name: 'Details', exact: true });
  for (let tab = 0; tab < 4 && !await details.evaluate((element) => element === document.activeElement); tab++) {
    await page.keyboard.press('Tab');
  }
  await expect(details).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'Settings saved' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Keep my unsaved edits');

  await page.route('**/api/system/settings', (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, json: { message: 'Could not save these settings.' } }) : route.fallback());
  await page.getByRole('button', { name: /^Save changes$/i }).click();
  await expect(popup).toContainText('Could not save these settings.');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator('[data-sonner-toast]')).toHaveCount(1);
  const popupBounds = (await popup.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(viewport.width);
  expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(viewport.height);
  const keepEditingBounds = (await page.getByRole('button', { name: 'Keep editing', exact: true }).boundingBox())!;
  expect(popupBounds.y).toBeGreaterThan(keepEditingBounds.y + keepEditingBounds.height);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(settings.locator('[data-sonner-toast]')).toHaveCount(1);
  await details.click();
  await expect(page.getByRole('dialog', { name: 'Activity', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toHaveValue('Keep my unsaved edits');
});

test('one compact popup, dismissible without losing history across reload or a new browser', async ({ page, browser }, testInfo) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  // Plain HTTP on the Pi has getRandomValues, but not randomUUID.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await page.goto('/apps');
  const before = await page.getByRole('heading', { name: 'My Apps', exact: true }).boundingBox();
  await copyAppName(page);
  const popup = page.locator('[data-sonner-toast]');
  await expect(popup).toContainText('App name copied');
  await expect.poll(() => server.records.length).toBe(1);
  expect(server.records[0].message).toBe('Ready to paste.');
  expect(await page.getByRole('heading', { name: 'My Apps', exact: true }).boundingBox()).toEqual(before);
  await copyAppName(page);
  await expect.poll(() => server.records.length).toBe(2);
  await expect(popup).toHaveCount(1);
  await expect(popup).toHaveAttribute('data-y-position', 'bottom');
  expect((await popup.boundingBox())!.height).toBeLessThan(110);
  await page.screenshot({ path: testInfo.outputPath('result-popup.png') });
  await popup.getByRole('button', { name: 'Close toast' }).click();
  await expect(popup).toHaveCount(0);
  const activityLabel = page.getByRole('button', { name: /^Open activity:/ }).locator('span');
  expect(await activityLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: 'App name copied' })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('activity-history.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Open activity:/ })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: 'App name copied' })).toHaveCount(2);
  await expect(popup).toHaveCount(0);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await installMockApi(otherPage, 'idle');
  await otherPage.route('**/api/activity**', (route) => route.fulfill({ json: server.records }));
  await otherPage.goto('/home');
  await otherPage.getByRole('button', { name: /^Open activity:/ }).click();
  await otherPage.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(otherPage.locator('summary').filter({ hasText: 'App name copied' })).toHaveCount(2);
  await other.close();
});

test('unsaved feedback is honest, retryable and compact on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  server.offline = true;
  await page.goto('/apps');
  await copyAppName(page);
  const details = page.locator('[data-sonner-toast]').getByRole('button', { name: 'Details', exact: true });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Some results are only in this session.', { exact: false })).toBeVisible();
  await expect(page.getByText('History is incomplete.', { exact: false })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'App name copied' })).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  const panel = page.locator('[data-slot="popover-content"]');
  const bounds = (await panel.boundingBox())!;
  expect(bounds.height).toBeLessThanOrEqual(333);
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(378);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  server.offline = false;
  await page.getByRole('button', { name: 'Retry history', exact: true }).click();
  await expect(page.getByText('History is incomplete.', { exact: false })).toBeHidden();
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect.poll(() => server.records.length).toBe(1);
  await expect(page.getByText('Some results are only in this session.', { exact: false })).toBeHidden();
  await expect(page.locator('summary').filter({ hasText: 'App name copied' })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('activity-mobile.png') });
  await page.getByRole('tab', { name: 'Now', exact: true }).click();
  expect((await panel.boundingBox())!.height).toBe(bounds.height);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: /^Open activity:/ })).toHaveCount(1);
});

for (const outcome of ['failed', 'succeeded', 'cancelled'] as const) {
test(`${outcome} jobs move to durable History with one result, without replay on reload`, async ({ page }) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  await page.route('**/api/recommended-action', (route) => route.fulfill({ json: { id: 'no-action-needed' } }));
  const job = (id: string): AutarkOsJob => ({
    jobId: id, type: 'install_app', subjectId: id, status: 'running', currentStep: 'start',
    steps: [{ id: 'start', label: 'Checking readiness', status: 'running', message: 'Waiting for app startup' }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const jobs = [job('syncthing'), job('homepage')];
  await page.route('**/api/jobs', (route) => route.fulfill({ json: jobs }));
  await page.goto('/home');
  await page.getByRole('button', { name: 'Open activity: 2 running', exact: true }).click();
  await expect(page.getByText('Install · syncthing', { exact: true })).toBeVisible();
  await expect(page.getByText('Install · homepage', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('a[href="/discover"]').first().click();
  jobs[0].status = outcome;
  jobs[0].error = { code: 'startup_failed', message: 'App did not start. Review app settings.', advancedDetails: {} };
  jobs[0].steps[0].status = outcome === 'cancelled' ? 'skipped' : outcome;
  jobs[0].steps[0].message = 'Ready to use';
  const title = `Install ${outcome === 'succeeded' ? 'completed' : outcome}`;
  await expect(page.locator('[data-sonner-toast]')).toContainText(title);
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('summary').filter({ hasText: title }).click();
  const message = outcome === 'failed' ? 'App did not start. Review app settings.' : outcome === 'cancelled' ? 'The queued operation was cancelled.' : 'Ready to use';
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
  expect(server.writes).toBe(0); // Job records ARE history; no duplicate receipt.
  await page.reload();
  await page.getByRole('button', { name: 'Open activity: 1 running', exact: true }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: title })).toHaveCount(1);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});
}

test('history waits for jobs and handles an empty result without a false all-clear', async ({ page }) => {
  await installMockApi(page, 'idle');
  await historyServer(page);
  let finishJobs: () => Promise<void>;
  await page.route('**/api/jobs', (route) => { finishJobs = () => route.fulfill({ json: [] }); });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByText('Loading history…', { exact: true })).toBeVisible();
  await expect(page.getByText('No history yet.', { exact: true })).toBeHidden();
  await finishJobs!();
  await expect(page.getByText('No history yet.', { exact: true })).toBeVisible();
});

test('recommendations can be dismissed without resolving Pro, and changed notices return', async ({ page }) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  let recommendation = {
    id: 'pro-activate', severity: 'info', title: 'Autark Pro is ready to activate',
    body: 'Activate this server when you are ready to use its Pro capabilities.',
    primaryAction: { id: 'review-pro', label: 'Review Autark Pro', route: '/pro', confirmationRequired: false, danger: false, disabled: false }, sourceIssueIds: [],
  };
  await page.route('**/api/recommended-action', (route) => route.fulfill({ json: recommendation }));
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/pro')) mutations.push(request.url());
  });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await expect(page.getByText(recommendation.title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toBeHidden();
  await expect(page.getByText('Nothing needs your attention.', { exact: true })).toBeHidden();
  await expect.poll(() => server.records.length).toBe(1);
  expect(server.records[0].title).toBe(recommendation.title);
  expect(server.records[0].nextAction).toEqual(recommendation.primaryAction);
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: recommendation.title })).toBeVisible();
  // Existing text-only receipts can still use their matching live recommendation.
  server.records[0].nextAction = undefined;
  await page.reload();
  await page.getByRole('button', { name: 'Open activity: Activity', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: recommendation.title })).toBeVisible();
  await page.locator('summary').filter({ hasText: recommendation.title }).click();
  await page.getByRole('button', { name: 'Review Autark Pro', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pro$/);
  recommendation = { ...recommendation, severity: 'warning', body: 'Activation now requires your attention.' };
  await page.reload();
  await page.getByRole('button', { name: 'Open activity: Needs review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review Autark Pro', exact: true }).click();
  await expect(page).toHaveURL(/\/pro$/);
  expect(mutations).toEqual([]);
});

test('saved historical actions work without the original recommendation or browser preferences', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  server.records.push({
    id: 1, action: 'notification:saved-pro', category: 'notification', level: 'info',
    title: 'Autark Pro is ready to activate', message: 'Review Pro capabilities.',
    appId: null, outcome: 'recorded', details: '', createdAt: new Date().toISOString(),
    nextAction: { id: 'review-pro', label: 'Review Autark Pro', route: '/pro', confirmationRequired: false, danger: false },
  });
  await page.route('**/api/recommended-action', (route) => route.fulfill({ json: { id: 'no-action-needed' } }));
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('summary').filter({ hasText: server.records[0].title }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Review Autark Pro', exact: true }).click();
  await expect(page).toHaveURL(/\/pro$/);
  await expect(page.getByRole('dialog', { name: 'Activity', exact: true })).toBeHidden();
});

test('history uses the same confirmation, failure feedback and disabled explanations as Now', async ({ page }) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  const action = {
    id: 'repair-app', label: 'Repair app', href: '/api/apps/syncthing/repair',
    method: 'POST', confirmationRequired: true, danger: false,
  };
  server.records.push({
    id: 1, action: 'notification:repair', category: 'notification', level: 'warning',
    title: 'Syncthing needs attention', message: 'Check its configuration.',
    appId: null, outcome: 'recorded', details: '', createdAt: new Date().toISOString(), nextAction: action,
  });
  let writes = 0;
  await page.route('**/api/apps/syncthing/repair', (route) => {
    writes++;
    expect(route.request().method()).toBe('POST');
    return route.fulfill({ status: 409, json: { message: 'The app is no longer available.' } });
  });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Syncthing needs attention' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Repair app', exact: true }).click();
  expect(writes).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Repair app', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('The app is no longer available.');
  expect(writes).toBe(1);
  server.records.find((record) => record.action === 'notification:repair')!.nextAction = {
    ...action, disabled: true, reason: 'App ownership must be reviewed first.',
  };
  await page.reload();
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Syncthing needs attention' }).click();
  await expect(page.getByRole('button', { name: 'Repair app', exact: true })).toBeDisabled();
  await expect(page.getByText('App ownership must be reviewed first.', { exact: true })).toBeVisible();
});

test('dismissal reports unavailable browser storage and keeps failed history saves retryable', async ({ page }) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  server.offline = true;
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByText('Some results are only in this session.', { exact: false })).toBeVisible();
  server.offline = false;
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect.poll(() => server.records.length).toBe(1);
  await expect(page.getByText('Some results are only in this session.', { exact: false })).toBeHidden();
});

test('history interleaves jobs and receipts by actual time, newest first without date groups', async ({ page }) => {
  await installMockApi(page, 'idle');
  const server = await historyServer(page);
  const timestamps = [
    '2026-09-19T13:00:00Z',
    '2026-09-19T13:00:00.500Z',
    '2026-09-19T09:00:00-05:00',
    '2025-09-19T13:00:00Z',
  ];
  server.records.push(...timestamps.map((createdAt, id) => ({
    id, createdAt, action: `notification:${id}`, title: `Result ${id}`, message: 'Saved result',
    category: 'notification', level: 'info', appId: null, outcome: 'recorded', details: '',
  })));
  const job: AutarkOsJob = {
    jobId: 'completed-install', type: 'install_app', subjectId: 'syncthing', status: 'succeeded',
    steps: [], createdAt: timestamps[0], updatedAt: '2026-09-19T13:00:00.750Z',
  };
  await page.route('**/api/jobs', (route) => route.fulfill({ json: [job] }));
  await page.goto('/home');
  await page.getByRole('button', { name: /^Open activity:/ }).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  const summaries = panel.locator('summary');
  await expect(summaries).toHaveCount(5);
  expect(await summaries.locator('span').allTextContents()).toEqual([
    'Result 2', 'Install completed', 'Result 1', 'Result 0', 'Result 3',
  ]);
  await expect(panel.getByRole('heading')).toHaveCount(0);
  await summaries.last().click();
  await expect(panel.getByText('Sep 19, 2025, 8:00:00 AM CDT', { exact: true })).toBeVisible();
});

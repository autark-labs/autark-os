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
        level: receipt.severity, title: receipt.title, message: receipt.message,
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

import { expect, test, type Page } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const events = [
  { id: 12, level: 'success', category: 'pro', action: 'cutover', title: 'Pro agent cutover completed', message: 'Cutover completed.', appId: null, outcome: 'completed', details: 'Pro checkpoint', createdAt: '2025-01-15T12:00:00Z' },
  { id: 11, level: 'warning', category: 'repair', action: 'restart', title: 'Earlier restart failed', message: 'A historical failure, now resolved.', appId: 'vaultwarden', outcome: 'failed', details: 'Repair checkpoint', createdAt: '2025-01-15T11:59:00Z' },
  { id: 10, level: 'success', category: 'backup', action: 'verify', title: 'Backup verified', message: 'A restore point is ready.', appId: 'vaultwarden', outcome: 'completed', details: 'Backup checkpoint', createdAt: '2025-01-15T11:58:00Z' },
];

async function fixture(page: Page) {
  await installMockApi(page, 'idle');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.route('**/api/activity?*', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: events.filter(event => (!params.get('category') || params.get('category') === event.category) && (!params.get('level') || params.get('level') === event.level)) });
  });
}

async function category(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Filter activity by category' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('one filter owns history and details, including deep links and filtered-empty', async ({ page }) => {
  await fixture(page);
  await page.goto('/activity');
  const detail = page.getByRole('region', { name: 'Selected activity' });
  await page.getByRole('button', { name: /Backup verified.*A restore point/ }).click();
  await expect(detail).toContainText('Backup verified');
  await category(page, 'Repairs');
  await expect(detail).toContainText('Earlier restart failed');
  await expect(detail).not.toContainText('Backup verified');
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByText('No events match these filters', { exact: true })).toBeVisible();
  await expect(detail).toContainText('No event selected.');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await category(page, 'Backups');
  await expect(page).toHaveURL(/category=backup/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Filter activity by category' })).toContainText('Backups');
  await expect(detail).toContainText('Backup verified');
  await page.goto('/activity?category=pro');
  await expect(detail).toContainText('Pro agent cutover completed');
  await page.getByRole('button', { name: /Technical detail/ }).click();
  await expect(detail).toContainText('Pro checkpoint');
  await category(page, 'App-related events');
  await expect(page.getByText('App-related events within the latest 120 records matching this level.')).toBeVisible();
  await expect(detail).not.toContainText('Pro agent cutover completed');
  await expect(page.getByRole('tab', { name: 'Needs attention' })).toHaveCount(0);
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await expectNoHorizontalOverflow(page);
  }
  await page.screenshot({ path: '/tmp/autark-fe08-implemented.png' });
});

test('hidden charts do not fetch; chart failure and retry never block History', async ({ page }) => {
  await fixture(page);
  let historyRequests = 0;
  let failing = true;
  await page.route('**/api/monitoring/history*', route => {
    historyRequests++;
    return failing ? route.fulfill({ status: 503, json: { message: 'Chart history unavailable' } }) : route.fallback();
  });
  await page.goto('/activity');
  await expect(page.getByRole('button', { name: /Backup verified.*A restore point/ })).toBeVisible();
  expect(historyRequests).toBe(0);
  await page.getByRole('tab', { name: 'System metrics', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('System metrics are unavailable');
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /Backup verified.*A restore point/ })).toBeVisible();
  const previousRequests = historyRequests;
  await page.clock.install();
  await page.clock.fastForward(11_000);
  expect(historyRequests).toBe(previousRequests);
  failing = false;
  await page.getByRole('tab', { name: 'System metrics', exact: true }).click();
  await expect(page.getByText('Device CPU', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autark-OS metrics' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('current issues failure is local and never becomes all-clear; refresh recovers', async ({ page }) => {
  await fixture(page);
  let failing = true;
  await page.route('**/api/apps/reliability', route => failing ? route.fulfill({ status: 503, json: { message: 'Issue check failed' } }) : route.fallback());
  await page.goto('/activity');
  await expect(page.getByText('Current issues are unavailable. History is still available.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Backup verified.*A restore point/ })).toBeVisible();
  await expect(page.getByText('No current app issues reported.')).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect(page.getByText('No current app issues reported.')).toBeVisible();
  failing = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).first().click();
  await expect(page.getByText('No app issues in the last confirmed check.')).toBeVisible();
});

test('history distinguishes unavailable, empty, cached error and subsequent success', async ({ page }) => {
  await fixture(page);
  let mode = 'failed';
  await page.route('**/api/activity?*', route => mode === 'failed'
    ? route.fulfill({ status: 503, json: { message: 'History check failed' } })
    : route.fulfill({ json: mode === 'empty' ? [] : events }));
  await page.goto('/activity');
  await expect(page.getByRole('alert')).toContainText('History is unavailable');
  await expect(page.getByText('No activity recorded yet')).toHaveCount(0);
  mode = 'empty';
  await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No activity recorded yet')).toBeVisible();
  mode = 'ready';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: /Backup verified.*A restore point/ })).toBeVisible();
  mode = 'failed';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh paused', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Backup verified.*A restore point/ })).toBeVisible();
  mode = 'ready';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh paused', exact: true })).toHaveCount(0);
});

test('diagnostics export downloads data and reports failures through global feedback', async ({ page }) => {
  await fixture(page);
  let failing = false;
  await page.route('**/api/monitoring/diagnostics*', route => failing
    ? route.fulfill({ status: 503, json: { message: 'Export unavailable' } })
    : route.fulfill({ json: { windowMinutes: 60, exportedFixture: true } }));
  await page.goto('/activity');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^autark-os-monitoring-.*\.json$/);
  await expect(page.getByText('Diagnostics exported', { exact: true }).first()).toBeVisible();
  failing = true;
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByText('Monitoring diagnostics could not be exported', { exact: true }).first()).toBeVisible();
});

test('pending history and refreshed selection never show details outside the result set', async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let rows = events;
  await page.route('**/api/activity?*', async route => { await pending; await route.fulfill({ json: rows }); });
  await page.goto('/activity');
  await expect(page.getByText('Loading activity', { exact: true })).toBeVisible();
  await expect(page.getByText('No activity recorded yet')).toHaveCount(0);
  release();
  const row = page.getByRole('button', { name: /Backup verified.*A restore point/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const detail = page.getByRole('region', { name: 'Selected activity' });
  await expect(detail).toContainText('Backup verified');
  rows = events.slice(0, 2);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(detail).toContainText('Pro agent cutover completed');
  await expect(detail).not.toContainText('Backup verified');
});

test('current-issue navigation does not promise a restart and categories follow browser navigation', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/apps/reliability', route => route.fulfill({ json: { totalApps: 1, readyApps: 0, startingApps: 0, needsAttentionApps: 1, unavailableApps: 0, issues: [{ appId: 'vaultwarden', appName: 'Vaultwarden', status: 'Unavailable', message: 'App stopped.', detail: '', suggestedAction: 'Restart app', repairAvailable: true }] } }));
  await page.goto('/activity?category=backup');
  await expect(page.getByRole('link', { name: 'Restart app', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Open My Apps/ }).first().click();
  await expect(page).toHaveURL(/\/apps$/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Filter activity by category' })).toContainText('Backups');
  await page.evaluate(() => {
    window.history.pushState(null, '', '/activity?category=pro');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('combobox', { name: 'Filter activity by category' })).toContainText('Autark Pro');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Filter activity by category' })).toContainText('Backups');
});

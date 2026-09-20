import { expect, test, type Locator } from 'playwright/test';
import type { ApplicationState } from '../src/types/applicationState';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

test('Home does not fetch an unused activity feed and keeps recommendations in notifications', async ({ page }) => {
  await installMockApi(page, 'idle');
  const activityRequests: string[] = [];
  await page.route('**/api/activity*', (route) => {
    activityRequests.push(route.request().url());
    return route.fulfill({ status: 503, json: { message: 'Activity offline' } });
  });
  await page.goto('/home');
  await expect(page.getByRole('region', { name: 'Your Apps' })).toBeVisible();
  await page.getByRole('button', { name: 'Open activity: Needs review', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Action needed' })).toContainText('Review unused data');
  expect(activityRequests).toEqual([]);
  await expect(page.getByText('Some live Home information is unavailable:')).toBeHidden();
  await page.getByRole('button', { name: 'Review storage', exact: true }).click();
  await expect(page).toHaveURL(/\/storage$/);
});

test('Home still explains an unavailable system summary on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, 'idle');
  await page.route('**/api/system-summary', (route) => route.fulfill({ status: 503, json: { message: 'Summary offline' } }));
  await page.goto('/home');
  await page.getByRole('button', { name: 'Status unavailable', exact: true }).click();
  await expect(page.getByText('Summary offline', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Your Apps' })).toBeVisible();
});

test('failed recommendations stay honest in notifications and can be retried', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, 'idle');
  let offline = true;
  let failedRequests = 0;
  await page.route('**/api/recommended-action', (route) => {
    if (!offline) return route.fallback();
    failedRequests++;
    return route.fulfill({ status: 503, json: { message: 'Recommendations offline' } });
  });
  await page.goto('/home');
  await expect.poll(() => failedRequests).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Open activity: Status unavailable', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Current activity is unavailable');
  await expect(page.getByText('Nothing needs your attention.', { exact: true })).toBeHidden();
  await expect(page.getByText('Some live Home information is unavailable:')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  offline = false;
  await page.getByRole('button', { name: 'Retry status', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Action needed' })).toContainText('Review unused data');
  await expect(page.getByText('Current activity is unavailable')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open activity: Needs review', exact: true })).toBeFocused();
});

test('notifications wait for recommendations before reporting an empty result', async ({ page }) => {
  await installMockApi(page, 'idle');
  let finishResponse: () => Promise<void>;
  await page.route('**/api/recommended-action', (route) => {
    finishResponse = () => route.fulfill({ json: { id: 'no-action-needed' } });
  });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Open activity: Checking', exact: true }).click();
  await expect(page.getByText('Checking activity…', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing needs your attention.', { exact: true })).toBeHidden();
  await finishResponse!();
  await expect(page.getByText('Nothing needs your attention.', { exact: true })).toBeVisible();
});

test('Home and My Apps keep the same managed app visible across runtime states', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const snapshot: ApplicationState = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const application = snapshot.applications.find((app) => app.relationship === 'managed');
  if (!application?.runtime) throw new Error('Expected a managed runtime fixture');
  snapshot.applications = [application];
  await page.route('**/api/application-state*', (route) => route.fulfill({ json: snapshot }));

  for (const [state, label] of [
    ['starting', 'Starting'], ['degraded', 'Needs attention'], ['stopped', 'Stopped'], ['ready', 'Running'],
  ] as const) {
    application.runtime.state = state;
    application.availableActions = state === 'ready'
      ? [{ id: 'open', label: 'Open', kind: 'external', href: application.runtime.accessUrl, method: null, disabled: false, reason: '' }]
      : [];
    await page.goto('/apps');
    await expect(page.getByText(application.name, { exact: true }).first()).toBeVisible();
    await page.locator('a[href="/home"]').first().click();
    const launcher = page.getByRole('region', { name: 'Your Apps' });
    await expect(launcher.getByText(application.name, { exact: true })).toBeVisible();
    await expect(launcher.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText('No apps installed yet', { exact: true })).toBeHidden();
    if (state === 'ready') {
      await expect(launcher.getByRole('link', { name: `Open ${application.name}`, exact: true }).first()).toHaveAttribute('href', application.runtime.accessUrl!);
    } else {
      await expect(launcher.getByRole('link', { name: `Open ${application.name}`, exact: true })).toHaveCount(0);
      const manage = launcher.getByRole('link', { name: `Manage ${application.name}`, exact: true }).first();
      await expect(manage).toHaveAttribute('href', '/apps?focus=managed%3Avaultwarden&panel=manage');
      await manage.click();
      await expect(page.getByRole('tab', { name: 'Guide', exact: true })).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Your Apps' }).getByText(application.name, { exact: true })).toBeVisible();
});

test('canonical Open agrees across Home, app grid/list/management/guide, and Discover', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const snapshot: ApplicationState = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const app = snapshot.applications.find((item) => item.relationship === 'managed')!;
  const discover = await page.evaluate(async () => (await fetch('/api/discover/apps')).json());
  snapshot.applications = [app];
  app.name = app.runtime!.appName = 'Vaultwarden';
  app.runtime!.accessUrl = 'http://raw.example:8080';
  discover.find((view) => view.application.id === app.id).application = app;
  await page.route('**/api/application-state*', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/discover/apps', route => route.fulfill({ json: discover }));
  const open = { id: 'open', label: 'Open', kind: 'external', href: 'https://canonical.example', method: null, disabled: false, reason: '' };
  for (const condition of ['ready', 'stopped', 'busy', 'disabled'] as const) {
    await page.setViewportSize({ width: 1440, height: 960 });
    app.runtime!.state = condition === 'stopped' ? 'stopped' : 'ready';
    app.operation = condition === 'busy' ? { kind: 'backing_up', label: 'Creating backup' } : { kind: 'idle' };
    app.availableActions = condition === 'ready' ? [open] : condition === 'disabled' ? [{ ...open, disabled: true, reason: 'Not available' }] : [];
    const assertOpen = async (surface: Locator) => {
      const links = surface.getByRole('link', { name: /^Open(?: app| Vaultwarden| password manager)?$/ });
      if (condition === 'ready') {
        await expect(links.first()).toHaveAttribute('href', open.href);
      } else {
        await expect(links).toHaveCount(0);
      }
    };
    await page.goto('/home');
    await expect(page.getByRole('region', { name: 'Your Apps' })).toContainText('Vaultwarden');
    await assertOpen(page.getByRole('region', { name: 'Your Apps' }));
    await page.getByRole('region', { name: 'Your Apps' }).getByRole('link', { name: 'View all', exact: true }).click();
    for (const layout of ['Grid view', 'List view']) {
      await page.getByRole('radio', { name: layout }).click();
      await assertOpen(page.getByRole('main').last());
    }
    await page.goto('/apps?focus=managed%3Avaultwarden');
    await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
    await assertOpen(page.getByRole('dialog'));
    await page.getByRole('tab', { name: 'Guide', exact: true }).click();
    await assertOpen(page.getByRole('dialog'));
    await page.goto('/discover');
    await expect(page.getByRole('button', { name: 'Select Vaultwarden', exact: true })).toBeVisible();
    await assertOpen(page.getByRole('main').last());
    await page.setViewportSize({ width: 1024, height: 960 });
    await page.goto('/discover?detail=vaultwarden');
    const detail = page.getByRole('dialog');
    await expect(detail.getByText('Already installed', { exact: true })).toBeVisible();
    await assertOpen(detail);
    await expect(detail.getByRole('link', { name: 'Manage in My Apps', exact: true })).toHaveAttribute('href', app.primaryAction.href!);
  }
});

test('app menu explains disabled mutations and dispatches enabled lifecycle actions without API navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const snapshot: ApplicationState = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const app = snapshot.applications.find((item) => item.relationship === 'managed')!;
  app.availableActions.push({ id: 'settings', label: 'Settings', kind: 'action', href: '/api/apps/vaultwarden/settings', method: 'PUT', disabled: true, reason: 'The original Compose file is missing.' });
  await page.route('**/api/application-state*', route => route.fulfill({ json: snapshot }));
  const settingsRequests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/apps/vaultwarden/settings')) settingsRequests.push(request.method()); });
  await page.goto('/apps');
  await page.getByRole('radio', { name: 'Grid view' }).click();
  await page.getByRole('button', { name: `${app.name} actions`, exact: true }).click();
  const settings = page.getByRole('menuitem', { name: 'Settings', exact: true });
  await expect(settings).toBeDisabled();
  await expect(settings).not.toHaveAttribute('href');
  await page.getByLabel('The original Compose file is missing.', { exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('The original Compose file is missing.');
  await page.keyboard.press('Enter');
  expect(settingsRequests).toEqual([]);
  await page.route('**/api/apps/vaultwarden/restart', route => route.fulfill({ json: {
    jobId: 'restart-vaultwarden', type: 'restart_app', subjectId: 'vaultwarden', status: 'running',
    currentStep: 'Restarting app', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z', error: null,
  } }));
  const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/apps/vaultwarden/restart' && request.method() === 'POST');
  await page.getByRole('menuitem', { name: 'Restart', exact: true }).click();
  await request;
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.locator('[data-sonner-toast]')).toContainText('Restart');
  await page.route('**/api/apps/vaultwarden/restart', route => route.fulfill({ status: 503, json: { message: 'Docker is unavailable.' } }));
  await page.getByRole('button', { name: `${app.name} actions`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Restart', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Docker is unavailable.');
  await expect(page).toHaveURL(/\/apps$/);
});

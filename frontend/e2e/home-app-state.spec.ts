import { expect, test } from 'playwright/test';
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
  await page.getByRole('button', { name: 'Open notifications (1)', exact: true }).click();
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
  await expect(page.getByText('Some live Home information is unavailable: Summary offline', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recommendations are unavailable');
  await expect(page.getByText('Nothing needs your attention right now.', { exact: true })).toBeHidden();
  await expect(page.getByText('Some live Home information is unavailable:')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  offline = false;
  await page.getByRole('button', { name: 'Retry recommendations', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Action needed' })).toContainText('Review unused data');
  await expect(page.getByText('Recommendations are unavailable')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open notifications (1)', exact: true })).toBeFocused();
});

test('notifications wait for recommendations before reporting an empty result', async ({ page }) => {
  await installMockApi(page, 'idle');
  let finishResponse: () => Promise<void>;
  await page.route('**/api/recommended-action', (route) => {
    finishResponse = () => route.fulfill({ json: { id: 'no-action-needed' } });
  });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
  await expect(page.getByText('Checking recommendations…', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing needs your attention right now.', { exact: true })).toBeHidden();
  await finishResponse!();
  await expect(page.getByText('Nothing needs your attention right now.', { exact: true })).toBeVisible();
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

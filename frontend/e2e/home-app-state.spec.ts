import { expect, test } from 'playwright/test';
import type { ApplicationState } from '../src/types/applicationState';
import { installMockApi } from './support/mockApi';

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

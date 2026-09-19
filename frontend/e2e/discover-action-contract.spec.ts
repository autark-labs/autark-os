import { expect, test, type Page } from 'playwright/test';
import type { DiscoverAppView } from '../src/types/discover';
import { installMockApi } from './support/mockApi';

async function discoverFixture(page: Page) {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const apps: DiscoverAppView[] = await page.evaluate(async () => (await fetch('/api/discover/apps')).json());
  await page.route('**/api/discover/apps', (route) => route.fulfill({ json: apps }));
  return apps;
}

test('mobile Discover management links use the app ID, not its installation identity', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apps = await discoverFixture(page);
  const app = apps.find((view) => view.application.relationship === 'managed')!.application;
  expect(app.appInstanceId).not.toBe(app.id);
  await page.goto(`/discover?detail=${app.id}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'View in My Apps', exact: true })).toHaveAttribute('href', '/apps?focus=managed%3Avaultwarden');
  await dialog.getByRole('link', { name: 'Manage in My Apps', exact: true }).click();
  await expect(page).toHaveURL(/\/apps\?focus=managed%3Avaultwarden&panel=manage$/);
  await expect(page.getByRole('tab', { name: 'Guide', exact: true })).toBeVisible();
});

test('the first-backup action submits the catalog app ID after installation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apps = await discoverFixture(page);
  const app = apps.find((view) => view.application.relationship === 'managed')!.application;
  app.runtime!.backupProtection = 'backup_enabled_no_restore_point';
  let completed = false;
  const job = () => ({ jobId: 'fixture-install', type: 'install_app', subjectId: app.id, status: completed ? 'succeeded' : 'running', currentStep: 'finish', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z', error: null });
  await page.route('**/api/jobs', (route) => route.fulfill({ json: [job()] }));
  await page.route('**/api/jobs/fixture-install', (route) => {
    completed = true;
    return route.fulfill({ json: job() });
  });
  await page.goto(`/discover?detail=${app.id}`);
  const request = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/api/backups/apps/'));
  await page.getByRole('button', { name: 'Create first backup', exact: true }).click();
  expect(new URL((await request).url()).pathname).toBe(`/api/backups/apps/${app.id}/run`);
});

for (const width of [390, 1440]) {
  test(`${width}px Discover follows the canonical recovery action`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await discoverFixture(page);
    await page.goto('/discover?detail=immich');
    await page.getByRole('link', { name: 'Recover app', exact: true }).first().click();
    await expect(page).toHaveURL(/\/apps\?review=immich$/);
    await expect(page.getByRole('dialog')).toContainText('Recover Immich');
  });

  test(`${width}px Discover only offers second-copy installation when explicitly allowed`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const apps = await discoverFixture(page);
    const app = apps.find((view) => view.application.id === 'immich')!.application;
    app.relationship = 'blocked';
    app.primaryAction = { id: 'review_existing', label: 'Review existing service', kind: 'route', href: '/apps?review=immich', method: null, disabled: false, reason: '' };
    for (const permission of ['absent', 'disabled', 'allowed']) {
      app.availableActions = permission === 'absent' ? [] : [{ id: 'install_copy', label: 'Install second copy', kind: 'install', href: '/api/discover/apps/immich/install', method: 'POST', disabled: permission === 'disabled', reason: '' }];
      await page.goto('/discover?detail=immich');
      const details = width === 390 ? page.getByRole('dialog') : page.getByLabel('Discover app details');
      await expect(details).toBeVisible();
      const copy = details.getByRole('button', { name: 'Install second copy', exact: true });
      if (permission !== 'allowed') {
        await expect(copy).toHaveCount(0);
      } else {
        await copy.click();
        await expect(page.getByRole('dialog').filter({ hasText: 'Install a second copy?' })).toBeVisible();
        await page.getByRole('button', { name: 'Install second copy anyway', exact: true }).click();
        await expect(page.getByRole('dialog').filter({ hasText: 'Install Immich' })).toBeVisible();
      }
    }
  });
}

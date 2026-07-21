import { expect, test, type Page, type Route } from 'playwright/test';
import { installMockApi } from './support/mockApi';

type ProFailureMode = 'disabled' | 'unavailable' | 'malformed' | 'unhealthy';

const ceRoutes = [
  { path: '/home', heading: /Your Apps/i },
  { path: '/apps', heading: /My Apps/i },
  { path: '/apps/found', heading: /Resolve Existing Apps/i },
  { path: '/discover', heading: /^Discover$/i },
  { path: '/access', heading: /^Access$/i },
  { path: '/backups', heading: /^Backups$/i },
  { path: '/storage', heading: /^Storage$/i },
  { path: '/settings', heading: /Appliance settings/i },
  { path: '/diagnostics', heading: /^Diagnostics$/i },
  { path: '/activity', heading: /^Activity Log$/i },
] as const;

async function installProFailure(page: Page, mode: ProFailureMode) {
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/v1/pro'),
    async (route: Route) => {
      if (mode === 'unavailable') {
        await route.abort('connectionrefused');
        return;
      }
      if (mode === 'malformed') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"schemaVersion":"1","state":',
        });
        return;
      }
      if (mode === 'unhealthy') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: '1',
            entitlement: { state: 'ACTIVE' },
            module: { state: 'DEGRADED', health: 'failed' },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'pro_disabled' }),
      });
    },
  );
}

for (const mode of ['disabled', 'unavailable', 'malformed', 'unhealthy'] as const) {
  test(`CE routes remain usable when Pro is ${mode}`, async ({ page }) => {
    await installMockApi(page, 'ready');
    await installProFailure(page, mode);

    for (const route of ceRoutes) {
      await test.step(route.path, async () => {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main').first()).toBeVisible();
        await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
        await expect(page.locator('body')).not.toContainText(
          /application error|fatal error|could not load|could not refresh/i,
        );
      });
    }
  });
}

test('onboarding survives a broken agent', async ({ page }) => {
  await installMockApi(page, 'onboarding');
  await installProFailure(page, 'unavailable');

  await page.goto('/setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Set up Autark-OS/i })).toBeVisible();
});

test('the Pro workspace keeps the CE shell available when local Pro status fails', async ({ page }) => {
  await installMockApi(page, 'ready');
  await installProFailure(page, 'unavailable');

  await page.goto('/pro', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Pro status could not be loaded/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Home/i }).first()).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Pro status could not be loaded/i })).toBeVisible();
});

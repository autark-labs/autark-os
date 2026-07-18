import { expect, test, type Page } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

type RouteCase = {
  expected: RegExp;
  name: string;
  path: string;
  scenario?: FixtureScenario;
};

const routes: RouteCase[] = [
  { name: 'Home', path: '/home', expected: /Your Apps/i },
  { name: 'setup', path: '/setup', expected: /Set up Autark-OS/i, scenario: 'onboarding' },
  { name: 'My Apps', path: '/apps', expected: /My Apps/i },
  { name: 'found apps', path: '/apps/found', expected: /Resolve Existing Apps/i },
  { name: 'Discover', path: '/discover', expected: /Discover Apps/i },
  { name: 'Access', path: '/access', expected: /^Access$/i },
  { name: 'Backups', path: '/backups', expected: /^Backups$/i },
  { name: 'Autark Pro', path: '/pro', expected: /Autark Pro is being built/i },
  { name: 'Storage', path: '/storage', expected: /^Storage$/i },
  { name: 'Settings', path: '/settings', expected: /Autark-OS controls/i },
  { name: 'Diagnostics', path: '/diagnostics', expected: /Autark-OS Diagnostics/i },
];

async function openRoute(page: Page, route: RouteCase) {
  await installMockApi(page, route.scenario ?? 'ready');
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: route.expected }).first()).toBeVisible();
  if (route.path === '/pro') {
    await expect(page).toHaveTitle(/Autark Pro · Autark-OS/i);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: route.expected }).first()).toBeVisible();
  await stabilizePage(page);
}

async function expectFirstUsefulContentInViewport(page: Page) {
  const firstHeading = page.locator('main').getByRole('heading').first();
  await expect(firstHeading).toBeVisible();
  const box = await firstHeading.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'a route should render a meaningful heading').not.toBeNull();
  expect(box!.y, 'the first useful content should not start above the viewport').toBeGreaterThanOrEqual(0);
  expect(box!.y, 'the first useful content should be visible without scrolling').toBeLessThan(viewport!.height);
}

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  test.describe(`${viewport.name} route smoke`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of routes) {
      test(`${route.name} has visible useful content and no horizontal overflow`, async ({ page }) => {
        await openRoute(page, route);
        await expectFirstUsefulContentInViewport(page);
        await expectNoHorizontalOverflow(page);
      });
    }
  });
}

test('loading, empty, and error fixtures retain clear user-facing states', async ({ page }) => {
  await installMockApi(page, 'loading');
  await page.setViewportSize({ width: 768, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Loading managed and linked apps/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await installMockApi(page, 'empty');
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/No managed apps or linked services/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await installMockApi(page, 'error');
  await page.goto('/storage', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Fixture storage service is unavailable/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('an unknown browser route renders the intentional not-found page', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.goto('/no-longer-here?source=bookmark', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /That page is not part of this Autark-OS server/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Go to Home/i })).toBeVisible();
  await expect(page).toHaveTitle(/Page not found · Autark-OS/i);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /That page is not part of this Autark-OS server/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

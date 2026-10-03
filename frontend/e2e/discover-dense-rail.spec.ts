import { expect, test } from 'playwright/test';
import betaScope from '../../backend/src/main/resources/beta-scope.json' with { type: 'json' };
import type { DiscoverAppView } from '../src/types/discover';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

async function openDiscover(page: Parameters<typeof installMockApi>[0], viewport: { width: number; height: number }) {
  await installMockApi(page, 'ready');
  await page.setViewportSize(viewport);
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await page.getByRole('combobox', { name: 'Catalog', exact: true }).click();
  await page.getByRole('option', { name: 'All apps', exact: true }).click();
}

test('wide Discover keeps a selected app in the dense launcher detail rail', async ({ page }) => {
  await openDiscover(page, { width: 1440, height: 960 });

  const rail = page.getByLabel('Selected Discover app');
  await page.getByRole('button', { name: /^Select Vaultwarden/ }).click();
  await expect(rail).toContainText('Vaultwarden');
  await page.getByRole('button', { name: 'Filter app status' }).click();
  await page.getByRole('menuitemradio', { name: 'Installed' }).click();
  await expect(page.getByRole('button', { name: /^Select Vaultwarden/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Immich' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter app status' }).click();
  await page.getByRole('menuitemradio', { name: 'All statuses' }).click();
  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(rail).toContainText('Immich');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rail).toContainText('App details');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/discover-dense-rail-wide.png', fullPage: false });
  await page.getByRole('button', { name: 'App details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const detailDrawer = page.getByLabel('Discover app details');
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(detailDrawer.getByRole('tab', { name: 'Details' })).toBeVisible();
  await rail.getByRole('heading', { name: 'Immich' }).click();
  await expect(detailDrawer).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: 'App details' }).click();
  await expect(detailDrawer).toHaveAttribute('aria-hidden', 'false');
  await detailDrawer.getByRole('tab', { name: 'Details' }).click();
  await expect(detailDrawer).toContainText('App details');
  await detailDrawer.getByRole('button', { name: 'Advanced app info' }).click();
  await expect(detailDrawer).toHaveCSS('overflow-y', 'hidden');
  await expect.poll(() => detailDrawer.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/discover-app-drawer.png', fullPage: false });

  await detailDrawer.getByRole('tab', { name: 'Overview' }).click();
  await expect(detailDrawer.getByRole('button', { name: 'Install second copy' })).toHaveCount(0);
  await rail.getByRole('link', { name: 'Recover app' }).click();
  await expect(page.getByRole('dialog')).toContainText('Recover Immich');
});

test('narrow Discover opens the selected app in the full review sheet', async ({ page }) => {
  await openDiscover(page, { width: 390, height: 844 });

  await page.getByRole('button', { name: 'Select Immich' }).click();
  await expect(page.getByRole('dialog')).toContainText('Immich');
  await expectNoHorizontalOverflow(page);
});

for (const width of [1440, 1024, 390]) {
  test(`${width}px expanded catalog scrolls to its last app`, async ({ page }) => {
    await installMockApi(page, 'ready');
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/home');
    const [template]: DiscoverAppView[] = await page.evaluate(async () => (await fetch('/api/discover/apps')).json());
    const apps = betaScope.apps.map(({ id, label }) => ({
      ...template,
      app: { ...template.app, id, name: label },
      application: { ...template.application, id, name: label },
      setupSchema: { ...template.setupSchema, appId: id },
    }));
    await page.route('**/api/discover/apps', route => route.fulfill({ json: apps }));
    await page.goto('/discover');
    await page.getByRole('combobox', { name: 'Catalog', exact: true }).click();
    await page.getByRole('option', { name: 'All apps', exact: true }).click();
    const catalog = page.getByLabel('Discover app catalog', { exact: true });
    const cards = catalog.getByRole('button', { name: /^Select / });
    await expect(cards).toHaveCount(apps.length);
    await expect(cards.last()).not.toBeInViewport();
    await cards.first().hover();
    await page.mouse.wheel(0, 10000);
    await expect(cards.last()).toBeInViewport();
    if (width >= 1024) {
      await cards.last().focus();
      await page.keyboard.press('Home');
      await expect(cards.first()).toBeInViewport();
      await page.keyboard.press('End');
      await expect(cards.last()).toBeInViewport();
      await expect(page.getByRole('searchbox', { name: 'Search Discover apps' })).toBeInViewport();
    }
    await cards.last().click();
    const details = width >= 1280 ? page.getByLabel('Selected Discover app') : page.getByRole('dialog');
    await expect(details).toContainText('Wiki.js');
    await expectNoHorizontalOverflow(page);
  });
}

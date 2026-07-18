import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('homepage redesign fits the target desktop viewport', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1728, height: 960 });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Fixture/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Apps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick Links' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/home-redesign-final.png', fullPage: false });
});

test('homepage redesign remains usable at a compact desktop width', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Fixture/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick Links' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

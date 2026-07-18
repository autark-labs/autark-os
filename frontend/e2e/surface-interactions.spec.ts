import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

async function openReadyRoute(page: Parameters<typeof installMockApi>[0], path: string, viewport: { width: number; height: number }, scenario: FixtureScenario = 'ready') {
  await installMockApi(page, scenario);
  await page.setViewportSize(viewport);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

test('wide view opens global popovers, app management, and the Discover dialog', async ({ page }) => {
  await openReadyRoute(page, '/home', { width: 1440, height: 1000 });
  await expect(page.getByText(/Your Apps/i).first()).toBeVisible();

  await page.getByRole('button', { name: /Tailscale:/i }).click();
  await expect(page.getByText(/Private links:/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Docker:/i }).click();
  await expect(page.getByRole('dialog').getByText(/Docker ready/i)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Open notifications/i }).click();
  await expect(page.getByText(/Current attention and this session/i)).toBeVisible();
  await expect(page.getByLabel('Action needed')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Theme:/i }).click();
  await expect(page.getByRole('button', { name: /Forest/i })).toBeVisible();
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/apps', { width: 1280, height: 960 });
  await expect(page.getByText(/My Apps/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
  const railStatusBeforeExpand = await page.getByLabel('Status legend').boundingBox();
  const scrollBeforeExpand = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: /Manage app/i }).click();
  await expect(page.getByText(/^Management$/i)).toBeVisible();
  const railStatusAfterExpand = await page.getByLabel('Status legend').boundingBox();
  expect(railStatusAfterExpand?.x).toBeCloseTo(railStatusBeforeExpand?.x ?? 0, 0);
  expect(railStatusAfterExpand?.width).toBeCloseTo(railStatusBeforeExpand?.width ?? 0, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeExpand);
  await page.getByRole('button', { name: /Close details/i }).click();
  await expect(page.getByText(/^Management$/i).locator('xpath=ancestor::section[1]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: /^Manage app$/i })).toBeVisible();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeExpand);

  await page.getByRole('button', { name: /^Manage app$/i }).click();
  await expect(page.getByText(/^Management$/i)).toBeVisible();
  await page.getByRole('searchbox', { name: /Search managed and linked apps/i }).click();
  await expect(page.getByText(/^Management$/i).locator('xpath=ancestor::section[1]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: /^Manage app$/i })).toBeVisible();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/discover', { width: 1280, height: 960 });
  await expect(page.getByText(/Discover Apps/i).first()).toBeVisible();
  await page.getByRole('button', { name: /How installs work/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/How Autark-OS installs apps/i);
  await expectNoHorizontalOverflow(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Discover activity/i }).click();
  await expect(page.getByText(/Vaultwarden backup verified/i)).toBeVisible();
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/storage', { width: 1280, height: 960 });
  await page.getByRole('button', { name: /^Review$/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Clean up unused app data/i);
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/settings', { width: 1280, height: 960 });
  await page.getByRole('textbox', { name: /^Device name/ }).fill('Fixture Home Server updated');
  await page.getByRole('button', { name: /^Refresh$/i }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/Discard unsaved changes/i);
  await expectNoHorizontalOverflow(page);
});

test('narrow view keeps sheets and the backup dialog within the viewport', async ({ page }) => {
  await openReadyRoute(page, '/apps/found', { width: 390, height: 844 });
  await expect(page.getByText(/Resolve Existing Apps/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Review/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/home', { width: 390, height: 844 });
  await page.getByRole('button', { name: /Open system status/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/System status/i);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Open navigation/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Autark-OS navigation/i);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/discover?detail=immich', { width: 390, height: 844 });
  await expect(page.getByRole('dialog')).toContainText(/Immich/i);
  await page.getByRole('button', { name: /Install second copy/i }).click();
  await expect(page.getByRole('dialog').filter({ hasText: /Install a second copy/i })).toBeVisible();
  await page.getByRole('button', { name: /Install second copy anyway/i }).click();
  await expect(page.getByRole('dialog').filter({ hasText: /Install Immich/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/backups', { width: 390, height: 844 }, 'idle');
  await expect(page.getByText(/Create a manual backup/i)).toBeVisible();
  await page.getByRole('tab', { name: /^List$/i }).click();
  await page.getByRole('button', { name: /^Details$/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/Restore point details/i);
  const box = await dialog.boundingBox();
  expect(box, 'the restore dialog should be rendered').not.toBeNull();
  expect(box!.width, 'the restore dialog must leave a mobile gutter').toBeLessThanOrEqual(358);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('backup-restore-dialog-390.png', { fullPage: false });
  const restoreButton = dialog.getByRole('button', { name: /^Restore$/i });
  await restoreButton.scrollIntoViewIfNeeded();
  await expect(restoreButton).toBeVisible();
});

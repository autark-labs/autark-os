import { expect, test, type Page } from 'playwright/test';
import { installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

async function openRoute(page: Page, path: string, scenario: FixtureScenario = 'ready') {
  await installMockApi(page, scenario);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

test('setup, app management, and Access controls work with the keyboard', async ({ page }) => {
  await openRoute(page, '/setup', 'onboarding');
  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await continueButton.focus();
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(continueButton).toBeVisible();

  await openRoute(page, '/apps');
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  const selectApp = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i });
  await selectApp.focus();
  await expect(selectApp).toBeFocused();
  await page.keyboard.press('Enter');
  const manageApp = page.getByRole('button', { name: /^Manage app$/i });
  await expect(manageApp).toBeVisible();
  await manageApp.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Management$/i)).toBeVisible();
  await expect(page.locator('div[data-slot="card"][inert]').filter({ hasText: /Vaultwarden with a deliberately long/i })).toHaveCount(1);

  await openRoute(page, '/access');
  const reviewService = page.getByRole('button', { name: /Review Vaultwarden.*Private/i });
  await reviewService.focus();
  await expect(reviewService).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(reviewService.locator('xpath=ancestor::*[contains(@class, "ring-2")][1]')).toHaveCount(1);
  const details = reviewService.locator('xpath=ancestor::*[@id][1]').getByRole('button', { name: /Details and actions/i });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: /Security posture for Vaultwarden/i })).toBeVisible();
});

test('backup dialog traps focus and returns it to the trigger when closed', async ({ page }) => {
  await openRoute(page, '/backups?app=vaultwarden&backup=101', 'idle');
  await expect(page.getByText(/Backups \/ App backups \/ Vaultwarden with a deliberately long/i)).toBeVisible();
  await expect(page.locator('nav[aria-label="Backup folders"] img[src="/app-images/vaultwarden.svg"]')).toBeVisible();
  await expect(page).toHaveURL(/\/backups\?app=vaultwarden&backup=101$/);

  const fullCheckpoints = page.getByRole('button', { name: /Full checkpoints/i });
  await fullCheckpoints.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Backups / Full checkpoints')).toBeVisible();
  await expect(page).toHaveURL(/\/backups\?scope=full$/);

  const chooseApp = page.getByRole('button', { name: /^Choose an app$/i });
  await chooseApp.focus();
  await page.keyboard.press('Enter');
  const appDirectory = page.getByRole('menuitem', { name: /Vaultwarden with a deliberately long/i });
  await appDirectory.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Backups \/ App backups \/ Vaultwarden with a deliberately long/i)).toBeVisible();
  await expect(page).toHaveURL(/\/backups\?app=vaultwarden$/);

  const restorePoint = page.locator('button').filter({ hasText: /vaultwarden-with-a-deliberately-long-self-hosted-service-name-2025-01-14\.autark-backup/i });
  await restorePoint.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/backups\?app=vaultwarden&backup=101$/);

  const details = page.getByRole('button', { name: /^Details$/i });
  await details.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/Restore point details/i);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(details).toBeFocused();
});

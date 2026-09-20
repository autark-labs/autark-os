import { expect, test, type Page } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';
import type { ApplicationState } from '../src/types/applicationState';

async function openApps(page: Page) {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

for (const mode of ['Basic', 'Advanced']) {
  test(`Grid/List preserves ${mode} disclosure, navigation, and app selection`, async ({ page }) => {
    await openApps(page);
    const settingsWrites: string[] = [];
    page.on('request', request => {
      if (request.url().endsWith('/api/system/settings') && request.method() === 'PUT') settingsWrites.push(request.url());
    });
    await page.getByRole('button', { name: mode, exact: true }).click();
    const storage = page.getByRole('link', { name: 'Storage', exact: true });
    const expectedLinks = mode === 'Advanced' ? 1 : 0;
    await expect(storage).toHaveCount(expectedLinks);
    for (const layout of ['Grid', 'List']) {
      const toggle = page.getByRole('radio', { name: `${layout} view` });
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toBeChecked();
      await expect(storage).toHaveCount(expectedLinks);
      await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
      const dialog = page.getByRole('dialog', { name: /Vaultwarden/ });
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/focus=managed%3Avaultwarden&panel=manage/);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(await page.evaluate(() => localStorage.getItem('autark-os.viewMode'))).toBe(mode.toLowerCase());
    await page.getByRole('link', { name: 'Access', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Devices', exact: true })).toHaveCount(expectedLinks);
    await page.goto('/activity');
    await expect(page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'System metrics', exact: true })).toHaveCount(expectedLinks);
    await page.getByRole('link', { name: 'My Apps', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked();
    await expect(storage).toHaveCount(expectedLinks);
    await page.getByRole('button', { name: mode === 'Basic' ? 'Advanced' : 'Basic', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked();
    expect(settingsWrites).toEqual([]);
  });
}

test('saving appliance settings leaves the app layout unchanged', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'Grid view' }).click();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('textbox', { name: /^Device name/ }).fill('Updated server');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Grid view' })).toBeChecked();
  await expect(page.getByRole('link', { name: 'Storage', exact: true })).toBeVisible();
});

test('clicking a Grid-view app title opens app management', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'Grid view' }).click();

  await page.getByRole('button', { name: /Select Vaultwarden with a deliberately long/i }).click();
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
});

test('clicking a non-action area of a List-view row opens app management', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'List view' }).click();

  const firstRow = page.getByTestId('advanced-table-scroll-area').locator('tbody tr').first();
  await firstRow.locator('td').nth(3).click();
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
});

test('management shortcuts and menu agree on disabled runtime actions', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/home');
  const state: ApplicationState = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const app = state.applications.find(app => app.id === 'vaultwarden')!;
  app.runtime!.state = 'stopped';
  app.availableActions.push({ id: 'start', label: 'Start', kind: 'action', href: '/api/apps/vaultwarden/start', method: 'POST', disabled: true, reason: 'The original Compose file is missing.' });
  await page.route('**/api/application-state*', route => route.fulfill({ json: state }));
  let starts = 0;
  await page.route('**/api/apps/vaultwarden/start', route => { starts++; return route.fulfill({ status: 500, json: {} }); });
  await page.goto('/apps?focus=managed%3Avaultwarden');
  const overview = page.getByRole('tabpanel', { name: 'Overview', exact: true });
  await expect(overview.getByRole('button', { name: 'Start app', exact: true })).toBeDisabled();
  await overview.getByLabel('The original Compose file is missing.', { exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('The original Compose file is missing.');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'App actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Start app/ })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: /^Start app/ })).toContainText('The original Compose file is missing.');
  await expect(page.getByRole('menuitem', { name: /^Repair app/ })).toHaveCount(0);
  expect(starts).toBe(0);
});

test('an unknown management link never selects a different app', async ({ page }) => {
  await openApps(page);
  await page.goto('/apps?focus=managed%3Aunknown&panel=manage');
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Manage Vaultwarden/ })).toBeVisible();
});

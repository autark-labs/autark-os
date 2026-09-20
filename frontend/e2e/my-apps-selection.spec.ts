import { expect, test, type Page } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

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
    await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
    const selectedUrl = page.url();
    for (const layout of ['Grid', 'List']) {
      const toggle = page.getByRole('radio', { name: `${layout} view` });
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toBeChecked();
      await expect(storage).toHaveCount(expectedLinks);
      await expect(page).toHaveURL(selectedUrl);
      await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Manage app', exact: true })).toBeEnabled();
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

test('clicking a Grid-view app title selects the app for the details rail', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'Grid view' }).click();

  await page.getByRole('button', { name: /Select Vaultwarden with a deliberately long/i }).click();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

test('clicking a non-action area of a List-view row selects the app for the details rail', async ({ page }) => {
  await openApps(page);
  await page.getByRole('radio', { name: 'List view' }).click();

  const firstRow = page.getByTestId('advanced-table-scroll-area').locator('tbody tr').first();
  await firstRow.locator('td').nth(3).click();
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

const appStateConsumerRoutes = [
  '/home',
  '/apps',
  '/discover',
  '/access',
  '/backups',
  '/storage',
  '/activity',
  '/diagnostics',
];

test('every app-state surface identifies preserved data as out of date', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');

  for (const path of appStateConsumerRoutes) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'App refresh paused', exact: true }).click();
    await expect(page.getByText(/App information may be out of date/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page);
  }
});

test('a failed first snapshot never renders the My Apps empty state as current', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No managed apps or linked services', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'App information unavailable' })).toBeVisible();
  await expect(page.getByText('No apps installed yet', { exact: true })).toBeHidden();

  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Current app information is unavailable', { exact: true })).toBeHidden();
  await expect(page.getByText('Vaultwarden with a deliberately long self-hosted service name', { exact: true }).first()).toBeVisible();
});

test('focused Settings keeps the canonical warning visible', async ({ page }) => {
  await installMockApi(page, 'app-state-stale');
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: 'App refresh paused', exact: true }).click();
  await expect(page.getByText(/App information may be out of date/)).toBeVisible();

});

test('a failed manual refresh is shared and a successful poll clears it everywhere', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'App information', exact: true })).toBeVisible();
  await page.route('**/api/application-state/refresh', route => route.fulfill({ status: 503, json: { message: 'App refresh failed' } }));
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('button', { name: 'App information', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh app information', exact: true }).click();
  await expect(page.getByRole('button', { name: 'App refresh paused', exact: true, includeHidden: true })).toHaveCount(2);
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/application-state' && response.request().method() === 'GET');
  await expect(page.getByRole('button', { name: 'App information', exact: true, includeHidden: true })).toHaveCount(2);
  await expect(page.getByText('App information is up to date.', { exact: true })).toBeVisible();
});

for (const path of ['/home', '/access']) {
  for (const scenario of ['app-state-unavailable', 'idle'] as const) {
  test(`${path} explains unavailable app content and retries after ${scenario === 'idle' ? 'transport' : 'canonical'} failure`, async ({ page }) => {
    await installMockApi(page, scenario);
    if (scenario === 'idle') await page.route(/\/api\/application-state(?:\?.*)?$/, route => route.fulfill({ status: 503, json: { message: 'Inventory unavailable' } }));
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText(/app information is unavailable/i);
    await expect(page.getByText('No apps installed yet', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No services match these filters.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Vaultwarden with a deliberately long self-hosted service name', exact: true }).first()).toBeVisible();
  });
  }
}

test('a failed background poll preserves the launcher and a newer poll restores current status', async ({ page }) => {
  test.setTimeout(40_000);
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const app = page.getByRole('link', { name: 'Open Vaultwarden with a deliberately long self-hosted service name', exact: true }).first();
  await expect(app).toBeVisible();
  let fail = true;
  await page.route(/\/api\/application-state(?:\?.*)?$/, route => fail ? route.fulfill({ status: 503, json: { message: 'Poll failed' } }) : route.fallback());
  await expect(page.getByRole('button', { name: 'App refresh paused', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(app).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  fail = false;
  await expect(page.getByRole('button', { name: 'App information', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(app).toBeVisible();
});

test('Home distinguishes a loading inventory from a confirmed empty inventory', async ({ page }) => {
  await installMockApi(page, 'empty');
  let finishRequest!: () => void;
  const pending = new Promise<void>(resolve => { finishRequest = resolve; });
  await page.route(/\/api\/application-state(?:\?.*)?$/, async route => { await pending; await route.fallback(); });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status')).toContainText('Checking apps');
  await expect(page.getByText('No apps installed yet', { exact: true })).toHaveCount(0);
  finishRequest();
  await expect(page.getByText('No apps installed yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Settings does not invent app counts before inventory is available', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/settings');
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  for (const [group, label] of [[/Apps.*Managed app defaults/, 'Repair coverage'], [/Backups.*Backup schedule/, 'Apps protected'], [/Network.*Local links/, 'Private apps']] as const) {
    await dialog.getByRole('button', { name: group }).click();
    await expect(dialog.getByText(label, { exact: true }).locator('../..')).toContainText('App information unavailable');
  }
  await dialog.getByRole('button', { name: 'App information unavailable', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh app information', exact: true }).click();
  await expect(dialog.getByText('Private apps', { exact: true }).locator('../..')).not.toContainText('unavailable');
});

test('Diagnostics keeps independent support tools but does not claim missing app data is healthy', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.route(/\/api\/application-state(?:\?.*)?$/, route => route.fulfill({ status: 503, json: { message: 'Inventory unavailable' } }));
  await page.goto('/diagnostics');
  await expect(page.getByText('Apps', { exact: true }).first().locator('..')).toContainText('Status unavailable');
  await page.getByRole('tab', { name: 'System details', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Current app information is unavailable');
  await expect(page.getByText('No apps require ownership review.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tailscale details', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('App ownership details', { exact: true })).toBeVisible();
});

test('Activity keeps independent history but distinguishes unavailable app metrics from no samples', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/activity');
  await page.getByRole('tab', { name: 'System metrics', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Current app information is unavailable');
  await expect(page.getByText('No app resource samples', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Latest confirmed samples', { exact: true })).toBeVisible();
});

test('Access keeps network troubleshooting usable without app inventory', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/access?tab=devices');
  await expect(page.getByText('Your devices', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByText('Tailscale setup', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Matrix', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Current app information is unavailable');
});

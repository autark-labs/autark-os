import { expect, test, type Page } from 'playwright/test';
import type { ApplicationState } from '../src/types/applicationState';
import { installMockApi, stabilizePage } from './support/mockApi';

for (const width of [1280, 390]) {
test(`app settings preserve edits and show job recovery at ${width}px`, async ({ page }) => {
  test.fixme(width === 390, 'Mobile management optimization is explicitly deferred by FE-13.');
  await page.setViewportSize({ width, height: 960 });
  await installMockApi(page, 'ready');
  let submitted = false;
  let failed = false;
  const recoveryMessage = 'Recovery could not be confirmed. Use Repair in My Apps.';
  const job = () => ({
    jobId: 'settings-recovery-test', type: 'save_app_settings', subjectId: 'vaultwarden',
    status: failed ? 'failed' : 'running', currentStep: 'apply_settings',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    steps: [{ id: 'apply_settings', label: 'Apply settings', status: failed ? 'failed' : 'running', message: failed ? recoveryMessage : 'Applying settings' }],
    error: failed ? { code: 'job_failed', message: recoveryMessage, details: {} } : null,
  });
  await page.route('**/api/jobs', route => route.fulfill({ json: submitted ? [job()] : [] }));
  await page.route('**/api/jobs/settings-recovery-test', route => route.fulfill({ json: job() }));
  await page.route('**/api/apps/vaultwarden/settings-plan', route => route.fulfill({ json: {
    appId: 'vaultwarden', appName: 'Vaultwarden', impact: 'redeploy_required', headline: 'App configuration change',
    summary: 'Running apps restart; paused apps stay paused.', saveAllowed: true, redeployRequired: true,
    restartRequired: false, dataMigrationRequired: false, changes: ['Change port'], warnings: [], blockedReasons: [],
  } }));
  await page.route('**/api/apps/vaultwarden/settings', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON().expectedProtocol).toBe('http');
    submitted = true;
    return route.fulfill({ json: job() });
  });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Local protocol', { exact: true })).toHaveCount(0);
  await page.getByLabel('Local app port', { exact: true }).fill('19090');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect.poll(() => submitted).toBe(true);
  await expect(page.getByText('Settings change started', { exact: true })).toBeVisible();
  failed = true;
  await expect(page.getByText(recoveryMessage, { exact: true }).first()).toBeVisible();
});
}

async function editAppSettings(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installMockApi(page, 'idle');
  await page.route('**/api/recommended-action', route => route.fulfill({ json: {
    id: 'review-syncthing', severity: 'warning', title: 'Review Syncthing', body: 'Review app settings.', dismissible: true,
    primaryAction: { id: 'review-syncthing', label: 'Manage Syncthing', route: '/apps?focus=managed%3Asyncthing&panel=manage', method: null, href: null },
  } }));
  await page.goto('/home');
  const state: ApplicationState = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const app = state.applications.find(app => app.id === 'vaultwarden')!;
  const other = structuredClone(app);
  other.id = other.runtime!.appId = 'syncthing';
  other.name = other.runtime!.appName = 'Syncthing';
  other.runtime!.settings!.expectedLocalPort = 8384;
  state.applications.push(other);
  await page.route('**/api/application-state*', route => route.fulfill({ json: state }));
  await page.reload();
  await page.getByRole('link', { name: 'My Apps', exact: true }).click();
  await page.getByRole('radio', { name: 'Grid view' }).click();
  await page.getByRole('button', { name: `Manage ${app.name}`, exact: true }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const port = page.getByLabel('Local app port', { exact: true });
  await expect(port).toHaveValue('8080');
  await port.fill('19090');
  return { state, app, port };
}

test('app draft survives tab changes, polling, and operation updates until explicit reset', async ({ page }) => {
  test.setTimeout(45_000);
  const { app, port } = await editAppSettings(page);
  for (const tab of ['Guide', 'Links', 'Overview', 'Settings']) {
    await page.getByRole('tab', { name: tab, exact: true }).first().click();
  }
  await expect(port).toHaveValue('19090');
  app.runtime!.settings!.expectedLocalPort = 18080;
  app.operation = { kind: 'backing_up', label: 'Creating backup' };
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/application-state' && response.request().method() === 'GET');
  await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(port).toHaveValue('19090');
  await expect(port).toBeDisabled();
  app.operation = { kind: 'failed', label: 'Backup failed', message: 'Disk full', jobType: 'backup' };
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/application-state' && response.request().method() === 'GET');
  await expect(port).toBeEnabled();
  await expect(port).toHaveValue('19090');
  await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(port).toHaveValue('18080');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  app.operation = { kind: 'idle' };
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/application-state' && response.request().method() === 'GET');
  await expect(page.getByRole('tab', { name: 'Recovery', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true }).first()).toHaveAttribute('aria-selected', 'true');
});

test('canceling close, outside click, navigation, Back and reload retains the draft; discard clears it', async ({ page }) => {
  const { port } = await editAppSettings(page);
  const currentUrl = page.url();
  const guard = page.getByRole('alertdialog');
  const close = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
  await close.click();
  await expect(guard).toContainText('Discard unsaved app settings?');
  await guard.getByRole('button', { name: 'Keep editing' }).click();
  await expect(close).toBeFocused();
  await expect(port).toHaveValue('19090');
  for (const attempt of [
    () => page.mouse.click(5, 5),
    () => page.keyboard.press('Escape'),
    async () => {
      await page.getByRole('tab', { name: 'Links', exact: true }).click();
      await page.getByRole('link', { name: 'Access', exact: true }).click();
    },
    () => page.goBack(),
  ]) {
    await attempt();
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(currentUrl.replace(/tab=settings/, 'tab=' + (await page.getByRole('tab', { selected: true }).innerText()).toLowerCase()));
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await expect(port).toHaveValue('19090');
  }
  let unload = false;
  page.on('dialog', async dialog => { unload = dialog.type() === 'beforeunload'; await dialog.dismiss(); });
  await port.focus();
  await page.evaluate(() => window.location.reload());
  await expect.poll(() => unload).toBe(true);
  await expect(port).toHaveValue('19090');
  await close.click();
  await guard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(port).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage Syncthing', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(port).toHaveValue('8384');
  await port.fill('18384');
  await page.goBack();
  await guard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(port).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/focus=managed%3Asyncthing&panel=manage/);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(port).toHaveValue('8384');
});

test('failed settings requests retain edits; accepted save clears the dirty guard', async ({ page }) => {
  const { port, app } = await editAppSettings(page);
  await page.route('**/api/apps/vaultwarden/settings-plan', route => route.fulfill({ json: {
    headline: 'Save app settings?', summary: 'Review changes', saveAllowed: true, changes: ['Change port'], warnings: [], blockedReasons: [],
  } }));
  let fail = true;
  await page.route('**/api/apps/vaultwarden/settings', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON().expectedLocalPort).toBe(19090);
    if (fail) return route.fulfill({ status: 503, json: { message: 'Cannot save right now' } });
    app.runtime!.settings!.expectedLocalPort = 19090;
    return route.fulfill({ json: { jobId: 'saved-settings', type: 'save_app_settings', subjectId: app.id, status: 'succeeded', steps: [], updatedAt: new Date().toISOString() } });
  });
  for (const failure of [true, false]) {
    fail = failure;
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save settings', exact: true }).click();
    const popup = page.locator('[data-sonner-toast]');
    if (failure) await expect(popup).toContainText('Cannot save right now');
    // Do not wait for the confirmation to unmount before using its result notification.
    await popup.getByRole('button', { name: 'Close toast', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(port).toHaveValue('19090');
    if (failure) {
      await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    }
  }
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  page.on('dialog', () => { throw new Error('Saved settings must not prompt for discard'); });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/apps$/);
});

test('a notification targeting another app cannot replace a dirty app without confirmation', async ({ page }) => {
  const { port } = await editAppSettings(page);
  for (const accept of [false, true]) {
    await page.getByRole('tab', { name: 'Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Copy details', exact: true }).click();
    await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('tab', { name: 'Now', exact: true }).click();
    await page.getByRole('region', { name: 'Action needed' }).getByRole('button', { name: 'Manage Syncthing', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: accept ? 'Discard changes' : 'Keep editing' }).click();
    if (!accept) {
      await expect(page).toHaveURL(/focus=managed%3Avaultwarden&panel=manage/);
      await page.getByRole('tab', { name: 'Settings', exact: true }).click();
      await expect(port).toHaveValue('19090');
    }
  }
  await expect(page).toHaveURL(/focus=managed%3Asyncthing&panel=manage/);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(port).toHaveValue('8384');
});

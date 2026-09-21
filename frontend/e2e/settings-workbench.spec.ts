import { expect, test, type Locator } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

test('Settings does not claim appliance readiness when setup needs attention', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const setup = await page.evaluate(async () => (await fetch('/api/system/setup-status')).json());
  await page.route('**/api/system/setup-status', route => route.fulfill({ json: { ...setup, status: 'ready_with_notes', headline: 'Tailscale needs sign-in' } }));
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(dialog.getByRole('textbox', { name: /^Device name/ })).toBeVisible();
  await expect(dialog.getByText('Appliance ready', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Core services and private access are healthy.', { exact: true })).toHaveCount(0);
});

async function openSettings(page: Parameters<typeof installMockApi>[0]) {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
}

async function expectActionsWithinDialog(dialog: Locator) {
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds, 'confirmation dialog should be rendered').not.toBeNull();

  for (const actionName of ['Keep editing', 'Discard changes', 'Save and close']) {
    const actionBounds = await dialog.getByRole('button', { name: actionName }).boundingBox();
    expect(actionBounds, `${actionName} should be rendered`).not.toBeNull();
    expect(actionBounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x);
    expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(dialogBounds!.x + dialogBounds!.width);
  }
}

for (const entry of [
  { path: '/settings', section: 'General' },
  { path: '/home?settings=open', section: 'General' },
  { path: '/backups', button: 'Backup settings', section: 'Backups' },
  { path: '/diagnostics', button: 'Settings Host setup checks and appliance runtime checks.', section: 'Advanced' },
]) {
  test(`Settings opens one workbench at ${entry.section} from ${entry.path}`, async ({ page }) => {
    await installMockApi(page, 'ready');
    await page.goto(entry.path);
    if (entry.path === '/diagnostics') await page.getByRole('button', { name: 'System details', exact: true }).click();
    if (entry.button) await page.getByRole('button', { name: entry.button, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole('region', { name: 'Settings workspace' })).toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: entry.section, exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    if (entry.button) await expect(page.getByRole('button', { name: entry.button, exact: true })).toBeFocused();
  });
}

test('Settings guards Escape, preserves failed saves for retry, and returns focus after saving', async ({ page }) => {
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  const name = dialog.getByRole('textbox', { name: /^Device name/ });
  await name.fill('Retained settings draft');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Save settings before closing?');
  await confirmation.getByRole('button', { name: 'Keep editing' }).click();
  await expect(name).toHaveValue('Retained settings draft');
  let rejectSave = true;
  const writes: unknown[] = [];
  await page.route('**/api/system/settings', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const settings = route.request().postDataJSON();
    writes.push(settings);
    await route.fulfill(rejectSave
      ? { status: 500, json: { message: 'Settings could not be saved.' } }
      : { json: { settings, appDefaults: { message: 'Settings saved.', updatedApps: 0 } } });
  });
  await page.keyboard.press('Escape');
  await confirmation.getByRole('button', { name: 'Save and close', exact: true }).click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator('[data-sonner-toast]')).toContainText('Settings could not be saved.');
  await confirmation.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog.getByText('Save failed', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('Retained settings draft');
  rejectSave = false;
  await page.keyboard.press('Escape');
  await confirmation.getByRole('button', { name: 'Save and close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
});

test('Settings workbench keeps a fixed dialog while only its workspace scrolls', async ({ page }) => {
  await openSettings(page);

  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  const workspace = dialog.getByRole('region', { name: 'Settings workspace' });
  const initialBounds = await dialog.boundingBox();

  expect(initialBounds, 'settings dialog should be rendered').not.toBeNull();
  expect(initialBounds!.height, 'desktop settings workbench should use its fixed height').toBeCloseTo(768, 0);
  await expect(workspace).toBeVisible();

  await dialog.getByRole('button', { name: /Backups.*Backup schedule/i }).click();
  const backupBounds = await dialog.boundingBox();
  expect(backupBounds!.height, 'changing categories must not resize the dialog').toBeCloseTo(initialBounds!.height, 0);

  const workspaceMetrics = await workspace.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(workspaceMetrics.scrollHeight).toBeGreaterThan(workspaceMetrics.clientHeight);
  await workspace.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('button', { name: /Save changes/i })).toBeVisible();
});

test('Settings workbench uses the same guarded close flow for backdrop and close control', async ({ page }) => {
  await openSettings(page);

  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('textbox', { name: 'Device name' }).fill('Fixture Home Server updated');
  await expect(dialog.getByText('Unsaved changes', { exact: true })).toBeVisible();

  const bounds = await dialog.boundingBox();
  expect(bounds, 'settings dialog should be rendered').not.toBeNull();
  await page.mouse.click(bounds!.x - 8, bounds!.y + bounds!.height / 2);
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Save settings before closing?');
  await expectActionsWithinDialog(confirmation);
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Save settings before closing?');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();

  await page.getByRole('button', { name: 'Open settings' }).click();
  const cleanDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(cleanDialog.getByRole('textbox', { name: 'Device name' })).not.toHaveValue('Fixture Home Server updated');
  const cleanBounds = await cleanDialog.boundingBox();
  expect(cleanBounds, 'settings dialog should reopen').not.toBeNull();
  await page.mouse.click(cleanBounds!.x - 8, cleanBounds!.y + cleanBounds!.height / 2);
  await expect(cleanDialog).toHaveCount(0);
});

test('Settings does not expose appliance update controls', async ({ page }) => {
  await openSettings(page);

  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(dialog.getByRole('heading', { name: 'General', exact: true }).last()).toBeVisible();
  await expect(dialog.getByText(/software updates/i)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Update now', exact: true })).toHaveCount(0);
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await expect(dialog.getByText(/INSTALL-AUTARK-OS/)).toHaveCount(0);
});

async function destinationFixture(page: Parameters<typeof installMockApi>[0]) {
  await installMockApi(page, 'idle');
  await page.goto('/backups');
  await expect(page.getByRole('button', { name: 'Back up all', exact: true })).toBeEnabled();
  const report = await page.evaluate(async () => (await fetch('/api/backups')).json());
  const metrics = await page.evaluate(async () => (await fetch('/api/system/metrics')).json());
  const storage = await page.evaluate(async () => (await fetch('/api/system/storage')).json());
  const state = { path: '/srv/autark-test/backups', reject: false, loseResponse: false, reportFails: false, writes: [] as string[], settingsWrites: 0 };
  await page.route('**/api/system/metrics', route => route.fulfill({ json: { ...metrics, runtimeRoot: '/srv/autark-test' } }));
  await page.route('**/api/backups', route => route.fulfill(state.reportFails ? { status: 503, json: { message: 'Report unavailable' } } : { json: { ...report, destination: { ...report.destination, kind: state.path === '/srv/autark-test/backups' ? 'internal' : 'external', configuredPath: state.path, message: `Current location: ${state.path}` } } }));
  await page.route('**/api/system/storage', route => route.fulfill({ json: { ...storage, backupDestination: { ...report.destination, kind: state.path === '/srv/autark-test/backups' ? 'internal' : 'external', configuredPath: state.path, message: `Current location: ${state.path}` } } }));
  await page.route('**/api/backups/destination', async route => {
    const { path } = route.request().postDataJSON();
    state.writes.push(path);
    if (state.reject) return route.fulfill({ status: 400, json: { message: 'The folder is not writable.' } });
    state.path = path;
    if (state.loseResponse) return route.abort('failed');
    await route.fulfill({ json: { ...report.destination, kind: path === '/srv/autark-test/backups' ? 'internal' : 'external', configuredPath: path } });
  });
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/api/system/settings')) state.settingsWrites++; });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Back up all', exact: true })).toBeEnabled();
  await page.locator('a[href="/storage"]').first().click();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('textbox', { name: 'Device name' }).fill('Unsaved appliance name');
  await dialog.getByRole('button', { name: /Backups.*Backup schedule/i }).click();
  const location = dialog.getByRole('region', { name: 'Backup location', exact: true });
  return { state, dialog, location };
}

for (const width of [1024, 1440]) {
test(`backup location preserves drafts, refreshes Storage and supports return to a custom local root at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { state, dialog, location } = await destinationFixture(page);
  await expect(location.getByRole('textbox')).toHaveCount(0);
  await location.getByRole('button', { name: 'Manage location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Apply location', exact: true })).toBeDisabled();
  await location.getByRole('radio', { name: 'External drive', exact: true }).click();
  await location.getByLabel('Folder on a mounted external drive').fill('/mnt/fixture-drive/backups');
  await location.getByRole('button', { name: 'Apply location', exact: true }).scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/autark-fe11-production-${width}.png` });
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeFocused();
  await expect(location).toContainText('Current location: /mnt/fixture-drive/backups');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: /General.*Identity and local time/ }).click();
  await expect(dialog.getByRole('textbox', { name: 'Device name' })).toHaveValue('Unsaved appliance name');
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('does not undo applied backup location changes');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  expect(state.settingsWrites).toBe(0);
  expect(state.path).toBe('/mnt/fixture-drive/backups');
  await expect(page.getByText(/Backup storage is on a separate drive/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await dialog.getByRole('button', { name: /Backups.*Backup schedule/i }).click();
  await expect(location).toContainText('External drive');
  await expect(location.getByRole('textbox')).toHaveCount(0);
  await location.getByRole('button', { name: 'Manage location', exact: true }).click();
  await location.getByRole('radio', { name: 'This device', exact: true }).click();
  await expect(location).toContainText('do not protect against its drive failing');
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeVisible();
  expect(state.writes).toEqual(['/mnt/fixture-drive/backups', '/srv/autark-test/backups']);
  await expect(location).toContainText('This device');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
});
}

test('location validation failure retains the current location and entered path for retry', async ({ page }) => {
  const { state, location } = await destinationFixture(page);
  state.reject = true;
  await location.getByRole('button', { name: 'Manage location', exact: true }).click();
  await location.getByRole('radio', { name: 'External drive', exact: true }).click();
  await location.getByLabel('Folder on a mounted external drive').fill('/mnt/retry-drive/backups');
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('alert')).toContainText('The folder is not writable.');
  await expect(location.getByLabel('Folder on a mounted external drive')).toHaveValue('/mnt/retry-drive/backups');
  await expect(location).toContainText('Current location: /srv/autark-test/backups');
  state.reject = false;
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeVisible();
  expect(state.writes).toEqual(['/mnt/retry-drive/backups', '/mnt/retry-drive/backups']);
});

test('a lost location response reconciles current status without claiming the location is unchanged', async ({ page }) => {
  const { state, location } = await destinationFixture(page);
  state.loseResponse = true;
  await location.getByRole('button', { name: 'Manage location', exact: true }).click();
  await location.getByRole('radio', { name: 'External drive', exact: true }).click();
  await location.getByLabel('Folder on a mounted external drive').fill('/mnt/response-lost/backups');
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('alert')).toContainText('Review the current location before retrying.');
  await expect(location).toContainText('Current location: /mnt/response-lost/backups');
  await expect(location.getByRole('button', { name: 'Apply location', exact: true })).toBeDisabled();
  await location.getByRole('button', { name: 'Cancel location change', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeFocused();
});

test('a confirmed location save is not reported as failed when its status refresh fails', async ({ page }) => {
  const { state, location, dialog } = await destinationFixture(page);
  await location.getByRole('button', { name: 'Manage location', exact: true }).click();
  await location.getByRole('radio', { name: 'External drive', exact: true }).click();
  await location.getByLabel('Folder on a mounted external drive').fill('/mnt/status-retry/backups');
  state.reportFails = true;
  await location.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Check location', exact: true })).toBeVisible();
  await expect(location).toContainText('last known value');
  await expect(dialog.getByText('Backup location changed', { exact: true })).toBeVisible();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeDisabled();
  state.reportFails = false;
  await location.getByRole('button', { name: 'Check location', exact: true }).click();
  await expect(location).toContainText('Current location: /mnt/status-retry/backups');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(1);
});

test('unavailable backup data blocks only location changes and can be retried without losing settings edits', async ({ page }) => {
  await installMockApi(page, 'idle');
  let unavailable = true;
  await page.route('**/api/backups', route => unavailable ? route.fulfill({ status: 503, json: {} }) : route.fallback());
  await page.goto('/home');
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('textbox', { name: 'Device name' }).fill('Keep this draft');
  await dialog.getByRole('button', { name: /Backups.*Backup schedule/i }).click();
  const location = dialog.getByRole('region', { name: 'Backup location', exact: true });
  await expect(location).toContainText('Backup location could not be loaded.');
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  unavailable = false;
  await location.getByRole('button', { name: 'Check location', exact: true }).click();
  await expect(location.getByRole('button', { name: 'Manage location', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: /General.*Identity and local time/ }).click();
  await expect(dialog.getByRole('textbox', { name: 'Device name' })).toHaveValue('Keep this draft');
});

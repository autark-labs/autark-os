import { expect, test } from 'playwright/test';
import type { DiscoverAppView } from '../src/types/discover';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

for (const width of [320, 390, 640, 768, 1024, 1280, 1440]) {
  test(`${width}px page headers keep internal rows together without clipping`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await installMockApi(page, 'ready');
    for (const collapsed of width >= 1024 ? [false, true] : [false]) {
      for (const [route, title, metrics] of [
        ['/apps', 'My Apps', ['Managed apps', 'Needs review']],
        ['/access', 'Access', ['Reachable services', 'Needs review']],
        ['/backups', 'Backups', ['Protected apps']],
        ['/storage', 'Storage', ['Used', 'Free']],
        ['/activity', 'Activity Log', []],
        ['/diagnostics', 'Diagnostics', []],
      ] as const) {
        await page.goto(route);
        const heading = page.getByRole('heading', { name: title, exact: true });
        await expect(heading).toBeVisible();
        if (collapsed && await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).count()) {
          await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
        }
        const header = heading.locator('xpath=ancestor::header');
        const bounds = (await header.boundingBox())!;
        for (const element of [heading, ...await header.getByRole('button').all(), ...metrics.map(label => header.getByText(label, { exact: true }))]) {
          const box = (await element.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(bounds.x);
          expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
          expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
        if (metrics.length === 2) {
          const first = (await header.getByText(metrics[0], { exact: true }).boundingBox())!;
          const second = (await header.getByText(metrics[1], { exact: true }).boundingBox())!;
          expect(second.y).toBe(first.y);
          expect(second.x).toBeGreaterThan(first.x + first.width);
        }
        if (route === '/access') {
          const refresh = (await header.getByRole('button', { name: 'Refresh', exact: true }).boundingBox())!;
          const status = (await header.getByText('Auto-updates every 10s', { exact: true }).boundingBox())!;
          expect(refresh.y).toBeLessThan(status.y + status.height);
          expect(status.y).toBeLessThan(refresh.y + refresh.height);
        }
        await expectNoHorizontalOverflow(page);
      }
    }
  });
}

for (const width of [320, 390, 1024, 1440]) {
  test(`${width}px unused-link disclosure leaves the matrix stable and requires confirmation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await installMockApi(page, 'idle');
    let deleted = false;
    await page.route('**/api/network/private-access/reconciliation', route => route.fulfill({ json: {
      status: 'needs_attention', apps: [], checkedAt: '2025-01-15T12:00:00Z',
      staleMappings: deleted ? [] : [{ id: 'stale-12078', servePort: 12078, endpoint: 'https://fixture.ts.net:12078', target: 'http://127.0.0.1:3003', detail: 'No app expects this link.' }],
    } }));
    await page.route('**/api/network/private-access/stale/12078', route => {
      expect(route.request().method()).toBe('DELETE');
      deleted = true;
      return route.fulfill({ json: { ok: true, message: 'Removed' } });
    });
    await page.goto('/access');
    const matrix = page.getByRole('heading', { name: 'Reachability matrix', exact: true });
    await expect(matrix).toBeVisible();
    if (width < 1280) {
      const zones = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'Server', exact: true }) });
      const bounds = (await zones.boundingBox())!;
      for (const tab of await zones.getByRole('tab').all()) {
        const tabBounds = (await tab.boundingBox())!;
        expect(tabBounds.y + tabBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
    const before = await matrix.boundingBox();
    const chip = page.getByRole('button', { name: '1 unused link', exact: true });
    await chip.click();
    const popover = page.getByRole('dialog', { name: 'Access / Unused private links' });
    await expect(popover).toBeVisible();
    const bounds = (await popover.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(300);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await matrix.boundingBox()).toEqual(before);
    await popover.getByRole('button', { name: 'Remove stale link', exact: true }).click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toContainText('No app data will be deleted');
    expect(deleted).toBe(false);
    await confirmation.getByRole('button', { name: 'Keep link' }).click();
    expect(deleted).toBe(false);
    await expect(popover.getByRole('button', { name: 'Remove stale link' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(chip).toBeFocused();
    await page.getByRole('tab', { name: 'Issues', exact: true }).click();
    await page.getByRole('button', { name: 'Review unused links', exact: true }).click();
    await expect(popover).toBeVisible();
    await popover.getByRole('button', { name: 'Remove stale link' }).click();
    await confirmation.getByRole('button', { name: 'Remove stale link' }).click();
    await expect.poll(() => deleted).toBe(true);
    await expect(page.getByRole('button', { name: 'Private links', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test(`${width}px recovery remains retrievable without a page banner`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await installMockApi(page, 'idle');
    await page.goto('/apps');
    const chip = page.getByRole('button', { name: '1 to recover', exact: true });
    await chip.click();
    await expect(page.getByRole('link', { name: 'Review Immich', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chip).toBeFocused();
    await chip.click();
    await page.getByRole('link', { name: 'Review Immich', exact: true }).click();
    await expect(page).toHaveURL(/\/apps\?review=immich/);
    await expect(page.getByRole('dialog', { name: 'Recover Immich', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('failed Access action has one result, not a false page-load error or layout shift', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installMockApi(page, 'idle');
  await page.route('**/api/apps/vaultwarden/settings', route => route.fulfill({ status: 500, json: { message: 'Fixture access change failed.' } }));
  await page.goto('/access');
  const matrix = page.getByRole('heading', { name: 'Reachability matrix', exact: true });
  await expect(matrix).toBeVisible();
  const before = await matrix.boundingBox();
  const service = page.getByRole('button', { name: /^Review Vaultwarden/ });
  await service.click();
  await service.locator('xpath=ancestor::*[@id][1]').getByRole('button', { name: 'Details and actions', exact: true }).click();
  await page.getByRole('group', { name: /^Security posture for Vaultwarden/ }).getByRole('radio', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Reachability update failed');
  await expect(page.getByText('Access status could not load', { exact: true })).toHaveCount(0);
  expect(await matrix.boundingBox()).toEqual(before);
});

test('Discover initial ownership failure is unavailable, not an endless catalog spinner', async ({ page }) => {
  await installMockApi(page, 'app-state-unavailable');
  await page.goto('/discover');
  await expect(page.getByText('Discover catalog could not load', { exact: true })).toBeVisible();
  await expect(page.getByText('Loading Discover', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
});

test('Activity initial partial failure does not claim an empty event history', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.route('**/api/activity?**', route => route.fulfill({ status: 503, json: { message: 'Activity offline' } }));
  await page.goto('/activity');
  await expect(page.getByText('History is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(/No events/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});

test('failed diagnostics export reports the action failure without displacing Activity', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.route('**/api/monitoring/diagnostics**', route => route.fulfill({ status: 503, json: { message: 'Export unavailable' } }));
  await page.goto('/activity');
  const button = page.getByRole('button', { name: 'Export', exact: true });
  await expect(button).toBeVisible();
  const before = await button.boundingBox();
  await button.click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Monitoring diagnostics could not be exported');
  expect(await button.boundingBox()).toEqual(before);
  await expect(page.getByText('Monitoring data could not refresh', { exact: true })).toHaveCount(0);
});

test('lost Discover job progress is not reported as a failed install and can be retried', async ({ page }) => {
  await installMockApi(page, 'idle');
  const job = { jobId: 'progress-test', type: 'install_app', subjectId: 'immich', status: 'running', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z' };
  let offline = false;
  let loaded = false;
  await page.route('**/api/jobs', route => {
    loaded = true;
    return route.fulfill(offline
      ? { status: 503, json: { message: 'Progress offline' } } : { json: [job] });
  });
  await page.goto('/discover');
  await expect.poll(() => loaded).toBe(true);
  offline = true;
  const chip = page.getByRole('button', { name: 'Refresh paused', exact: true });
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'Current status', exact: true })).toContainText('This does not mean the operation failed');
  await expect(page.getByText('Install failed', { exact: true })).toHaveCount(0);
  offline = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
});

test('an already-failed install response still gets global feedback without a result banner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installMockApi(page, 'idle');
  await page.clock.install();
  await page.goto('/home');
  const apps: DiscoverAppView[] = await page.evaluate(async () => (await fetch('/api/discover/apps')).json());
  const app = apps.find(view => view.application.id === 'immich')!.application;
  app.relationship = 'available';
  app.primaryAction = { id: 'review_setup', label: 'Review install', kind: 'install', href: null, method: null, disabled: false, reason: '' };
  let catalogRequests = 0;
  await page.route('**/api/discover/apps', route => { catalogRequests++; return route.fulfill({ json: apps }); });
  await page.route('**/api/discover/apps/immich/install', route => route.fulfill({ json: {
    jobId: 'failed-install', type: 'install_app', subjectId: 'immich', status: 'failed', steps: [],
    createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z',
    error: { code: 'fixture', message: 'The selected port is already in use.', details: {} },
  } }));
  await page.goto('/discover?detail=immich');
  await page.getByRole('button', { name: 'Review install', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Install Immich', exact: true });
  await dialog.getByRole('checkbox', { name: 'Confirm install plan', exact: true }).check();
  const beforePoll = catalogRequests;
  await page.clock.fastForward(31_000);
  await expect.poll(() => catalogRequests).toBeGreaterThan(beforePoll);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Confirm install plan', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Install app', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('The selected port is already in use.');
  await expect(page.getByRole('button', { name: 'Dismiss install result', exact: true })).toHaveCount(0);
});

test('Settings save failure preserves the draft and workspace dimensions', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/settings');
  const settings = page.getByRole('dialog', { name: 'Autark-OS settings', exact: true });
  const name = settings.getByRole('textbox', { name: /^Device name/ });
  await name.fill('Keep these edits');
  const workspace = settings.getByRole('region', { name: 'Settings workspace' });
  const before = await workspace.boundingBox();
  let offline = true;
  await page.route('**/api/system/settings', route => offline && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { message: 'Settings write failed.' } }) : route.fallback());
  await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Save failed', exact: true })).toBeVisible();
  await expect(name).toHaveValue('Keep these edits');
  expect(await workspace.boundingBox()).toEqual(before);
  await settings.getByRole('button', { name: 'Save failed', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings / Current status' })).toContainText('Your edits are still here');
  await page.keyboard.press('Escape');
  offline = false;
  await page.locator('[data-sonner-toast] [data-close-button]').click();
  await expect(settings.getByRole('button', { name: 'Save failed', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
});

test('an immediately failed backup response leaves the action available to retry', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.route('**/api/backups/full/run', route => route.fulfill({ json: {
    jobId: 'failed-backup', type: 'full_backup', subjectId: '__full__', status: 'failed', steps: [],
    createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z',
    error: { code: 'fixture', message: 'Backup destination is unavailable.', details: {} },
  } }));
  await page.goto('/backups');
  await page.getByRole('button', { name: 'Back up all', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('Backup destination is unavailable.');
  await expect(page.getByRole('button', { name: 'Back up all', exact: true })).toBeEnabled();
});

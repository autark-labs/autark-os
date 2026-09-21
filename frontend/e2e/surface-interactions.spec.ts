import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

test('Diagnostics uses structured checks and backend findings without inventing backup protection', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/diagnostics');
  const [summary, doctor] = await page.evaluate(async () => Promise.all(['/api/system/support/summary', '/api/system/doctor'].map(async path => (await fetch(path)).json())));
  summary.findings = [{ id: 'domain-backups', area: 'Backups', severity: 'warning', title: 'Backups need attention', message: 'The backup destination cannot be written.', actionLabel: 'Open Backups', route: '/backups' }];
  doctor.status = 'needs_attention';
  doctor.checks = [{ id: 'tailscale', label: 'Tailscale', status: 'warning', message: 'Tailscale is not connected.' }];
  await page.route('**/api/system/support/summary', route => route.fulfill({ json: summary }));
  await page.route('**/api/system/doctor', route => route.fulfill({ json: doctor }));
  await page.reload();
  const health = page.getByRole('tabpanel', { name: 'Health checks' });
  await expect(page.getByRole('region', { name: 'System summary', exact: true })).toHaveCount(0);
  await expect(health.getByText('Needs review', { exact: true })).toHaveClass(/text-amber/);
  await expect(health.getByText('Tailscale is not connected.', { exact: true })).toBeVisible();
  await expect(health.getByText('Backups need attention', { exact: false })).toBeVisible();
  await expect(health.getByText('warning:', { exact: true })).toBeVisible();
  await expect(health.getByText('No restore point yet', { exact: true })).toHaveCount(0);
  await health.getByRole('link', { name: 'Open Backups', exact: true }).click();
  await expect(page).toHaveURL(/\/backups$/);
  await expect(page.getByText('Vaultwarden with a deliberately long self-hosted service name', { exact: true }).first()).toBeVisible();
  summary.findings = [];
  doctor.checks = [{ id: 'tailscale', label: 'Tailscale', status: 'neutral', message: 'Tailscale status unavailable.' }];
  await page.goto('/diagnostics');
  await expect(health.getByText('Unknown', { exact: true })).not.toHaveClass(/emerald/);
  await expect(health.getByText('No support findings reported.', { exact: true })).toBeVisible();
  await expect(health).not.toContainText('No restore point yet');
  await expect(health).not.toContainText('Protected');

  // The three task tabs use the framework's horizontal keyboard navigation.
  const healthTab = page.getByRole('tab', { name: 'Health checks', exact: true });
  const reportTab = page.getByRole('tab', { name: 'Support report', exact: true });
  await expect(page.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
  await healthTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(reportTab).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Support report', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(healthTab).toBeFocused();
  await expect(health).toBeVisible();
});

test('Diagnostics keeps generated reports as snapshots with independent copy and download', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  let finishReport!: () => void;
  const pending = new Promise<void>(resolve => { finishReport = resolve; });
  let failing = false;
  let requests = 0;
  const text = 'Support snapshot\nRuntime: [home-path-redacted]/runtime';
  await page.route('**/api/system/support/bundle', async route => {
    requests++;
    await pending;
    await route.fulfill(failing ? { status: 503, json: { message: 'Report temporarily unavailable. Try generating again.' } } : { json: { bundleText: text, generatedAt: '2026-09-20T12:00:00Z', redactionRules: [{ id: 'paths', label: 'Home paths', description: 'User identity is masked.' }], findings: [{ title: 'Report-only finding' }] } });
  });
  await page.goto('/diagnostics');
  await page.getByRole('tab', { name: 'Support report', exact: true }).click();
  await expect(page.getByText('No report generated yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download report', exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generating…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Generating…', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('tab', { name: 'Health checks', exact: true }).click();
  finishReport();
  await expect(page.getByText('Support report ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Health checks', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Report-only finding', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Support report', exact: true }).click();
  await expect(page.getByLabel('Report preview', { exact: true })).toHaveText(text);
  await expect(page.getByText(/^Snapshot · Generated/)).toContainText('2026');
  await page.getByRole('button', { name: 'Copy report', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('autark-os-support-report-2026-09-20T12-00-00Z.txt');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(text);
  await page.getByRole('button', { name: 'What gets redacted?', exact: true }).click();
  await expect(page.getByText('User identity is masked.', { exact: true })).toBeVisible();
  failing = true;
  await page.getByRole('button', { name: 'Regenerate report', exact: true }).click();
  await expect(page.getByText('Support report failed', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Report preview', { exact: true })).toHaveText(text);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Report preview', { exact: true })).toHaveText(text);
  expect(requests).toBe(2);
  failing = false;
  await page.getByRole('button', { name: 'Regenerate report', exact: true }).click();
  await expect.poll(() => requests).toBe(3);
  await expect(page.getByRole('button', { name: 'Regenerate report', exact: true })).toBeEnabled();
  // Clipboard failure keeps manual selection and download available.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = () => false;
  });
  await page.getByRole('button', { name: 'Copy report', exact: true }).click();
  await expect(page.getByText('Copy unavailable', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Report preview', { exact: true })).toHaveCSS('user-select', 'text');
  await expect(page.getByRole('button', { name: 'Download report', exact: true })).toBeEnabled();
});

test('Diagnostics refresh failures preserve checks and logs, and setup findings open Advanced settings', async ({ page }) => {
  await installMockApi(page, 'idle');
  let failing = true;
  let finishLoad!: () => void;
  const pending = new Promise<void>(resolve => { finishLoad = resolve; });
  await page.route('**/api/system/support/summary', async route => {
    await pending;
    if (failing) return route.fulfill({ status: 503, json: { message: 'Diagnostics offline' } });
    return route.fallback();
  });
  await page.goto('/diagnostics');
  await expect(page.getByText('Loading diagnostics', { exact: true })).toBeVisible();
  finishLoad();
  await expect(page.getByRole('alert')).toContainText('Diagnostics offline');
  await expect(page.getByRole('tablist', { name: 'Diagnostics sections' })).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  const health = page.getByRole('tabpanel', { name: 'Health checks', exact: true });
  await expect(health).toBeVisible();
  const oldChecks = await health.innerText();
  failing = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Checks stale', exact: true }).click();
  await expect(page.getByText('Previous checks remain visible.', { exact: false })).toBeVisible();
  await expect(health).toHaveText(oldChecks, { useInnerText: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Checks stale', exact: true })).toBeFocused();
  failing = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Checks stale', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Technical logs', exact: true }).click();
  const logs = page.getByRole('region', { name: 'Redacted logs' });
  await expect(logs).toContainText('Fixture log');
  await page.route('**/api/system/support/logs?*', route => route.fulfill({ status: 503, json: { message: 'Logs offline. Try Refresh logs again.' } }));
  await page.getByRole('button', { name: 'Refresh logs', exact: true }).click();
  await expect(page.getByText('Logs could not load', { exact: true }).first()).toBeVisible();
  await expect(logs).toContainText('Fixture log');
  await page.route('**/api/system/support/logs?*', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Refresh logs', exact: true }).click();
  await expect(logs).toContainText('No logs were available.');
  await expect(page.getByRole('button', { name: 'Refresh logs', exact: true })).toBeFocused();
  await page.route('**/api/system/support/logs?*', route => route.fulfill({ json: [{ line: 'Latest redacted event', level: 'info', redacted: true }] }));
  await page.getByRole('button', { name: 'Refresh logs', exact: true }).click();
  await expect(logs).toContainText('Latest redacted event');
  const summary = await page.evaluate(async () => (await fetch('/api/system/support/summary')).json());
  summary.findings = [{ id: 'docker', title: 'Docker unavailable', message: 'Review host setup.', severity: 'error', area: 'Setup', route: '/settings', actionLabel: 'Install Docker' }];
  await page.route('**/api/system/support/summary', route => route.fulfill({ json: summary }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('tab', { name: 'Health checks', exact: true }).click();
  await expect(health.getByText('error:', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open host settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await expect(settings.getByRole('heading', { name: 'Advanced', exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open host settings', exact: true })).toBeFocused();
});

for (const width of [1024, 1280, 1440]) {
  test(`Diagnostics task workspaces fit ${width}px without duplicate controls`, async ({ page }) => {
    await installMockApi(page, 'idle');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/diagnostics');
    await expect(page.getByRole('tablist', { name: 'Diagnostics sections' }).getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(1);
    await expect(page.getByText('Diagnostics tools', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'System details', exact: true }).click();
    for (const title of ['App ownership details', 'Docker resources', 'Tailscale details']) {
      await page.getByRole('button', { name: title, exact: true }).click();
    }
    await expectNoHorizontalOverflow(page);
    await page.getByRole('tab', { name: 'Support report', exact: true }).click();
    await page.getByRole('button', { name: 'Generate report', exact: true }).click();
    await expect(page.getByLabel('Report preview', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'What gets redacted?', exact: true }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('tab', { name: 'Technical logs', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Redacted logs' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('Tailscale pending checks are not presented as unavailable', async ({ page }) => {
  await installMockApi(page, 'idle');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/network/tailscale/status', async route => { await pending; await route.fallback(); });
  await page.route('**/api/network/private-access/reconciliation', async route => { await pending; await route.fallback(); });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Tailscale: Checking', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Checking Tailscale', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('unavailable');
  release();
  await expect(page.getByRole('dialog')).toContainText('Private links: 1 ready');
});

test('Tailscale header follows Access refresh and shares status requests', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  let connected = true;
  let statusRequests = 0;
  let reconciliationRequests = 0;
  await page.route('**/api/network/tailscale/status', route => {
    statusRequests++;
    return route.fulfill({ json: { installed: true, connected, state: connected ? 'Running' : 'NeedsLogin', deviceName: 'fixture-server', dnsName: connected ? 'fixture.ts.net' : '', tailnetIps: [], message: '' } });
  });
  await page.route('**/api/network/private-access/reconciliation', route => { reconciliationRequests++; return route.fallback(); });
  await page.goto('/access?tab=devices');
  await expect(page.getByRole('button', { name: 'Tailscale: Signed in', exact: true })).toBeVisible();
  await expect(page.getByText('Your devices', { exact: true })).toBeVisible();
  const initialRequests = [statusRequests, reconciliationRequests];
  connected = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Connect Tailscale, then add your phone or laptop', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tailscale: Not signed in', exact: true })).toBeVisible();
  expect(initialRequests).toEqual([1, 1]);
  await page.getByRole('button', { name: 'Tailscale: Not signed in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', 'https://login.tailscale.com/start');
  await page.getByRole('button', { name: 'sudo tailscale up', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('sudo tailscale up');
  connected = true;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tailscale: Signed in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy hostname', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('fixture.ts.net');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Connect Tailscale, then add your phone or laptop', { exact: true })).toHaveCount(0);
});

test('Tailscale reconciliation failure is not reported as zero ready links', async ({ page }) => {
  await installMockApi(page, 'idle');
  let failing = true;
  await page.route('**/api/network/private-access/reconciliation', route => failing ? route.fulfill({ status: 503, json: { message: 'Link checks unavailable' } }) : route.fallback());
  await page.goto('/access');
  await page.getByRole('button', { name: /^Tailscale:/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Private links: Unavailable');
  await expect(page.getByText('0 ready', { exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Private links: 1 ready');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Reachability matrix', exact: true })).toBeVisible();
  failing = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tailscale: Links stale', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tailscale: Links stale', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Private links: 1 ready (last confirmed)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Links stale', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Showing the last confirmed links.');
  await page.keyboard.press('Escape');
  failing = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tailscale: Signed in', exact: true })).toBeVisible();
});

test('Tailscale status failure stays unknown until a successful retry', async ({ page }) => {
  await installMockApi(page, 'idle');
  let failing = true;
  await page.route('**/api/network/tailscale/status', route => failing ? route.fulfill({ status: 503, json: { message: 'Status unavailable' } }) : route.fallback());
  await page.goto('/home');
  await page.getByRole('button', { name: 'Tailscale: Unavailable', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Tailscale status is unavailable.');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy hostname', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Access settings', exact: true }).click();
  await expect(page).toHaveURL(/\/access/);
});

test('Tailscale stale-link removal refreshes shared counts once after confirmation', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.goto('/access');
  const report = await page.evaluate(async () => (await fetch('/api/network/private-access/reconciliation')).json());
  report.staleMappings = [{ id: 'stale-12443', servePort: 12443, endpoint: 'https://fixture.ts.net:12443', target: 'http://127.0.0.1:8080' }];
  let reconciliationRequests = 0;
  let removed = false;
  await page.route('**/api/network/private-access/reconciliation', route => {
    reconciliationRequests++;
    return route.fulfill({ json: report });
  });
  await page.route('**/api/network/private-access/stale/12443', route => {
    expect(route.request().method()).toBe('DELETE');
    removed = true;
    report.staleMappings = [];
    // A concurrently reconciled app becomes ready in the same refreshed report.
    report.apps.push({ ...report.apps[0], appId: 'syncthing', appName: 'Syncthing' });
    return route.fulfill({ json: { configured: true, message: 'Link removed' } });
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: '1 unused link', exact: true }).click();
  await page.getByRole('button', { name: 'Remove stale link', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('No app data will be deleted.');
  expect(removed).toBe(false);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove stale link', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No unused private links were found.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Access / Unused private links' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Tailscale:/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Private links: 2 ready');
  expect(reconciliationRequests).toBe(2);
});

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

  await page.getByRole('button', { name: /^Open activity:/i }).click();
  await expect(page.getByRole('tab', { name: /^Now/i })).toBeVisible();
  await expect(page.getByLabel('Action needed')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Theme:/i }).click();
  await expect(page.getByRole('button', { name: /Forest/i })).toBeVisible();
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/apps', { width: 1280, height: 960 });
  await expect(page.getByText(/My Apps/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
  const dialog = page.getByRole('dialog', { name: /Vaultwarden/ });
  await expect(dialog).toBeVisible();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/apps$/);
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/discover', { width: 1280, height: 960 });
  await expect(page.getByRole('heading', { name: /^Discover$/i })).toBeVisible();
  await page.getByRole('button', { name: /How installs work/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/How Autark-OS installs apps/i);
  await expectNoHorizontalOverflow(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Open activity:/i }).click();
  await page.getByRole('tab', { name: /History/i }).click();
  await expect(page.getByText(/Vaultwarden backup verified/i)).toBeVisible();
  await page.keyboard.press('Escape');

  await openReadyRoute(page, '/storage', { width: 1280, height: 960 });
  await page.getByRole('button', { name: 'Open cleanup workspace', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Cleanup$/i })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /^Review$/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Clean up unused app data/i);
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/settings', { width: 1280, height: 960 });
  await page.getByRole('textbox', { name: /^Device name/ }).fill('Fixture Home Server updated');
  await page.getByRole('button', { name: /^Refresh settings$/i }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/Discard unsaved changes/i);
  await expectNoHorizontalOverflow(page);
});

test('narrow view keeps sheets and the backup dialog within the viewport', async ({ page }) => {
  await openReadyRoute(page, '/apps?review=immich', { width: 390, height: 844 });
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
  await page.getByRole('dialog').getByRole('link', { name: 'Recover app', exact: true }).first().click();
  await expect(page).toHaveURL(/\/apps\?review=immich/);
  await expect(page.getByRole('dialog')).toContainText(/Recover Immich/i);
  await expectNoHorizontalOverflow(page);

  await openReadyRoute(page, '/backups', { width: 390, height: 844 }, 'idle');
  await expect(page.getByText(/All backup files/i)).toBeVisible();
  await page.getByRole('button', { name: /^Details$/i }).click();
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

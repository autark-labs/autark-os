import { expect, test } from 'playwright/test';
import { installMockApi } from './support/mockApi';

const review = { planId: 'reviewed-access', appId: 'vaultwarden', appName: 'Vaultwarden', headline: 'Review reachability change', summary: 'Home network → Private only. The app will restart.', saveAllowed: true, restartRequired: true, redeployRequired: true, dataMigrationRequired: false, changes: ['Remove the LAN dashboard binding.'], warnings: ['Autark-OS verifies the private link before saving. If the change fails it restores the previous configuration where possible; unresolved recovery remains visible in My Apps.'], blockedReasons: [] };

async function openNetworkApp(page: import('playwright/test').Page) {
  const service = page.getByRole('button', { name: /^Review Vaultwarden/ });
  await service.click();
  await service.locator('xpath=ancestor::*[@id][1]').getByRole('button', { name: 'Details and actions', exact: true }).click();
  return page.getByRole('group', { name: /^Security posture for Vaultwarden/ });
}

async function networkApp(page: import('playwright/test').Page) {
  await installMockApi(page, 'ready');
  await page.route('**/api/jobs', route => route.fulfill({ json: [] }));
  await page.goto('/access');
  const state = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const application = state.applications.find((entry: { id: string }) => entry.id === 'vaultwarden');
  const app = application.runtime;
  app.settings.desiredAccessMode = 'network'; app.settings.tailscaleEnabled = false;
  app.desiredAccess.mode = 'network';
  app.accessRoute.privateLinkStatus = 'not_configured'; app.accessRoute.privateUrl = '';
  app.observedAccess.privateLinkStatus = 'not_configured'; app.observedAccess.privateUrl = '';
  await page.route('**/api/application-state*', route => route.fulfill({ json: state }));
  await page.route('**/api/apps/vaultwarden/settings-plan', route => route.fulfill({ json: review }));
  await page.reload();
  return { state, application, app };
}

test('Access reviews exact private-only consequences before applying and follows a durable job beyond twenty seconds and reload', async ({ page }) => {
  const { application } = await networkApp(page);
  let mutations = 0;
  const job = { jobId: 'access-job', subjectId: 'vaultwarden', type: 'save_app_settings', status: 'running', currentStep: 'Changing binding', steps: [], createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' };
  await page.route('**/api/jobs', route => route.fulfill({ json: mutations ? [job] : [] }));
  await page.route('**/api/apps/vaultwarden/settings', route => {
    mutations++;
    expect(route.request().headers()['x-autark-plan-id']).toBe(review.planId);
    expect(route.request().postDataJSON()).toMatchObject({ desiredAccessMode: 'private', tailscaleEnabled: true });
    application.operation = { kind: 'saving_settings', jobId: job.jobId, label: 'Updating settings' };
    return route.fulfill({ json: job });
  });
  const choices = await openNetworkApp(page);
  await choices.getByRole('radio', { name: 'Private', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Home network → Private only');
  await expect(page.getByRole('alertdialog')).toContainText('restores the previous configuration where possible');
  expect(mutations).toBe(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations).toBe(0);
  await choices.getByRole('radio', { name: 'Private', exact: true }).click();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect.poll(() => mutations).toBe(1);
  await expect(choices.getByRole('radio', { name: 'Home', exact: true })).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(25_000);
  await expect(choices.getByRole('radio', { name: 'Home', exact: true })).toBeDisabled();
  await page.reload();
  await expect((await openNetworkApp(page)).getByRole('radio', { name: 'Private', exact: true })).toBeDisabled();
});

test('Access partial diagnostics and device failures are unavailable, never healthy empty content', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.route('**/api/network/diagnostics', route => route.fulfill({ status: 503, json: { message: 'Diagnostics unavailable' } }));
  await page.route('**/api/network/tailscale/devices', route => route.fulfill({ status: 503, json: { message: 'Devices unavailable' } }));
  await page.goto('/access?tab=issues');
  await expect(page.getByText('Issue checks unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No network issues found', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Devices', exact: true }).click();
  await expect(page.getByText('Device list unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Connected, waiting for peer details', { exact: true })).toHaveCount(0);
});

test('One app issue opens that app and signed-out header reaches host-specific guide', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.route('**/api/network/tailscale/status', route => route.fulfill({ json: { installed: true, connected: false, state: 'NeedsLogin', deviceName: 'fixture-server', dnsName: '', tailnetIps: [] } }));
  await page.route('**/api/network/diagnostics', route => route.fulfill({ json: { status: 'warning', headline: 'Check links', checks: [], appChecks: [{ id: 'serve-vaultwarden', label: 'Vaultwarden private link', status: 'warning', message: 'Mapping missing' }] } }));
  await page.route('**/api/network/private-access/reconciliation', route => route.fulfill({ json: { apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', status: 'missing', message: 'Mapping missing' }], staleMappings: [] } }));
  await page.route('**/api/network/tailscale/connect-guide', route => route.fulfill({ json: { headline: 'Connect fixture-server', summary: 'Enroll this server', steps: ['Authenticate this host.'], enrollmentUrl: 'https://login.tailscale.com/a/fixture-host', installUrl: 'https://tailscale.com/download', connectCommand: 'sudo tailscale up' } }));
  await page.goto('/access?tab=issues');
  await expect(page.getByText('Mapping missing', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Review app', exact: true }).click();
  await expect(page).toHaveURL(/focus=managed%3Avaultwarden.*panel=manage/);
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tailscale: Not signed in', exact: true }).click();
  await page.getByRole('link', { name: 'Connect this host', exact: true }).click();
  await expect(page).toHaveURL(/tab=advanced/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Sign in this host', exact: true })).toHaveAttribute('href', 'https://login.tailscale.com/a/fixture-host');
});

test('LAN plus private is an explicit reviewed choice and app settings share the same review', async ({ page }) => {
  await networkApp(page);
  let proposedMode = '';
  await page.route('**/api/apps/vaultwarden/settings-plan', route => {
    proposedMode = route.request().postDataJSON().desiredAccessMode;
    return route.fulfill({ json: { ...review, summary: 'LAN + private preserves both access paths.' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await (await openNetworkApp(page)).getByRole('radio', { name: 'LAN + private', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('preserves both');
  expect(proposedMode).toBe('local-and-private');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/apps?focus=managed%3Avaultwarden&panel=manage&tab=settings');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'App reachability', exact: true }).click();
  await page.getByRole('option', { name: 'Private only / Tailscale', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(proposedMode).toBe('private');
});

test('Missing readiness evidence never claims DNS, certificate, or Serve readiness', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.route('**/api/network/tailscale/status', route => route.fulfill({ json: { installed: true, connected: true, state: 'Running', deviceName: 'fixture-server', dnsName: 'fixture.ts.net', tailnetIps: [] } }));
  await page.goto('/access');
  await page.getByRole('button', { name: 'Tailscale: Signed in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('MagicDNS unavailable');
  await expect(dialog).toContainText('HTTPS certificate support unavailable');
  await expect(dialog).toContainText('Serve readiness unavailable');
});

test('Setup-now finishes at this host connection guide', async ({ page }) => {
  await installMockApi(page, 'onboarding');
  await page.goto('/setup');
  const state = await page.evaluate(async () => (await fetch('/api/system/onboarding')).json());
  state.currentStep = 5;
  state.privateAccessChoice = 'setup-now';
  state.tailscaleConnected = false;
  state.doctor.readiness.canCompleteOnboarding = true;
  state.doctor.readiness.finishAnywayRequiresAdvanced = false;
  await page.route('**/api/system/onboarding', route => route.fulfill({ json: state }));
  await page.route('**/api/system/onboarding/complete', route => {
    state.status = 'complete';
    return route.fulfill({ json: state });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page).toHaveURL(/\/access\?tab=advanced$/);
  await expect(page.getByRole('tab', { name: 'Diagnostics', exact: true })).toHaveAttribute('data-state', 'active');
});

test('Access blocked review never submits and a lost response reuses the same reviewed token', async ({ page }) => {
  await networkApp(page);
  let blocked = true;
  let requests = 0;
  const tokens: string[] = [];
  await page.route('**/api/apps/vaultwarden/settings-plan', route => route.fulfill({ json: { ...review, saveAllowed: !blocked, blockedReasons: blocked ? ['This app requires private HTTPS.'] : [] } }));
  await page.route('**/api/apps/vaultwarden/settings', route => {
    requests++;
    tokens.push(route.request().headers()['x-autark-plan-id']);
    return requests === 1 ? route.abort('connectionreset') : route.fulfill({ json: { jobId: 'accepted-once', type: 'save_app_settings', subjectId: 'vaultwarden', status: 'running', steps: [], createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' } });
  });
  const choices = await openNetworkApp(page);
  await choices.getByRole('radio', { name: 'Private', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('requires private HTTPS');
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  blocked = false;
  await choices.getByRole('radio', { name: 'Private', exact: true }).click();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Check Activity');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(tokens).toEqual([review.planId, review.planId]);
});


test('Connected Tailscale with unsupported HTTPS keeps one waiting app issue and its host-guide remedy', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.goto('/access');
  const state = await page.evaluate(async () => (await fetch('/api/application-state')).json());
  const application = state.applications.find((entry: { id: string }) => entry.id === 'vaultwarden');
  application.issues = [{ id: 'private-access-vaultwarden', scope: 'access', subjectId: 'vaultwarden', reasonCode: 'private_access_waiting', severity: 'info', title: 'Private link needs setup', summary: 'HTTPS certificates are not supported for this host.', primaryAction: { id: 'connect-private-vaultwarden', label: 'Connect this server', route: '/access?tab=advanced' }, secondaryActions: [], advancedDetails: {} }];
  await page.route('**/api/application-state*', route => route.fulfill({ json: state }));
  await page.route('**/api/network/tailscale/status', route => route.fulfill({ json: { installed: true, connected: true, state: 'Running', magicDnsReady: true, httpsReady: false, serveReady: true, deviceName: 'fixture-server', dnsName: 'fixture.ts.net', tailnetIps: [] } }));
  const message = 'HTTPS certificates are not supported for this host.';
  await page.route('**/api/network/diagnostics', route => route.fulfill({ json: { status: 'warning', checks: [{ id: 'dns', label: 'MagicDNS', status: 'healthy' }, { id: 'private-apps', label: 'Private apps waiting', status: 'warning', message }], appChecks: [{ id: 'serve-vaultwarden', label: 'Vaultwarden', status: 'neutral', message }] } }));
  await page.route('**/api/network/private-access/reconciliation', route => route.fulfill({ json: { apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', status: 'waiting', message, actionLabel: 'Connect this server' }], staleMappings: [] } }));
  await page.goto('/access?tab=issues');
  await expect(page.getByText(message, { exact: true })).toHaveCount(1);
  await expect(page.getByText('No network issues found', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review app', exact: true }).click();
  await expect(page).toHaveURL(/\/access\?tab=advanced$/);
  await expect(page.getByRole('heading', { name: 'Finish private-link setup', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'DNS and HTTPS settings', exact: true })).toHaveAttribute('href', 'https://login.tailscale.com/admin/dns');
});

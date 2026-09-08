import { expect, test } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

for (const width of [1280, 390]) {
test(`app settings preserve edits and show job recovery at ${width}px`, async ({ page }) => {
  test.fixme(width === 390, 'Known beta blocker: desktop-positioned management drawer is behind the summary card on mobile. See VAL-04 in beta-readiness-remediation-plan.md; requires the wireframe workflow before a layout change.');
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
  await page.getByRole('button', { name: /^Manage app$/i }).click();
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

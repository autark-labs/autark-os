import { expect, test, type Page } from 'playwright/test';
import { installMockApi } from './support/mockApi';

async function setupState(page: Page, step = 3) {
  await installMockApi(page, 'onboarding');
  await page.goto('/setup');
  const state = await page.evaluate(async () => (await fetch('/api/system/onboarding')).json());
  Object.assign(state, { currentStep: step, backupPosture: 'routine', recommendedApps: [], privateAccessChoice: 'local-only' });
  state.doctor.readiness.canCompleteOnboarding = true;
  state.doctor.readiness.finishAnywayRequiresAdvanced = false;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/system/onboarding', async route => {
    if (route.request().method() === 'PUT') {
      const update = route.request().postDataJSON(); writes.push(update); Object.assign(state, update);
    }
    return route.fulfill({ json: state });
  });
  await page.route('**/api/setup/progress', route => route.fulfill({ json: { setupComplete: state.status === 'complete', completedSteps: [], skippedSteps: [] } }));
  await page.reload();
  return { state, writes };
}

test('external manual backups retain destination and posture through back, reload and finish', async ({ page }) => {
  const { state, writes } = await setupState(page);
  await page.getByRole('button', { name: 'External backup location', exact: false }).click();
  await page.getByRole('textbox', { name: 'Backup destination', exact: true }).fill('/mnt/test-drive/autark-backups');
  await page.getByRole('checkbox', { name: /Run routine backups/ }).uncheck();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Backup destination', exact: true })).toHaveValue('/mnt/test-drive/autark-backups');
  await expect(page.getByRole('checkbox', { name: /Run routine backups/ })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Backup destination', exact: true })).toHaveValue('/mnt/test-drive/autark-backups');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.route('**/api/system/onboarding/complete', route => { state.status = 'complete'; return route.fulfill({ json: state }); });
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(state.backupDestination).toBe('/mnt/test-drive/autark-backups');
  expect(state.automaticBackupsEnabled).toBe(false);
  expect(state.backupPosture).toBe('external');
  expect(state.recommendedApps).toEqual([]);
  expect(writes.some(write => write.backupDestination === '/mnt/test-drive/autark-backups')).toBe(true);
});

for (const posture of ['routine', 'later'] as const) {
  test(`${posture} with routines off stays distinct after back and reload`, async ({ page }) => {
    const { state } = await setupState(page);
    if (posture === 'later') await page.getByRole('button', { name: /^Configure backups later/ }).click();
    else await page.getByRole('checkbox', { name: /Run routine backups/ }).uncheck();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: posture === 'later' ? /^Configure backups later/ : /^Same-device backups/ })).toHaveAttribute('aria-pressed', 'true');
    expect(state.backupPosture).toBe(posture);
    expect(state.automaticBackupsEnabled).toBe(false);
  });
}

test('pending save freezes choices and failed save retains edits for retry', async ({ page }) => {
  await setupState(page);
  await page.getByRole('button', { name: /^External backup location/ }).click();
  const destination = page.getByRole('textbox', { name: 'Backup destination', exact: true });
  await destination.fill('/mnt/disconnected/backups');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/system/onboarding', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await pending;
    return route.fulfill({ status: 409, json: { message: 'The backup drive is disconnected. Reconnect it and try again.' } });
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(destination).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Same-device backups/ })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText('disconnected');
  await expect(destination).toBeEnabled();
  await expect(destination).toHaveValue('/mnt/disconnected/backups');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
});

for (const committed of [true, false]) {
  test(`lost finish response ${committed ? 'reconciles committed completion' : 'keeps uncommitted setup retryable'}`, async ({ page }) => {
    const { state } = await setupState(page, 5);
    await page.route('**/api/system/onboarding/complete', route => {
      if (committed) state.status = 'complete';
      return route.fulfill({ status: 503, json: { message: 'Response lost; try again.' } });
    });
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
    if (committed) await expect(page).toHaveURL(/\/home$/);
    else {
      await expect(page.getByRole('alert')).toContainText('Response lost');
      await expect(page.getByRole('button', { name: 'Finish setup', exact: true })).toBeEnabled();
      await page.route('**/api/system/onboarding/complete', route => { state.status = 'complete'; return route.fulfill({ json: state }); });
      await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
      await expect(page).toHaveURL(/\/home$/);
    }
  });
}

test('fresh server blocker replaces stale ready state after Finish', async ({ page }) => {
  const { state } = await setupState(page, 5);
  await page.route('**/api/system/onboarding/complete', route => {
    state.doctor.readiness.canCompleteOnboarding = false;
    state.doctor.readiness.summary = 'Runtime storage is not writable.';
    return route.fulfill({ status: 409, json: { message: state.doctor.readiness.summary } });
  });
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Runtime storage is not writable');
  await expect(page.getByRole('button', { name: 'Finish setup', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  for (const app of ['FreshRSS', 'Homepage', 'Syncthing']) await expect(page.getByRole('button', { name: new RegExp(`^${app}`) })).toHaveAttribute('aria-pressed', 'false');
});

test('mobile keyboard finish acknowledges optional work and opens actual private-access guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await setupState(page, 5);
  state.privateAccessChoice = 'setup-now';
  state.tailscaleConnected = false;
  state.doctor.readiness.finishAnywayRequiresAdvanced = true;
  const tailscale = await page.evaluate(async () => (await fetch('/api/network/tailscale/status')).json());
  await page.route('**/api/network/tailscale/status', route => route.fulfill({ json: { ...tailscale, connected: false } }));
  await page.route('**/api/network/tailscale/connect-guide', route => route.fulfill({ json: { headline: 'Connect Autark-OS to Tailscale', summary: 'Connect this server.', steps: ['Authenticate this host.'], installUrl: 'https://tailscale.com/download', connectCommand: 'sudo tailscale up' } }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finish setup', exact: true })).toBeDisabled();
  const acknowledgement = page.getByRole('checkbox', { name: /Finish with optional work remaining/ });
  await acknowledgement.focus();
  await page.keyboard.press('Space');
  await page.route('**/api/system/onboarding/complete', route => {
    expect(route.request().postDataJSON()).toEqual({ acknowledgeOptionalWork: true });
    state.status = 'complete'; return route.fulfill({ json: state });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Finish anyway', exact: true }).click();
  await expect(page).toHaveURL(/\/access\?tab=advanced$/);
  await expect(page.getByText('Connect Autark-OS to Tailscale', { exact: true })).toBeVisible();
});

test('first-load failure is unavailable and retry restores saved choices', async ({ page }) => {
  await setupState(page);
  let unavailable = true;
  await page.route('**/api/system/onboarding', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'Setup storage is temporarily unavailable.' } })
    : route.fallback());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Autark-OS is unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Same-device backups/ })).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Same-device backups/ })).toHaveAttribute('aria-pressed', 'true');
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from 'playwright/test';
import type { AutarkOsJob } from '../src/types/jobs';
import { installMockApi, stabilizePage } from './support/mockApi';

const fixedAt = '2026-07-19T17:00:00Z';
const activeDigest = `sha256:${'c'.repeat(64)}`;

type ProAction = {
  body: unknown;
  path: string;
};

type OpenProOptions = {
  activationCompletionStatus?: ReturnType<typeof proStatus>;
  servicesThrough?: string;
  recommendedAction?: string;
  moduleJob?: AutarkOsJob;
  extensionAvailable?: () => boolean;
  onAction?: (action: ProAction) => void;
  status?: ReturnType<typeof proStatus>;
};

function proStatus(installed = true) {
  return {
    schemaVersion: '1',
    entitlement: {
      schemaVersion: '1',
      state: 'ACTIVE',
      plan: 'pro_home',
      features: ['autark-pro.extension'],
      updatesThrough: '2029-07-19T17:00:00Z',
      serviceLeaseExpiresAt: '2026-07-20T17:00:00Z',
      lastVerifiedServerTime: fixedAt,
      localUseAllowed: true,
      updatesAllowed: true,
      hostedServicesAllowed: true,
      grantFingerprint: `sha256:${'b'.repeat(64)}`,
      reasonCode: 'none',
    },
    device: {
      deviceId: '11111111-1111-4111-8111-111111111111',
      installationId: '22222222-2222-4222-8222-222222222222',
      publicKeyFingerprint: `sha256:${'a'.repeat(64)}`,
      registered: true,
    },
    activation: { state: 'idle', activationId: null, expiresAt: null },
    module: {
      state: installed ? 'ACTIVE' : 'NOT_INSTALLED',
      componentVersion: installed ? '0.2.0' : null,
      activeDigest: installed ? activeDigest : null,
      previousDigest: null,
      previousComponentVersion: null,
      candidateVersion: null,
      health: installed ? 'healthy' : 'not-checked',
      jobId: null as string | null,
      errorCode: null,
      lastSuccessfulTransitionAt: installed ? fixedAt : null,
      lastTransitionAt: fixedAt,
    },
    refresh: {
      inProgress: false,
      lastAttemptAt: fixedAt,
      lastSuccessAt: fixedAt,
      nextAttemptAt: '2026-07-20T05:00:00Z',
      lastFailureCategory: null,
      consecutiveFailures: 0,
    },
  };
}

function productState(status: ReturnType<typeof proStatus>) {
  const softwareState = {
    NOT_ACTIVATED: 'absent', ACTIVATING: 'activating', ACTIVE: 'active', ONLINE_GRACE: 'grace',
    RETAINED_USE: 'retained_use', SUSPENDED_ONLINE: 'suspended', REVOKED: 'revoked', INVALID: 'invalid', ERROR: 'error',
  }[status.entitlement.state] ?? 'error';
  const agentState = {
    NOT_INSTALLED: 'not_installed', RELEASE_AVAILABLE: 'release_available', DOWNLOADING: 'installing',
    VERIFYING: 'installing', STARTING_CANDIDATE: 'installing', HEALTH_CHECKING: 'installing',
    ACTIVE: 'active', DEGRADED: 'degraded', ROLLING_BACK: 'installing', RETAINED_USE: 'retained_use',
    UPDATE_INELIGIBLE: 'update_ineligible', REMOVING: 'removing', ERROR: 'error',
  }[status.module.state] ?? 'error';
  let action = 'none';
  if (softwareState === 'absent') action = 'activate';
  else if (!status.entitlement.localUseAllowed) action = 'review_entitlement';
  else if (agentState === 'release_available') action = 'install_release';
  else if (['not_installed', 'degraded', 'error'].includes(agentState)
    || (agentState === 'active' && status.entitlement.updatesAllowed)) action = 'check_release';
  return {
    schemaVersion: '1',
    overallStatus: softwareState === 'retained_use' ? 'retained_use' : status.entitlement.localUseAllowed ? 'partial' : 'unavailable',
    softwareEntitlement: {
      state: softwareState, localUseAllowed: status.entitlement.localUseAllowed,
      updatesAllowed: status.entitlement.updatesAllowed, updatesThrough: status.entitlement.updatesThrough,
      reasonCode: status.entitlement.reasonCode,
    },
    hostedServices: {
      state: status.entitlement.hostedServicesAllowed ? 'active' : softwareState === 'retained_use' ? 'expired' : 'unavailable',
      allowed: status.entitlement.hostedServicesAllowed, servicesThrough: null,
      lastVerifiedAt: status.entitlement.lastVerifiedServerTime, reasonCode: status.entitlement.reasonCode,
    },
    agent: {
      state: agentState, health: status.module.health === 'not-checked' ? 'not_checked' : status.module.health,
      compatibility: status.module.state === 'UPDATE_INELIGIBLE' ? 'incompatible' : status.module.activeDigest ? 'compatible' : 'unknown',
      componentVersion: status.module.componentVersion,
      digestPrefix: status.module.activeDigest ? status.module.activeDigest.slice(0, 19) : null,
      lastTransitionAt: status.module.lastTransitionAt, reasonCode: status.module.state.toLowerCase(),
    },
    guardian: { state: 'unavailable', schedulerState: 'unavailable', latestAnalysisHealth: 'unavailable', latestAnalysisAt: null, nextAnalysisAt: null, reasonCode: 'not_implemented' },
    localMobile: { state: 'unavailable', pairedDeviceCount: 0, reasonCode: 'not_implemented' },
    hostedMobile: { state: 'unavailable', linkedDeviceCount: 0, relayState: 'unavailable', lastRelayAt: null, reasonCode: 'not_implemented' },
    localCapabilities: status.entitlement.localUseAllowed ? status.entitlement.features : [],
    hostedCapabilities: status.entitlement.hostedServicesAllowed ? status.entitlement.features : [],
    recommendedAction: { id: action, reasonCode: action === 'none' ? 'no_action_required' : 'fixture_action' },
    checkedAt: fixedAt,
  };
}

test('installed Pro loads its browser module from the generic host', async ({ page }) => {
  const requests = await openPro(page, true);

  await expect(page.getByRole('heading', { name: 'Autark Pro is available' })).toBeVisible();
  await expect(page.getByText('Online access check', { exact: true })).toBeVisible();
  await expect(page.getByText('Last verified Jul 19, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Verified until /)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Private extension surface' }))
    .toBeVisible();
  await expect(page.getByText('pro.dashboard')).toBeVisible();
  expect(requests).toContain('/api/v1/extensions/autark-pro/ui-manifest');
  expect(requests.some((path) => path.startsWith('/api/v1/extensions/autark-pro/assets/entry.js')))
    .toBe(true);
  expect(requests).toContain('/api/v1/extensions/autark-pro/surfaces/pro.dashboard');
});

test('Online access check never uses the purchased term as its verification date', async ({ page }) => {
  await openPro(page, true, { servicesThrough: '2027-08-10T17:00:00Z' });

  await expect(page.getByText('Last verified Jul 19, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText(/Last verified.*2027/)).toHaveCount(0);
  await expect(page.getByText(/^Verified until /)).toHaveCount(0);
});

test('absent extension does not download browser code', async ({ page }) => {
  const requests = await openPro(page, false);

  await expect(page.getByRole('button', { name: 'Check for update' }))
    .toHaveCount(0);
  await expect(page.getByText(/New Pro activation and extension installation are deferred/)).toBeVisible();
  await expect(page.getByText(/Phone pairing, hosted monitoring and push alerts are not available in this beta/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'licensing@autarklabs.com' }))
    .toHaveAttribute('href', 'mailto:licensing@autarklabs.com');
  expect(requests.some((path) => path.includes('/assets/'))).toBe(false);
});

test('Guardian recommendation opens the installed guidance while new activation is deferred', async ({ page }) => {
  await openPro(page, true, { recommendedAction: 'review_guardian' });

  const review = page.getByRole('button', { name: 'Review guidance', exact: true });
  await expect(review).toBeVisible();
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Autark Pro guidance', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Private extension surface' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for update', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Device activation code')).toHaveCount(0);
});

test('missing installed guidance offers an in-page retry and preserves the CE shell', async ({ page }) => {
  let available = false;
  await openPro(page, true, {
    recommendedAction: 'review_guardian',
    extensionAvailable: () => available,
  });
  await page.getByRole('button', { name: 'Review guidance', exact: true }).click();
  const guidance = page.getByRole('region', { name: 'Autark Pro guidance', exact: true });
  await expect(guidance).toContainText('Private guidance is unavailable. Check your license and try again.');
  await expect(page.getByRole('link', { name: /Home/i }).first()).toBeVisible();
  available = true;
  await guidance.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(guidance.getByRole('heading', { name: 'Private extension surface' })).toBeVisible();
  await expect(guidance.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('a completed module job refreshes lifecycle state without a request loop', async ({ page }) => {
  const status = proStatus(true);
  status.module.jobId = 'pro-lifecycle-job';
  const requests = await openPro(page, true, {
    moduleJob: { ...jobFixture(), status: 'succeeded' },
    status,
  });
  const statusRequests = () => requests.filter((path) => path === '/api/v1/pro/status').length;
  await expect.poll(statusRequests).toBeGreaterThanOrEqual(2);
  // Observe a quiet interval shorter than either normal lifecycle polling period.
  await page.waitForTimeout(1_000);
  expect(statusRequests()).toBeLessThanOrEqual(3);
  expect(requests.filter((path) => path === '/api/v1/pro/product-state').length).toBeLessThanOrEqual(3);
});

test('reload resumes job observation and a failed candidate leaves existing guidance available', async ({ page }) => {
  const status = proStatus(true);
  status.module.state = 'VERIFYING';
  status.module.jobId = 'pro-lifecycle-job';
  const job: AutarkOsJob = { ...jobFixture(), status: 'running' };
  await openPro(page, true, { moduleJob: job, status, recommendedAction: 'review_guardian' });
  await expect(page.getByRole('region', { name: /for Private extension: running/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: /for Private extension: running/ })).toBeVisible();

  status.module.state = 'ACTIVE';
  job.status = 'failed';
  job.error = { code: 'candidate_unhealthy', message: 'The candidate failed its health check. Your previous extension is still running.', advancedDetails: {} };
  await expect(page.getByRole('region', { name: /for Private extension: failed/ })).toContainText('Your previous extension is still running.');
  await page.getByRole('button', { name: 'Review guidance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private extension surface' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Home/i }).first()).toBeVisible();
});

test('extension host shell is responsive and accessible', async ({ page }) => {
  await openPro(page, true, { recommendedAction: 'review_guardian' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Review guidance', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter((violation) =>
    violation.impact === 'serious' || violation.impact === 'critical'))
    .toEqual([]);
  await page.screenshot({ path: test.info().outputPath('pro-guidance-mobile.png'), fullPage: true });
});

test('Core beta offers no new activation and sends no activation requests', async ({ page }) => {
  const actions: ProAction[] = [];
  const initial = proStatus(false);
  initial.entitlement.state = 'NOT_ACTIVATED';
  initial.entitlement.localUseAllowed = false;
  initial.entitlement.updatesAllowed = false;
  initial.entitlement.hostedServicesAllowed = false;
  initial.entitlement.reasonCode = 'not_activated';
  initial.device.registered = false;
  const completed = proStatus(false);
  completed.entitlement.state = 'ACTIVE';
  completed.entitlement.localUseAllowed = true;
  completed.entitlement.updatesAllowed = true;
  completed.entitlement.hostedServicesAllowed = true;
  completed.entitlement.reasonCode = 'active';
  completed.device.registered = true;

  await openPro(page, false, {
    activationCompletionStatus: completed,
    onAction: (action) => actions.push(action),
    status: initial,
  });

  await expect(page.getByLabel('Device activation code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify this server' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Autark Pro', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'Autark Pro', exact: true })).toHaveCount(0);
  expect(actions).toEqual([]);
});

test('release, rollback, retained-use, offline, and revoked lifecycle states give honest actions', async ({ page }) => {
  const release = proStatus(true);
  release.module.state = 'RELEASE_AVAILABLE';
  release.module.candidateVersion = '0.2.1';
  const releaseActions: ProAction[] = [];
  await openPro(page, true, { onAction: (action) => releaseActions.push(action), status: release });
  await expect(page.getByRole('button', { name: 'Update private extension' })).toHaveCount(0);
  expect(releaseActions).toEqual([]);

  const rollback = proStatus(true);
  rollback.module.state = 'ROLLING_BACK';
  rollback.module.health = 'degraded';
  await openPro(page, true, { status: rollback });
  await expect(page.getByText('Autark-OS is restoring the last known-good private extension.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Check for update/i })).toHaveCount(0);

  const retained = proStatus(true);
  retained.entitlement.state = 'RETAINED_USE';
  retained.entitlement.updatesAllowed = false;
  retained.entitlement.hostedServicesAllowed = false;
  retained.entitlement.reasonCode = 'retained_use';
  retained.module.state = 'RETAINED_USE';
  await openPro(page, true, { status: retained });
  await expect(page.getByRole('heading', { name: 'Autark Pro remains available locally' })).toBeVisible();
  await expect(page.getByText('No new private-extension releases').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Check for update/i })).toHaveCount(0);

  const offline = proStatus(true);
  offline.entitlement.state = 'ONLINE_GRACE';
  offline.entitlement.hostedServicesAllowed = false;
  offline.entitlement.reasonCode = 'offline_grace';
  await openPro(page, true, { status: offline });
  await expect(page.getByRole('heading', { name: 'Autark Pro is available locally' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Check for update/i })).toHaveCount(0);

  const revoked = proStatus(true);
  revoked.entitlement.state = 'REVOKED';
  revoked.entitlement.localUseAllowed = false;
  revoked.entitlement.updatesAllowed = false;
  revoked.entitlement.hostedServicesAllowed = false;
  revoked.entitlement.reasonCode = 'revoked';
  await openPro(page, true, { status: revoked });
  await expect(page.getByRole('heading', { name: 'Autark Pro is inactive' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Check for update/i })).toHaveCount(0);
});

test('removal and deactivation require their explicit browser confirmations', async ({ page }) => {
  const actions: ProAction[] = [];
  await openPro(page, true, { onAction: (action) => actions.push(action) });

  await page.getByRole('button', { name: 'Deactivate Pro' }).click();
  await expect(page.getByRole('heading', { name: 'Deactivate Autark Pro on this appliance?' })).toBeVisible();
  await page.getByText('I understand that local private-extension data is retained, not deleted.').click();
  await page.getByText('I understand that the device identity and account association are retained for recovery and audit.').click();
  await page.getByLabel(/Type DEACTIVATE-AUTARK-PRO to confirm/).fill('DEACTIVATE-AUTARK-PRO');
  await page.getByRole('button', { name: 'Deactivate Pro', exact: true }).last().click();
  await expect.poll(() => actions).toContainEqual({
    body: {
      acknowledgeAccountAssociationRetained: true,
      acknowledgeModuleDataRetained: true,
      confirmation: 'DEACTIVATE-AUTARK-PRO',
    },
    path: '/api/v1/pro/deactivate',
  });

  await page.getByRole('button', { name: 'Remove private extension' }).click();
  await expect(page.getByRole('heading', { name: 'Remove the private extension?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove extension' })).toBeDisabled();
  await page.getByLabel(/Type REMOVE-AUTARK-PRO to confirm/).fill('REMOVE-AUTARK-PRO');
  await page.getByRole('button', { name: 'Remove extension' }).click();
  await expect.poll(() => actions).toContainEqual({
    body: { confirmation: 'REMOVE-AUTARK-PRO' },
    path: '/api/v1/pro/module/remove',
  });
});

async function openPro(page: Page, installed: boolean, options: OpenProOptions = {}) {
  const requests: string[] = [];
  let status = options.status ?? proStatus(installed);
  await installMockApi(page, 'ready');
  if (options.moduleJob) {
    await page.route(`**/api/jobs/${options.moduleJob.jobId}`, (route) => fulfillJson(route, options.moduleJob));
  }
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/v1/pro'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      const body = route.request().postDataJSON() ?? null;
      if (path === '/api/v1/pro/status') {
        await fulfillJson(route, status);
        return;
      }
      if (path === '/api/v1/pro/product-state') {
        const product = productState(status);
        await fulfillJson(route, {
          ...product,
          // The real projection stamps each read with the current server time.
          checkedAt: options.moduleJob ? new Date().toISOString() : product.checkedAt,
          recommendedAction: options.recommendedAction
            ? { id: options.recommendedAction, reasonCode: 'findings_available' }
            : product.recommendedAction,
          hostedServices: { ...product.hostedServices, servicesThrough: options.servicesThrough ?? null },
        });
        return;
      }
      options.onAction?.({ body, path });
      if (path === '/api/v1/pro/activation/start') {
        await fulfillJson(route, {
          activationId: '33333333-3333-4333-8333-333333333333',
          expiresAt: '2026-07-20T17:00:00Z',
          message: 'Fixture activation started.',
          publicKeyFingerprint: `sha256:${'a'.repeat(64)}`,
          schemaVersion: '1',
        });
        return;
      }
      if (path === '/api/v1/pro/activation/complete') {
        status = options.activationCompletionStatus ?? status;
        await fulfillJson(route, status);
        return;
      }
      if (path === '/api/v1/pro/deactivate') {
        await fulfillJson(route, {
          accountAssociationRemoved: false,
          completedAt: fixedAt,
          deactivated: true,
          deviceIdentityRemoved: false,
          localEntitlementRemoved: true,
          localModuleDataRemoved: false,
          message: 'Community Edition remains available. Local module data and the account association were retained.',
          onlineAccessDisabled: true,
          schemaVersion: '1',
        });
        return;
      }
      if (path === '/api/v1/pro/module/install' || path === '/api/v1/pro/module/remove') {
        await fulfillJson(route, jobFixture());
        return;
      }
      await fulfillJson(route, { error: { code: 'not_found' } }, 404);
    },
  );
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/v1/extensions/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      if (!installed || options.extensionAvailable?.() === false) {
        await fulfillJson(route, { error: { code: 'not_found' } }, 404);
      } else if (path.endsWith('/ui-manifest')) {
        await fulfillJson(route, {
          schemaVersion: '1',
          extensionId: 'autark-pro',
          componentVersion: '0.2.0',
          entrypoint: 'entry.js',
          entrypointSha256: `sha256:${'a'.repeat(64)}`,
          surfaces: ['pro.dashboard'],
        });
      } else if (path.endsWith('/assets/entry.js')) {
        await route.fulfill({
          body: browserModuleFixture(),
          contentType: 'text/javascript',
          status: 200,
        });
      } else if (path.endsWith('/surfaces/pro.dashboard')) {
        await fulfillJson(route, { label: 'pro.dashboard' });
      } else {
        await fulfillJson(route, { error: { code: 'not_found' } }, 404);
      }
    },
  );
  await page.goto('/pro', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  return requests;
}

function jobFixture() {
  return {
    jobId: 'pro-lifecycle-job',
    type: 'pro_module_change',
    subjectId: 'autark-pro-agent',
    status: 'queued',
    currentStep: 'queued',
    steps: [],
    createdAt: fixedAt,
    updatedAt: fixedAt,
    error: null,
  };
}

function browserModuleFixture() {
  return `
    export async function mount({ element, surface, apiBase }) {
      const root = element.attachShadow({ mode: 'open' });
      const response = await fetch(apiBase + '/surfaces/' + encodeURIComponent(surface));
      const payload = await response.json();
      const heading = document.createElement('h2');
      heading.textContent = 'Private extension surface';
      const value = document.createElement('p');
      value.textContent = payload.label;
      root.replaceChildren(heading, value);
      return () => root.replaceChildren();
    }
  `;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

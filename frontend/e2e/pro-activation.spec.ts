import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

const fixedAt = '2026-07-19T17:00:00Z';
const activeDigest = `sha256:${'c'.repeat(64)}`;

type ProAction = {
  body: unknown;
  path: string;
};

type OpenProOptions = {
  activationCompletionStatus?: ReturnType<typeof proStatus>;
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
      jobId: null,
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

test('installed Pro loads its browser module from the generic host', async ({ page }) => {
  const requests = await openPro(page, true);

  await expect(page.getByRole('heading', { name: 'Autark Pro is available' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private extension surface' }))
    .toBeVisible();
  await expect(page.getByText('pro.dashboard')).toBeVisible();
  expect(requests).toContain('/api/v1/extensions/autark-pro/ui-manifest');
  expect(requests.some((path) => path.startsWith('/api/v1/extensions/autark-pro/assets/entry.js')))
    .toBe(true);
  expect(requests).toContain('/api/v1/extensions/autark-pro/surfaces/pro.dashboard');
});

test('absent extension does not download browser code', async ({ page }) => {
  const requests = await openPro(page, false);

  await expect(page.getByRole('button', { name: 'Check for update' }))
    .toBeVisible();
  expect(requests.some((path) => path.includes('/assets/'))).toBe(false);
});

test('extension host shell is responsive and accessible', async ({ page }) => {
  await openPro(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
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
});

test('activation remains in the authenticated console and never puts the code in the URL', async ({ page }) => {
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

  await page.getByLabel('Device activation code').fill('AUTARK-PRO-1234-5678');
  await page.getByRole('button', { name: 'Verify this server' }).click();

  await expect(page.getByRole('heading', { name: 'Autark Pro is available' })).toBeVisible();
  expect(actions).toEqual([
    { body: { activationCode: 'AUTARK-PRO-1234-5678' }, path: '/api/v1/pro/activation/start' },
    { body: { activationId: '33333333-3333-4333-8333-333333333333' }, path: '/api/v1/pro/activation/complete' },
  ]);
  expect(page.url()).not.toContain('AUTARK-PRO-1234-5678');
});

test('release, rollback, retained-use, offline, and revoked lifecycle states give honest actions', async ({ page }) => {
  const release = proStatus(true);
  release.module.state = 'RELEASE_AVAILABLE';
  release.module.candidateVersion = '0.2.1';
  const releaseActions: ProAction[] = [];
  await openPro(page, true, { onAction: (action) => releaseActions.push(action), status: release });
  await expect(page.getByRole('button', { name: 'Update private extension' })).toBeVisible();
  await page.getByRole('button', { name: 'Update private extension' }).click();
  await expect.poll(() => releaseActions).toEqual([
    { body: null, path: '/api/v1/pro/module/install' },
  ]);

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
  await expect(page.getByRole('button', { name: /Check for update/i })).toBeVisible();

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
  const status = options.status ?? proStatus(installed);
  await installMockApi(page, 'ready');
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/v1/pro'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON() ?? null;
      if (path === '/api/v1/pro/status') {
        await fulfillJson(route, status);
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
        await fulfillJson(route, options.activationCompletionStatus ?? status);
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
      if (!installed) {
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

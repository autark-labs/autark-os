import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

const fixedAt = '2026-07-19T17:00:00Z';
const activeDigest = `sha256:${'c'.repeat(64)}`;

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
      health: installed ? 'healthy' : 'not-checked',
      jobId: null,
      errorCode: null,
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

  await expect(page.getByRole('heading', { name: 'Autark Pro' })).toBeVisible();
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

  await expect(page.getByRole('button', { name: 'Install private extension' }))
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

async function openPro(page: Page, installed: boolean) {
  const requests: string[] = [];
  await installMockApi(page, 'ready');
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/v1/pro'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/pro/status') await fulfillJson(route, proStatus(installed));
      else await fulfillJson(route, { error: { code: 'not_found' } }, 404);
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

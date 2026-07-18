import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from 'playwright/test';
import { installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

async function openRoute(page: Page, path: string, scenario: FixtureScenario = 'ready') {
  await installMockApi(page, scenario);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousViolations = results.violations.filter((violation) => (
    violation.impact === 'critical' || violation.impact === 'serious'
  ));

  expect(
    seriousViolations,
    seriousViolations.map((violation) => `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => node.html).join('\n')}`).join('\n\n'),
  ).toEqual([]);
}

test('setup flow has no serious or critical axe violations', async ({ page }) => {
  await openRoute(page, '/setup', 'onboarding');
  await expect(page.getByRole('heading', { name: /Set up Autark-OS/i })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('home and active job announcement have no serious or critical axe violations', async ({ page }) => {
  await openRoute(page, '/home');
  await expect(page.getByText(/Your Apps/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Backup in progress/i }).click();
  await expect(page.locator('section[aria-live="polite"][aria-atomic="true"]')).toContainText(/Backup/i);
  await expectNoSeriousAccessibilityViolations(page);
});

test('app management keeps its background inert without serious or critical axe violations', async ({ page }) => {
  await openRoute(page, '/apps');
  const manageApp = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i });
  await expect(manageApp).toBeVisible();
  await manageApp.click();
  await page.getByRole('button', { name: /^Manage app$/i }).click();
  await expect(page.getByText(/^Management$/i)).toBeVisible();
  await expect(page.locator('div[data-slot="table-container"]')).toHaveAttribute('inert', '');
  await expectNoSeriousAccessibilityViolations(page);
});

test('Discover, Access, and Settings have no serious or critical axe violations', async ({ page }) => {
  await openRoute(page, '/discover');
  await expect(page.getByText(/Discover Apps/i).first()).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto('/access', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Reachability matrix/i)).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: /^Device name/ })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('backup restore dialog has no serious or critical axe violations', async ({ page }) => {
  await openRoute(page, '/backups', 'idle');
  await page.getByRole('button', { name: /^Details$/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/Restore point details/i);
  await expectNoSeriousAccessibilityViolations(page);
});

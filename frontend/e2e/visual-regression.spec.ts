import { expect, test, type Page } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage, type FixtureScenario } from './support/mockApi';

type VisualCase = {
  expected: RegExp;
  name: string;
  path: string;
  scenario?: FixtureScenario;
  viewport: { width: number; height: number };
};

const visualCases: VisualCase[] = [
  { name: 'home-1440', path: '/home', expected: /Your Apps/i, viewport: { width: 1440, height: 1000 } },
  { name: 'setup-390', path: '/setup', expected: /Set up Autark-OS/i, scenario: 'onboarding', viewport: { width: 390, height: 844 } },
  { name: 'my-apps-1280', path: '/apps', expected: /My Apps/i, viewport: { width: 1280, height: 960 } },
  { name: 'found-apps-1024', path: '/apps/found', expected: /Resolve Existing Apps/i, viewport: { width: 1024, height: 960 } },
  { name: 'discover-1280', path: '/discover', expected: /Discover Apps/i, viewport: { width: 1280, height: 960 } },
  { name: 'access-1024', path: '/access', expected: /^Access$/i, viewport: { width: 1024, height: 960 } },
  { name: 'backups-1440', path: '/backups', expected: /^Backups$/i, viewport: { width: 1440, height: 1000 } },
  { name: 'backups-1024', path: '/backups', expected: /^Backups$/i, viewport: { width: 1024, height: 960 } },
  { name: 'backups-390', path: '/backups', expected: /^Backups$/i, viewport: { width: 390, height: 844 } },
  { name: 'storage-768', path: '/storage', expected: /Space breakdown/i, viewport: { width: 768, height: 960 } },
  { name: 'settings-1280', path: '/settings', expected: /Autark-OS controls/i, viewport: { width: 1280, height: 960 } },
  { name: 'diagnostics-1024', path: '/diagnostics', expected: /Autark-OS Diagnostics/i, viewport: { width: 1024, height: 960 } },
];

async function openVisualRoute(page: Page, visualCase: VisualCase) {
  await installMockApi(page, visualCase.scenario ?? 'ready');
  await page.setViewportSize(visualCase.viewport);
  await page.goto(visualCase.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: visualCase.expected }).first()).toBeVisible();
  await stabilizePage(page);
  await expectNoHorizontalOverflow(page);
}

for (const visualCase of visualCases) {
  test(`visual baseline: ${visualCase.name}`, async ({ page }) => {
    await openVisualRoute(page, visualCase);
    await expect(page).toHaveScreenshot(`${visualCase.name}.png`, { fullPage: true });
  });
}

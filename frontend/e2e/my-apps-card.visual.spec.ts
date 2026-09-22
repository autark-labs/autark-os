import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('My Apps grid cards use the compact homepage launcher treatment', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await page.getByRole('radio', { name: 'Grid view' }).click();
  await expect(page.getByText(/My Apps/i).first()).toBeVisible();
  const manageButton = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i });
  await expect(manageButton).toBeVisible();
  await page.getByRole('button', { name: /Vaultwarden with a deliberately long.*actions/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Restart', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const appCard = manageButton.locator('..');
  await appCard.getByText('Vaultwarden with a deliberately long self-hosted service name', { exact: true }).hover();
  const copyName = appCard.getByRole('button', { name: /Copy Vaultwarden with a deliberately long self-hosted service name/i });
  await expect(copyName).toHaveCSS('opacity', '1');
  await copyName.click();
  await expect(copyName).toHaveAttribute('data-copied', 'true');
  await expect(page.getByText('App name copied')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/my-apps-basic-final.png', fullPage: false });

  await page.getByRole('radio', { name: 'List view' }).click();
  const tableScrollArea = page.getByTestId('advanced-table-scroll-area');
  const nameHeader = page.getByRole('columnheader', { name: 'Name' });
  await expect(nameHeader).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Recent activity' })).toHaveCount(0);
  await expect(nameHeader).toHaveCSS('position', 'sticky');
  await expect(nameHeader).toHaveCSS('left', '0px');
  await expect(page.locator('[data-slot="table-container"]').first()).toBeVisible();
  const advancedName = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long self-hosted service name/i });
  await advancedName.hover();
  const advancedCopy = page.getByRole('button', { name: /Copy Vaultwarden with a deliberately long self-hosted service name/i });
  await expect(advancedCopy).toHaveCSS('opacity', '1');
  await advancedName.click();
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  const fixedRow = tableScrollArea.locator('tbody tr').first();
  await expect(fixedRow).toHaveCSS('height', '64px');
  await expect.poll(() => advancedName.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await tableScrollArea.evaluate((element) => {
    const tableBody = element.querySelector('tbody');
    const sourceRow = tableBody?.querySelector('tr');
    if (!tableBody || !sourceRow) return;
    for (let index = 0; index < 20; index += 1) {
      tableBody.appendChild(sourceRow.cloneNode(true));
    }
  });
  await expect.poll(() => tableScrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const scrollAreaBox = await tableScrollArea.boundingBox();
  await tableScrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const scrolledHeaderBox = await nameHeader.boundingBox();
  expect(scrolledHeaderBox?.y).toBeGreaterThanOrEqual((scrollAreaBox?.y ?? 0) - 1);
  expect(scrolledHeaderBox?.y).toBeLessThan((scrollAreaBox?.y ?? 0) + 24);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/my-apps-advanced-final.png', fullPage: false });

  await page.getByRole('radio', { name: 'Grid view' }).click();
  await manageButton.click();
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/autark-fe13-management.png', fullPage: false });
});

for (const width of [1024, 1280, 1440]) {
  test(`management stays centered and fixed-size across sections at ${width}px`, async ({ page }) => {
    await installMockApi(page, 'idle');
    await page.route('**/api/apps/vaultwarden/settings-plan', route => route.fulfill({ json: {
      headline: 'Save app settings?', summary: 'Review changes', saveAllowed: true, changes: ['Change port'], warnings: [], blockedReasons: [],
    } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/apps?focus=managed%3Avaultwarden');
    await stabilizePage(page);
    const dialog = page.getByRole('dialog', { name: /Vaultwarden/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('height', '672px');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(23);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 23);
    expect(bounds!.x + bounds!.width / 2).toBeCloseTo(width / 2, 0);
    for (const tab of ['Guide', 'Settings', 'Links', 'Diagnostics', 'Overview']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click();
      await expect(dialog.getByRole('tabpanel', { name: tab, exact: true })).toBeVisible();
      await expect(dialog).toHaveCSS('height', '672px');
      expect(await dialog.boundingBox()).toEqual(bounds);
      if (tab === 'Settings') {
        const save = dialog.getByRole('button', { name: 'Save changes', exact: true });
        await expect(save).toBeVisible();
        const footer = await save.boundingBox();
        expect(footer!.y + footer!.height).toBeLessThan(bounds!.y + bounds!.height);
        await page.getByLabel('Local app port', { exact: true }).fill('19090');
        await page.screenshot({ path: `/tmp/autark-fe13-settings-${width}.png`, fullPage: false });
        await save.click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByLabel('Local app port', { exact: true })).toHaveValue('19090');
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
      }
    }
    await page.screenshot({ path: `/tmp/autark-fe13-management-${width}.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search managed apps' })).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });
}

test('management deep links preserve sections and map retired sections without duplicate tabs', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.setViewportSize({ width: 1280, height: 960 });
  for (const [query, tab] of [['settings', 'Settings'], ['advanced', 'Diagnostics'], ['telemetry', 'Diagnostics'], ['recovery', 'Overview'], ['unknown', 'Overview']]) {
    await page.goto(`/apps?focus=managed%3Avaultwarden&panel=manage&tab=${query}`);
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('dialog').getByRole('tab')).toHaveCount(5);
  }
});

test('uninstall reviews a fresh safety plan, guards confirmation, and returns focus', async ({ page }) => {
  await installMockApi(page, 'idle');
  await page.setViewportSize({ width: 1280, height: 960 });
  let loads = 0;
  let runs = 0;
  await page.route('**/api/apps/vaultwarden/uninstall-plan', route => {
    loads++;
    return route.fulfill({ json: {
      appName: 'Vaultwarden', headline: 'Remove the app; keep its data.',
      willStop: ['Vaultwarden'], willKeep: ['App data'], needsConfirmation: ['No verified restore point is available.'],
    } });
  });
  await page.route('**/api/apps/vaultwarden/uninstall', route => {
    runs++;
    return route.fulfill({ json: { jobId: 'uninstall-check', type: 'uninstall_app', subjectId: 'vaultwarden', status: 'running', steps: [] } });
  });
  await page.goto('/apps?focus=managed%3Avaultwarden&panel=manage');
  const actions = page.getByRole('button', { name: 'App actions', exact: true });
  for (const dismiss of ['Cancel', 'Escape']) {
    const loadsBefore = loads;
    await actions.click();
    await page.getByRole('menuitem', { name: 'Uninstall app', exact: true }).click();
    const plan = page.getByRole('dialog', { name: 'Uninstall Vaultwarden', exact: true });
    await expect(plan).toContainText('Data preserved by default');
    expect(loads).toBeGreaterThan(loadsBefore);
    await expect(plan.getByRole('button', { name: 'Keep data and uninstall' })).toBeDisabled();
    if (dismiss === 'Cancel') await plan.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(plan).toHaveCount(0);
    await expect(actions).toBeFocused();
  }
  expect(runs).toBe(0);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Uninstall app', exact: true }).click();
  const plan = page.getByRole('dialog', { name: 'Uninstall Vaultwarden', exact: true });
  await plan.getByLabel('Type UNINSTALL to continue').fill('UNINSTALL');
  await plan.getByRole('button', { name: 'Keep data and uninstall' }).click();
  await expect.poll(() => runs).toBe(1);
  await expect(plan).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast]')).toBeVisible();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Close toast', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Vaultwarden/ })).toBeVisible();
});

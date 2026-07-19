import { expect, test } from 'playwright/test';
import { expectNoHorizontalOverflow, installMockApi, stabilizePage } from './support/mockApi';

test('My Apps basic cards use the compact homepage launcher treatment', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  await page.getByRole('button', { name: /^Basic$/i }).click();
  await expect(page.getByText(/My Apps/i).first()).toBeVisible();
  const manageButton = page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i });
  await expect(manageButton).toBeVisible();
  await page.getByRole('button', { name: /Vaultwarden with a deliberately long.*actions/i }).click();
  await expect(page.getByRole('menuitem', { name: /Restart app/i })).toBeVisible();
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
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
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
  await expect(page.getByLabel('Status legend')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await page.getByRole('tab', { name: 'Attention' }).click();
  await expect(page.getByText(/No attention needed|Creating backup/i).last()).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.screenshot({ path: 'test-results/my-apps-rail-option-b.png', fullPage: false });
  await expect(page.getByText(/A private password manager for this house/i)).toBeVisible();
});

test('My Apps found-app notice links to review and can be dismissed for the session', async ({ page }) => {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/apps', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);

  const reviewLink = page.getByRole('link', { name: 'Review existing apps' });
  await expect(reviewLink).toBeVisible();
  await reviewLink.click();
  await expect(page).toHaveURL(/\/apps\/found$/);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await expect(reviewLink).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss found apps notice' }).click();
  await expect(page.getByRole('heading', { name: 'Found on this server' })).toBeHidden();
});

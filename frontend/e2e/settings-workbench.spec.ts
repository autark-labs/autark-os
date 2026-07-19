import { expect, test } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

async function openSettings(page: Parameters<typeof installMockApi>[0]) {
  await installMockApi(page, 'ready');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await stabilizePage(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
}

test('Settings workbench keeps a fixed dialog while only its workspace scrolls', async ({ page }) => {
  await openSettings(page);

  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  const workspace = dialog.getByRole('region', { name: 'Settings workspace' });
  const initialBounds = await dialog.boundingBox();

  expect(initialBounds, 'settings dialog should be rendered').not.toBeNull();
  expect(initialBounds!.height, 'desktop settings workbench should use its fixed height').toBeCloseTo(768, 0);
  await expect(workspace).toBeVisible();

  await dialog.getByRole('button', { name: /Backups.*Backup schedule/i }).click();
  const backupBounds = await dialog.boundingBox();
  expect(backupBounds!.height, 'changing categories must not resize the dialog').toBeCloseTo(initialBounds!.height, 0);

  const workspaceMetrics = await workspace.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(workspaceMetrics.scrollHeight).toBeGreaterThan(workspaceMetrics.clientHeight);
  await workspace.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('button', { name: /Save changes/i })).toBeVisible();
});

test('Settings workbench uses the same guarded close flow for backdrop and close control', async ({ page }) => {
  await openSettings(page);

  const dialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  await dialog.getByRole('textbox', { name: 'Device name' }).fill('Fixture Home Server updated');
  await expect(dialog.getByText('Unsaved changes', { exact: true })).toBeVisible();

  const bounds = await dialog.boundingBox();
  expect(bounds, 'settings dialog should be rendered').not.toBeNull();
  await page.mouse.click(bounds!.x - 8, bounds!.y + bounds!.height / 2);
  await expect(page.getByRole('alertdialog')).toContainText('Save settings before closing?');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Save settings before closing?');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toHaveCount(0);

  await openSettings(page);
  const cleanDialog = page.getByRole('dialog', { name: 'Autark-OS settings' });
  const cleanBounds = await cleanDialog.boundingBox();
  expect(cleanBounds, 'settings dialog should reopen').not.toBeNull();
  await page.mouse.click(cleanBounds!.x - 8, cleanBounds!.y + cleanBounds!.height / 2);
  await expect(cleanDialog).toHaveCount(0);
});

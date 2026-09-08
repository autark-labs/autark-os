import { expect, test } from 'playwright/test';
import type { BackupReport } from '../src/types/backup';
import type { StorageReport } from '../src/types/system';
import { expectNoHorizontalOverflow, installMockApi } from './support/mockApi';

for (const width of [1440, 390]) {
  test(`older full restore points remain accessible from an app folder at ${width}px`, async ({ page }) => {
    await installMockApi(page, 'idle');
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/backups');
    const report: BackupReport = await page.evaluate(async () => (await fetch('/api/backups')).json());
    const point = { ...report.apps[0].restorePoints[0], id: 202, appId: '__full__', appName: 'All apps',
      scope: 'full', includedAppIds: 'homepage,vaultwarden', path: '/backups/older-full.zip' };
    report.recentRestorePoints = [];
    report.apps[0].restorePoints = [point];
    report.apps[0].latestBackup = point;
    await page.route('**/api/backups', route => route.fulfill({ json: report }));
    await page.goto('/backups?app=vaultwarden&backup=202');
    await expect(page.locator('p:visible').filter({ hasText: /^Full checkpoint$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /checkpoint-.*\.autark-backup/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const storage: StorageReport = await page.evaluate(async () => (await fetch('/api/system/storage')).json());
    storage.backupStorage.usedBytes = -1;
    storage.backupStorage.usedPercent = -1;
    await page.route('**/api/system/storage', route => route.fulfill({ json: storage }));
    await page.goto('/storage?tab=backups');
    await expect(page.getByText('Unavailable', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

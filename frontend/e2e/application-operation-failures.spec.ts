import { expect, test } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

for (const type of ['backup_restore', 'uninstall_app']) {
  test(`${type} shows terminal failure and relevant recovery rather than start/stop advice`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await installMockApi(page, 'idle');
    let status = 'running';
    const label = type === 'backup_restore' ? 'Restore failed' : 'Uninstall failed';
    const job = () => ({ jobId: 'operation-test', type, subjectId: type === 'backup_restore' ? '42:vaultwarden' : 'vaultwarden',
      status, createdAt: '2026-06-29T12:00:00Z', updatedAt: '2026-06-29T12:00:00Z', currentStep: 'checkpoint',
      steps: [{ id: 'checkpoint', label: 'Create safety checkpoint', status, message: 'The backup destination is unavailable.' }],
      error: status === 'failed' ? { code: 'job_failed', message: 'The backup destination is unavailable.', details: {} } : null });
    await page.route('**/api/jobs', route => route.fulfill({ json: [job()] }));
    await page.goto('/apps');
    await stabilizePage(page);
    await expect(page.getByText(type === 'backup_restore' ? 'Restoring' : 'Uninstalling safely', { exact: true }).first()).toBeVisible();
    status = 'failed';
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
    await page.getByRole('button', { name: /^Manage app$/i }).click();
    await page.getByRole('tab', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('tabpanel', { name: 'Recovery', exact: true });
    await expect(recovery.getByText(label, { exact: true })).toBeVisible();
    await expect(recovery.getByRole('button', { name: 'Start again', exact: true })).toHaveCount(0);
    await expect(recovery.getByRole('button', { name: 'Stop app', exact: true })).toHaveCount(0);
    if (type === 'backup_restore') {
      await recovery.getByRole('link', { name: 'Review backups and restore plan' }).click();
      await expect(page).toHaveURL(/\/backups\?app=vaultwarden/);
    } else {
      await recovery.getByRole('button', { name: 'Review app management' }).click();
      const managementTabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'Recovery', exact: true }) });
      await expect(managementTabs.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText('Uninstall', { exact: true })).toBeVisible();
    }
    status = 'succeeded';
    await page.goto('/apps');
    await expect(page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i })).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });
}

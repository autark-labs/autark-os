import { expect, test } from 'playwright/test';
import { installMockApi, stabilizePage } from './support/mockApi';

test('a rejected app action shows the server explanation, not a started notification', async ({ page }) => {
  await installMockApi(page, 'idle');
  const message = 'Another operation is already running: Creating restore point. This request was not started. Wait for that operation to finish, then try again.';
  let requests = 0;
  await page.route('**/api/apps/vaultwarden/restart', async route => {
    requests++;
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({
      code: 'job_conflict', message, activeJobId: 'job_backup', activeJobType: 'backup', activeJobStatus: 'running',
    }) });
  });
  await page.goto('/apps');
  await stabilizePage(page);
  await page.getByRole('button', { name: /Manage Vaultwarden with a deliberately long/i }).click();
  await page.getByRole('button', { name: /^Restart$/i }).click();
  await expect(page.getByText(message).first()).toBeVisible();
  await expect(page.getByText('App action started', { exact: true })).toHaveCount(0);
  expect(requests).toBe(1);
});

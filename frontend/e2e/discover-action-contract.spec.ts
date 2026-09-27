import { expect, test, type Page } from 'playwright/test';
import type { DiscoverAppView, DiscoverInstallPreview } from '../src/types/discover';
import { installMockApi } from './support/mockApi';

async function discoverFixture(page: Page) {
  await installMockApi(page, 'idle');
  await page.goto('/home');
  const apps: DiscoverAppView[] = await page.evaluate(async () => (await fetch('/api/discover/apps')).json());
  await page.route('**/api/discover/apps', (route) => route.fulfill({ json: apps }));
  return apps;
}

for (const width of [1024, 1440]) {
  test(`${width}px install requires a successful preview before confirmation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    const apps = await discoverFixture(page);
    const app = apps.find(view => view.application.id === 'immich')!.application;
    app.relationship = 'available';
    app.primaryAction = { id: 'review_setup', label: 'Review install', kind: 'install', href: null, method: null, disabled: false, reason: '' };
    const preview: DiscoverInstallPreview = await page.evaluate(async () => (await fetch('/api/discover/apps/immich/install-preview', { method: 'POST' })).json());
    let releasePreview!: () => void;
    const pending = new Promise<void>(resolve => { releasePreview = resolve; });
    let offline = true;
    let previewRequests = 0;
    let installs = 0;
    let releaseInstall!: () => void;
    const submitting = new Promise<void>(resolve => { releaseInstall = resolve; });
    await page.route('**/api/discover/apps/immich/install-preview', async route => {
      previewRequests++;
      await pending;
      await route.fulfill(offline ? { status: 503, json: { message: 'Plan service unavailable' } } : { json: preview });
    });
    await page.route('**/api/discover/apps/immich/install', async route => {
      installs++;
      await submitting;
      return route.fulfill({ status: 409, json: { message: 'The host changed. Review installation again.' } });
    });
    await page.goto('/discover?detail=immich');
    await page.getByRole('button', { name: 'Review install', exact: true }).click();
    const wizard = page.getByRole('dialog', { name: 'Install Immich', exact: true });
    await expect(wizard).toBeVisible();
    await expect.poll(() => previewRequests).toBeGreaterThan(0);
    await expect(wizard.getByRole('checkbox', { name: 'Confirm install plan' })).toBeDisabled();
    await expect(wizard.getByRole('button', { name: 'Install app', exact: true })).toBeDisabled();
    await expect(wizard).toContainText('Checking installation');
    await expect(wizard).not.toContainText('Backup protection will be enabled');
    expect(installs).toBe(0);
    releasePreview();
    await expect(wizard.getByRole('button', { name: 'Retry plan', exact: true })).toBeVisible();
    await expect(wizard).toContainText('Plan service unavailable');
    await expect(wizard.getByRole('checkbox', { name: 'Confirm install plan' })).toBeDisabled();
    offline = false;
    await wizard.getByRole('button', { name: 'Retry plan', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(wizard).toContainText('Include this app in backups and recommend a first restore point.');
    await expect(wizard).toContainText('Create a first restore point before making major changes.');
    await wizard.screenshot({ path: testInfo.outputPath('verified-plan.png') });
    await wizard.getByRole('checkbox', { name: 'Confirm install plan' }).check();
    await wizard.getByRole('button', { name: 'Install app', exact: true }).click();
    await expect.poll(() => installs).toBe(1);
    await expect(wizard.getByRole('button', { name: 'Installing...', exact: true })).toBeDisabled();
    releaseInstall();
    await expect(page.locator('[data-sonner-toast]')).toContainText('The host changed');
    await expect(wizard).toBeVisible();
    // A cached valid preview must not approve installation after a failed recheck.
    offline = true;
    await wizard.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Review install', exact: true }).click();
    await expect(wizard.getByRole('button', { name: 'Retry plan', exact: true })).toBeVisible();
    await expect(wizard.getByRole('checkbox')).toBeDisabled();
    await expect(wizard).not.toContainText('Create Immich as a managed');
    expect(installs).toBe(1);
  });

  test(`${width}px changed install choices require their own plan and confirmation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const apps = await discoverFixture(page);
    const view = apps.find(view => view.application.id === 'immich')!;
    view.application.relationship = 'available';
    view.application.primaryAction = { id: 'review_setup', label: 'Review install', kind: 'install', href: null, method: null, disabled: false, reason: '' };
    view.setupSchema.inputs = [{ id: 'displayName', label: 'App name', type: 'text', tier: 'app_specific', required: true, defaultValue: 'Original library', help: 'Name this library.', options: [], showWhen: {} }];
    const preview: DiscoverInstallPreview = await page.evaluate(async () => (await fetch('/api/discover/apps/immich/install-preview', { method: 'POST' })).json());
    let releaseSlow!: () => void;
    const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
    let slowRequests = 0;
    let slowResponses = 0;
    const installs: unknown[] = [];
    await page.route('**/api/discover/apps/immich/install-preview', async route => {
      const { answers } = route.request().postDataJSON();
      if (answers.displayName === 'Slow library') {
        slowRequests++;
        await slow;
      }
      await route.fulfill({ json: { ...preview, valid: Boolean(answers.displayName),
        blockingIssues: answers.displayName ? [] : [{ fieldId: 'displayName', severity: 'error', message: 'Enter an app name.' }],
        sections: preview.sections.map(section => section.id === 'create' ? { ...section, items: [{ label: `Create ${answers.displayName}`, tone: 'default' }] } : section),
      } });
      if (answers.displayName === 'Slow library') slowResponses++;
    });
    await page.route('**/api/discover/apps/immich/install', route => {
      installs.push(route.request().postDataJSON());
      return route.fulfill({ json: { jobId: 'chosen-install', type: 'install_app', subjectId: 'immich', status: 'running', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z' } });
    });
    await page.goto('/discover?detail=immich');
    await page.getByRole('button', { name: 'Review install', exact: true }).click();
    const wizard = page.getByRole('dialog', { name: 'Install Immich', exact: true });
    const confirmation = wizard.getByRole('checkbox', { name: 'Confirm install plan' });
    await expect(wizard).toContainText('Create Original library');
    await confirmation.check();
    for (const name of ['', 'Slow library', 'Final library']) {
      await wizard.getByRole('button', { name: 'Review', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Configure Immich', exact: true });
      await settings.getByRole('textbox', { name: 'App name', exact: true }).fill(name);
      await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.getByRole('button', { name: 'Review install', exact: true }).click();
      await expect(confirmation).not.toBeChecked();
      if (!name) {
        await expect(wizard).toContainText('Enter an app name.');
        await expect(confirmation).toBeDisabled();
      } else if (name === 'Slow library') {
        await expect.poll(() => slowRequests).toBeGreaterThan(0);
        await expect(wizard).toContainText('Checking installation');
        await expect(confirmation).toBeDisabled();
      }
      expect(installs).toHaveLength(0);
    }
    await expect(wizard).toContainText('Create Final library');
    releaseSlow();
    await expect.poll(() => slowResponses).toBeGreaterThan(0);
    await expect(wizard).not.toContainText('Create Slow library');
    await expect(confirmation).not.toBeChecked();
    await expect(wizard.getByRole('button', { name: 'Install app', exact: true })).toBeDisabled();
    await confirmation.check();
    await wizard.getByRole('button', { name: 'Install app', exact: true }).click();
    await expect.poll(() => installs.length).toBe(1);
    expect(installs[0]).toMatchObject({ answers: { displayName: 'Final library' } });
    await expect(wizard).not.toBeVisible();
  });
}

test('a late preview for another app cannot authorize the current selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const apps = await discoverFixture(page);
  for (const view of apps) {
    view.application.relationship = 'available';
    view.application.name = view.app.name = view.application.id === 'immich' ? 'Immich' : 'Vaultwarden';
    view.application.primaryAction = { id: 'review_setup', label: 'Review install', kind: 'install', href: null, method: null, disabled: false, reason: '' };
  }
  const preview: DiscoverInstallPreview = await page.evaluate(async () => (await fetch('/api/discover/apps/immich/install-preview', { method: 'POST' })).json());
  const release: Record<string, () => void> = {};
  const pending = Object.fromEntries(['immich', 'vaultwarden'].map(id => [id, new Promise<void>(resolve => { release[id] = resolve; })]));
  const responses: string[] = [];
  await page.route('**/api/discover/apps/*/install-preview', async route => {
    const id = route.request().url().split('/').at(-2)!;
    await pending[id];
    await route.fulfill({ json: { ...preview, sections: [{ id: 'create', title: 'Create', items: [{ label: `Verified ${id}`, tone: 'default' }] }] } });
    responses.push(id);
  });
  let installs = 0;
  await page.route('**/api/discover/apps/*/install', route => { installs++; return route.fulfill({ status: 409, json: {} }); });
  await page.goto('/discover');
  await page.getByRole('combobox', { name: 'Catalog', exact: true }).click();
  await page.getByRole('option', { name: 'All apps', exact: true }).click();
  await page.getByRole('button', { name: 'Select Immich', exact: true }).click();
  await page.getByRole('button', { name: 'Review install', exact: true }).click();
  await page.getByRole('dialog', { name: 'Install Immich', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Select Vaultwarden', exact: true }).click();
  await page.getByRole('button', { name: 'Review install', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Install Vaultwarden', exact: true });
  release.immich();
  await expect.poll(() => responses.includes('immich')).toBe(true);
  await expect(wizard.getByRole('checkbox')).toBeDisabled();
  await expect(wizard).not.toContainText('Verified immich');
  release.vaultwarden();
  await expect(wizard).toContainText('Verified vaultwarden');
  await expect(wizard.getByRole('checkbox')).not.toBeChecked();
  expect(installs).toBe(0);
});

test('local catalog and category filters keep an empty result usable without unrelated app actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const apps = await discoverFixture(page);
  apps.find(view => view.application.id === 'immich')!.app.supportLevel = 'Experimental';
  await page.goto('/discover');
  const catalog = page.getByRole('combobox', { name: 'Catalog', exact: true });
  const rail = page.getByLabel('Selected Discover app', { exact: true });
  await expect(catalog).toContainText('Starter apps');
  await expect(page.getByText('No apps match this view.', { exact: true })).toBeVisible();
  await expect(rail).toHaveCount(0);
  await expect(page.getByText('Loading Discover', { exact: true })).toHaveCount(0);
  await catalog.click();
  await page.getByRole('option', { name: 'Ready apps', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Select Vaultwarden/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Immich', exact: true })).toHaveCount(0);
  await catalog.click();
  await page.getByRole('option', { name: 'All apps', exact: true }).click();
  await page.getByRole('button', { name: 'Select Immich', exact: true }).click();
  await expect(rail).toContainText('Experimental');
  const category = page.getByRole('combobox', { name: 'Category', exact: true });
  await category.click();
  await page.getByRole('option', { name: 'Security', exact: true }).click();
  await expect(rail).toContainText('Vaultwarden');
  await catalog.click();
  await page.getByRole('option', { name: 'Starter apps', exact: true }).click();
  await expect(category).toContainText('Security');
  await expect(rail).toHaveCount(0);
  await catalog.click();
  await page.getByRole('option', { name: 'All apps', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search Discover apps' }).fill('no-matching-app');
  await expect(rail).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search Discover apps' }).clear();
  await expect(rail).toContainText('Vaultwarden');
  // A deliberate deep link is independent of the default catalog filter.
  await page.goto('/discover?detail=immich');
  await expect(catalog).toContainText('Starter apps');
  await expect(rail).toContainText('Immich');
  await page.getByRole('link', { name: 'Storage', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Technical details', exact: true })).toBeVisible();
});

test('an empty server catalog keeps filters and refresh available', async ({ page }) => {
  await discoverFixture(page);
  await page.route('**/api/discover/apps', route => route.fulfill({ json: [] }));
  await page.goto('/discover');
  await expect(page.getByText('No apps match this view.', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Catalog', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.getByText('Loading Discover', { exact: true })).toHaveCount(0);
});

test('mobile Discover management links use the app ID, not its installation identity', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apps = await discoverFixture(page);
  const app = apps.find((view) => view.application.relationship === 'managed')!.application;
  expect(app.appInstanceId).not.toBe(app.id);
  await page.goto(`/discover?detail=${app.id}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'View in My Apps', exact: true })).toHaveAttribute('href', '/apps?focus=managed%3Avaultwarden&panel=manage');
  await dialog.getByRole('link', { name: 'Manage in My Apps', exact: true }).click();
  await expect(page).toHaveURL(/\/apps\?focus=managed%3Avaultwarden&panel=manage$/);
  await expect(page.getByRole('tab', { name: 'Guide', exact: true })).toBeVisible();
});

for (const missingFromList of [false, true]) {
  test(`Discover follows ${missingFromList ? 'unlisted' : 'listed'} jobs through reload, completion and backup retry`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 960 });
    const apps = await discoverFixture(page);
    const app = apps.find((view) => view.application.relationship === 'managed')!.application;
    app.runtime!.backupProtection = 'backup_enabled_no_restore_point';
    const backup = app.availableActions.find((action) => action.id === 'backup')!;
    backup.disabled = true;
    backup.reason = 'The original Compose file is missing.';
    let completed = false;
    let listed = true;
    let detailRequests = 0;
    let catalogRequests = 0;
    let backupAttempts = 0;
    const job = () => ({ jobId: 'fixture-install', type: 'install_app', subjectId: app.id, status: completed ? 'succeeded' : 'running', currentStep: 'finish', steps: [], createdAt: '2025-01-15T12:00:00Z', updatedAt: '2025-01-15T12:00:00Z', error: null });
    let backupJob: ReturnType<typeof job> | null = null;
    await page.route('**/api/discover/apps', route => {
      catalogRequests++;
      return route.fulfill({ json: apps });
    });
    await page.route('**/api/jobs', (route) => route.fulfill({ json: [...(listed ? [job()] : []), ...(backupJob ? [backupJob] : [])] }));
    await page.route('**/api/jobs/fixture-install', (route) => {
      detailRequests++;
      return route.fulfill({ json: job() });
    });
    await page.route('**/api/backups/apps/*/run', route => {
      expect(new URL(route.request().url()).pathname).toBe(`/api/backups/apps/${app.id}/run`);
      backupAttempts++;
      backupJob = { ...job(), jobId: `fixture-backup-${backupAttempts}`, type: 'backup', status: backupAttempts === 1 ? 'failed' : 'running' };
      return route.fulfill({ json: backupJob });
    });
    await page.goto(`/discover?detail=${app.id}`);
    await expect(page.getByRole('heading', { name: 'Installing Vaultwarden', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Installing Vaultwarden', exact: true })).toBeVisible();
    listed = !missingFromList;
    completed = true;
    await expect(page.getByRole('button', { name: 'Create first backup', exact: true })).toBeDisabled();
    expect(detailRequests > 0).toBe(missingFromList);
    backup.disabled = false;
    backup.reason = '';
    // Refresh the catalog without replacing the selected job or remounting the page.
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('combobox', { name: 'Catalog', exact: true }).click();
    await page.getByRole('option', { name: 'All apps', exact: true }).click();
    await page.getByRole('button', { name: `Select ${app.name}`, exact: true }).click();
    await expect(page.getByLabel('Selected Discover app', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create first backup', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Create first backup', exact: true }).click();
    await expect.poll(() => backupAttempts).toBe(1);
    await expect(page.getByRole('button', { name: 'Create first backup', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Create first backup', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Creating backup', exact: true })).toBeDisabled();
    backupJob!.status = 'succeeded';
    await expect(page.getByRole('button', { name: 'Backup created', exact: true })).toBeVisible();
    expect(backupAttempts).toBe(2);
    expect(catalogRequests).toBeLessThan(20);
  });
}

for (const width of [390, 1024, 1440]) {
  test(`${width}px Discover follows the canonical recovery action`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await discoverFixture(page);
    await page.goto('/discover?detail=immich');
    await page.getByRole('link', { name: 'Recover app', exact: true }).first().click();
    await expect(page).toHaveURL(/\/apps\?review=immich$/);
    await expect(page.getByRole('dialog')).toContainText('Recover Immich');
  });

  test(`${width}px Discover only offers second-copy installation when explicitly allowed`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const apps = await discoverFixture(page);
    const app = apps.find((view) => view.application.id === 'immich')!.application;
    const requests: unknown[] = [];
    await page.route('**/api/discover/apps/immich/install', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { message: 'Existing resource changed; review it again.' } });
    });
    app.relationship = 'blocked';
    app.primaryAction = { id: 'review_existing', label: 'Review existing service', kind: 'route', href: '/apps?review=immich', method: null, disabled: false, reason: '' };
    for (const permission of ['absent', 'disabled', 'allowed']) {
      app.availableActions = permission === 'absent' ? [] : [{ id: 'install_copy', label: 'Install second copy', kind: 'install', href: '/api/discover/apps/immich/install', method: 'POST', disabled: permission === 'disabled', reason: '' }];
      await page.goto('/discover?detail=immich');
      const details = width < 1280 ? page.getByRole('dialog') : page.getByLabel('Discover app details');
      await expect(details).toBeVisible();
      const copy = details.getByRole('button', { name: 'Install second copy', exact: true });
      if (permission !== 'allowed') {
        await expect(copy).toHaveCount(0);
      } else {
        await copy.click();
        await expect(page.getByRole('dialog').filter({ hasText: 'Install a second copy?' })).toBeVisible();
        await page.getByRole('button', { name: 'Install second copy anyway', exact: true }).click();
        const wizard = page.getByRole('dialog', { name: 'Install Immich', exact: true });
        await expect(wizard).toBeVisible();
        await expect(wizard.getByRole('button', { name: 'Install app', exact: true })).toBeDisabled();
        await expect(wizard.getByRole('checkbox')).toBeEnabled();
        await wizard.getByRole('checkbox').check();
        await wizard.getByRole('button', { name: 'Install app', exact: true }).click();
        await expect.poll(() => requests.length).toBe(1);
        expect(requests[0]).toMatchObject({ duplicateAcknowledged: true });
        await expect(page.locator('[data-sonner-toast]')).toContainText('Existing resource changed');
      }
    }
  });
}

test('legacy reinstall URLs retain app navigation but cannot bypass install planning', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 960 });
  await discoverFixture(page);
  let installs = 0;
  await page.route('**/api/discover/apps/*/install', route => { installs++; return route.fulfill({ status: 409, json: {} }); });
  for (const mode of ['reinstall', 'reset-reinstall']) {
    await page.goto(`/discover?app=vaultwarden&mode=${mode}`);
    await expect(page.getByRole('link', { name: 'View in My Apps', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /reinstall/i })).toHaveCount(0);
    await expect(page.getByText('Reinstall requested', { exact: true })).toHaveCount(0);
  }
  expect(installs).toBe(0);
});

test('a pending install request stays associated with its app when the wizard is closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const apps = await discoverFixture(page);
  for (const view of apps) {
    view.application.relationship = 'available';
    view.application.primaryAction = { id: 'review_setup', label: 'Review install', kind: 'install', href: null, method: null, disabled: false, reason: '' };
  }
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/discover/apps/immich/install', async route => {
    requests++;
    await pending;
    await route.fulfill({ status: 409, json: { message: 'Installation was not accepted.' } });
  });
  await page.goto('/discover');
  await page.getByRole('combobox', { name: 'Catalog', exact: true }).click();
  await page.getByRole('option', { name: 'All apps', exact: true }).click();
  await page.getByRole('button', { name: 'Select Immich', exact: true }).click();
  await page.getByRole('button', { name: 'Review install', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Install Immich', exact: true });
  await expect(wizard.getByRole('checkbox')).toBeEnabled();
  await wizard.getByRole('checkbox').check();
  await wizard.getByRole('button', { name: 'Install app', exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /^Select Vaultwarden/ }).click();
  const rail = page.getByLabel('Selected Discover app', { exact: true });
  await expect(rail.getByRole('button', { name: 'Install blocked', exact: true })).toBeDisabled();
  await expect(rail.getByRole('button', { name: 'Installing...', exact: true })).toHaveCount(0);
  release();
  await expect(rail.getByRole('button', { name: 'Review install', exact: true })).toBeEnabled();
  expect(requests).toBe(1);
});

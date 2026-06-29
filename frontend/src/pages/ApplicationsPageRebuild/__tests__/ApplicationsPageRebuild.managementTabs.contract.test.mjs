import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications rebuild splits settings and links management tabs into focused components', () => {
  const tabsDir = resolve(root, 'src/pages/ApplicationsPageRebuild/managementTabs');
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationSettingsTab.tsx')), true);
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationLinksTab.tsx')), true);

  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const settings = source('src/pages/ApplicationsPageRebuild/managementTabs/ApplicationSettingsTab.tsx');
  const links = source('src/pages/ApplicationsPageRebuild/managementTabs/ApplicationLinksTab.tsx');
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const liveModel = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.liveModel.ts');

  assert.match(panel, /ApplicationSettingsTab/);
  assert.match(panel, /ApplicationLinksTab/);
  assert.doesNotMatch(panel, /function SettingToggle|function LinkRow/);
  assert.match(settings, /title="Container"/);
  assert.match(settings, /title="Access"/);
  assert.match(settings, /title="Backups"/);
  assert.doesNotMatch(settings, /onAutoRepairChange\(item\.id, checked\)/);
  assert.doesNotMatch(settings, /onPrivateAccessChange\(item\.id, checked\)/);
  assert.match(links, /primaryUrl/);
  assert.match(links, /privateUrl/);
  assert.match(links, /backendTargetUrl/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings\(appId, nextSettings\)/);
  assert.match(page, /InstalledAppsAPIClient\.repairPrivateAccess\(appId\)/);
  assert.match(page, /InstalledAppsAPIClient\.disablePrivateAccess\(appId\)/);
  assert.match(liveModel, /links: appLinks\(app\)/);
  assert.match(liveModel, /settings: appSettings\(app\)/);
});

test('applications rebuild settings tab uses a guarded batch form for app settings', () => {
  const pkg = source('package.json');
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx');
  const settings = source('src/pages/ApplicationsPageRebuild/managementTabs/ApplicationSettingsTab.tsx');

  assert.match(pkg, /"react-hook-form"/);
  assert.match(settings, /useForm<ApplicationSettingsFormValues>/);
  assert.match(settings, /handleSubmit/);
  assert.match(settings, /formState:\s*\{\s*isDirty/);
  assert.match(settings, /Save changes/);
  assert.match(settings, /Reset/);
  assert.match(settings, /Restart required|Safe to save/);
  assert.match(settings, /beforeunload/);
  assert.match(settings, /onDirtyChange\(item\.id, isDirty\)/);
  assert.match(settings, /onSaveSettings\(item\.id, pendingValues\)/);
  assert.doesNotMatch(settings, /onAutoRepairChange\(item\.id, checked\)/);
  assert.doesNotMatch(settings, /onPrivateAccessChange\(item\.id, checked\)/);
  assert.match(page, /saveApplicationSettings\(appId: string, values: ApplicationSettingsFormValues\)/);
  assert.match(page, /InstalledAppsAPIClient\.settingsChangePlan\(appId, nextSettings\)/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings\(appId, nextSettings\)/);
  assert.match(page, /values\.tailscaleEnabled !== app\.settings\?\.tailscaleEnabled/);
  assert.match(page, /window\.confirm\('Discard unsaved app settings\?'\)/);
  assert.match(rail, /canCloseManagement/);
});

test('applications rebuild settings tab uses real controls and confirm-before-save planning', () => {
  const rail = source('src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx');
  const settings = source('src/pages/ApplicationsPageRebuild/managementTabs/ApplicationSettingsTab.tsx');
  const tooltip = source('src/components/ui/tooltip.tsx');

  assert.match(settings, /AlertDialog/);
  assert.match(settings, /Tooltip/);
  assert.match(settings, /bg-slate-950/);
  assert.match(settings, /Input/);
  assert.match(settings, /Select/);
  assert.match(settings, /useId/);
  assert.match(settings, /htmlFor=\{inputId\}/);
  assert.match(settings, /id=\{inputId\}/);
  assert.match(settings, /prepareSave/);
  assert.match(settings, /confirmSave/);
  assert.match(settings, /Local app port/);
  assert.match(settings, /Backup retention/);
  assert.match(rail, /lg:w-\[66rem\]/);
  assert.match(rail, /xl:w-\[72rem\]/);
  assert.match(tooltip, /bg-popover/);
  assert.match(tooltip, /text-popover-foreground/);
  assert.doesNotMatch(settings, /role="switch"/);
  assert.doesNotMatch(settings, /onClick=\{\(\) => toggleField\(\)\}/);
  assert.doesNotMatch(settings, /<FieldLabel className="text-white">\s*<SettingLabel/);
  assert.doesNotMatch(tooltip, /bg-foreground px-3 py-1\.5 text-xs text-background/);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page splits settings and links management tabs into focused components', () => {
  const tabsDir = resolve(root, 'src/pages/ApplicationsPage/managementTabs');
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationSettingsTab.tsx')), true);
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationLinksTab.tsx')), true);
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationGuideTab.tsx')), true);
  assert.equal(existsSync(resolve(tabsDir, 'ApplicationTelemetryTab.tsx')), true);

  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');
  const links = source('src/pages/ApplicationsPage/managementTabs/ApplicationLinksTab.tsx');
  const guide = source('src/pages/ApplicationsPage/managementTabs/ApplicationGuideTab.tsx');
  const telemetry = source('src/pages/ApplicationsPage/managementTabs/ApplicationTelemetryTab.tsx');
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const liveModel = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.liveModel.ts');

  assert.match(panel, /ApplicationSettingsTab/);
  assert.match(panel, /ApplicationLinksTab/);
  assert.match(panel, /ApplicationGuideTab/);
  assert.match(panel, /ApplicationTelemetryTab/);
  assert.doesNotMatch(panel, /function SettingToggle|function LinkRow/);
  assert.doesNotMatch(panel, /function MetricBar/);
  assert.doesNotMatch(panel, /function CopyValue/);
  assert.match(settings, /title="Container"/);
  assert.match(settings, /title="Access"/);
  assert.match(settings, /title="Backups"/);
  assert.doesNotMatch(settings, /onAutoRepairChange\(item\.id, checked\)/);
  assert.doesNotMatch(settings, /onPrivateAccessChange\(item\.id, checked\)/);
  assert.match(links, /primaryUrl/);
  assert.match(links, /privateUrl/);
  assert.match(links, /backendTargetUrl/);
  assert.match(guide, /usageGuide/);
  assert.match(guide, /setupGuide/);
  assert.match(guide, /copyableFields/);
  assert.match(telemetry, /item\.runtime\.telemetry/);
  assert.match(telemetry, /useAppTelemetryQuery/);
  assert.doesNotMatch(telemetry, /InstalledAppsAPIClient\.appTelemetry/);
  assert.match(telemetry, /item\.runtime\.health/);
  assert.match(telemetry, /memoryPercent/);
  assert.match(telemetry, /networkIo/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings\(appId, nextSettings\)/);
  assert.match(page, /InstalledAppsAPIClient\.enablePrivateAccess\(appId\)/);
  assert.match(page, /InstalledAppsAPIClient\.disablePrivateAccess\(appId\)/);
  assert.match(liveModel, /links: appLinks\(app\)/);
  assert.match(liveModel, /settings: appSettings\(app\)/);
  assert.match(liveModel, /runtime: appRuntimeDetails\(app, health, telemetry\)/);
});

test('applications page settings tab uses a guarded batch form for app settings', () => {
  const pkg = source('package.json');
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');

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
  assert.match(settings, /onSetPrivateNetworkAccess/);
  assert.match(settings, /actions\.onSetPrivateNetworkAccess\(item\.id, checked\)/);
  assert.match(page, /saveApplicationSettings\(appId: string, values: ApplicationSettingsFormValues\)/);
  assert.match(page, /InstalledAppsAPIClient\.settingsChangePlan\(appId, nextSettings\)/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings\(appId, nextSettings\)/);
  assert.doesNotMatch(page, /values\.tailscaleEnabled !== app\.settings\?\.tailscaleEnabled/);
  assert.doesNotMatch(page, /appWithOptimisticPrivateAccess/);
  assert.doesNotMatch(settings, /name="tailscaleEnabled"/);
  assert.match(page, /window\.confirm\('Discard unsaved app settings\?'\)/);
  assert.match(rail, /canCloseManagement/);
});

test('applications page settings tab uses real controls and confirm-before-save planning', () => {
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');

  assert.match(settings, /AlertDialog/);
  assert.match(settings, /Tooltip/);
  assert.match(settings, /Input/);
  assert.match(settings, /Select/);
  assert.match(settings, /useId/);
  assert.match(settings, /htmlFor=\{inputId\}/);
  assert.match(settings, /id=\{inputId\}/);
  assert.match(settings, /prepareSave/);
  assert.match(settings, /confirmSave/);
  assert.match(settings, /Local app port/);
  assert.match(settings, /Backup retention/);
  assert.doesNotMatch(settings, /role="switch"/);
  assert.doesNotMatch(settings, /onClick=\{\(\) => toggleField\(\)\}/);
});

test('applications page management panel uses canonical runtime data instead of generated mock facts', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const liveModel = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.liveModel.ts');

  assert.doesNotMatch(panel, /appManagementMock/);
  assert.doesNotMatch(panel, /127\.0\.0\.1:\$\{8000 \+ seed\}/);
  assert.doesNotMatch(panel, /autark-os-\$\{item\.id\}/);
  assert.doesNotMatch(panel, /\/var\/lib\/autark-os\/apps\/\$\{item\.id\}/);
  assert.doesNotMatch(panel, /Just now/);
  assert.doesNotMatch(panel, /Today/);
  assert.doesNotMatch(panel, /State checked/);

  assert.doesNotMatch(page, /localEventsById/);
  assert.doesNotMatch(page, /recordLocalEvent/);
  assert.doesNotMatch(page, /Backup review opened just now/);
  assert.doesNotMatch(page, /Review opened just now/);

  assert.match(panel, /item\.runtime\.composeProject/);
  assert.match(panel, /item\.runtime\.runtimePath/);
  assert.match(panel, /item\.runtime\.version/);
  assert.match(panel, /item\.runtime\.image/);
  assert.match(panel, /item\.runtime\.recentEvents/);
  assert.match(panel, /formatRuntimeTimestamp/);
  assert.match(page, /invalidateApplicationState\(queryClient\)/);
  assert.match(liveModel, /recentEvents: app\.recentEvents \?\? \[\]/);
  assert.match(liveModel, /runtime: appRuntimeDetails\(app, health, telemetry\)/);
});

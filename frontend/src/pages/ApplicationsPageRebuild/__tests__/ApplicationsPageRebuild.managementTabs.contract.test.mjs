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
  assert.match(settings, /Container posture/);
  assert.match(settings, /Tailscale posture/);
  assert.match(settings, /onAutoRepairChange\(item\.id, checked\)/);
  assert.match(settings, /onPrivateAccessChange\(item\.id, checked\)/);
  assert.match(links, /primaryUrl/);
  assert.match(links, /privateUrl/);
  assert.match(links, /backendTargetUrl/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings\(appId, nextSettings\)/);
  assert.match(page, /InstalledAppsAPIClient\.repairPrivateAccess\(appId\)/);
  assert.match(page, /InstalledAppsAPIClient\.disablePrivateAccess\(appId\)/);
  assert.match(liveModel, /links: appLinks\(app\)/);
  assert.match(liveModel, /settings: appSettings\(app\)/);
});

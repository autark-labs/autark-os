import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('disabled action component explains unavailable controls accessibly', () => {
  assert.equal(existsSync(resolve(root, 'src/components/autark-os/DisabledAction.tsx')), true);

  const disabledAction = source('src/components/autark-os/DisabledAction.tsx');

  assert.match(disabledAction, /Tooltip/);
  assert.match(disabledAction, /aria-label/);
  assert.match(disabledAction, /tabIndex=\{0\}/);
  assert.match(disabledAction, /cursor-not-allowed/);
});

test('active user-facing surfaces use shared disabled action reasons', () => {
  const surfaces = [
    'src/components/RefreshStatus.tsx',
    'src/components/autark-os/TailscaleControlPopover.tsx',
    'src/pages/AdminSecurityGate.tsx',
    'src/pages/ApplicationsPage/AdvancedApplicationsView.tsx',
    'src/pages/ApplicationsPage/ApplicationDetailsRail.tsx',
    'src/pages/ApplicationsPage/managementTabs/ObservedServiceCatalogMatchSection.tsx',
    'src/pages/ApplicationsPage/managementTabs/ObservedServiceManagementSection.tsx',
    'src/pages/BackupsPage/BackupsPage.components.tsx',
    'src/pages/BackupsPage/BackupsPage.tsx',
    'src/pages/MarketplacePage/MarketplacePage.tsx',
    'src/pages/MarketplacePage/MarketplaceAppDetail.tsx',
    'src/pages/MarketplacePage/MarketplaceAppList.tsx',
    'src/pages/MarketplacePage/MarketplaceInstallWizard.tsx',
    'src/pages/MonitoringPage/MonitoringPage.tsx',
    'src/pages/NetworkPage/ReachabilityMatrix.tsx',
    'src/pages/OnboardingPage/OnboardingWizard.tsx',
    'src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx',
    'src/pages/ResolveExistingAppsPage/ResolveExistingAppsPage.tsx',
    'src/pages/SettingsPage/SettingsPage.tsx',
    'src/pages/StoragePage/StoragePage.tsx',
    'src/pages/SupportPage/SupportPage.tsx',
  ];

  for (const relativePath of surfaces) {
    const fileSource = source(relativePath);
    assert.match(fileSource, /DisabledAction/, `${relativePath} should use DisabledAction for unavailable controls`);
  }
});

test('repo guidance rejects partial cross-surface behavior implementations', () => {
  const agentsGuidance = source('../AGENTS.md');

  assert.match(agentsGuidance, /No partial cross-surface product behavior/);
  assert.match(agentsGuidance, /update every active surface/);
  assert.match(agentsGuidance, /lean-slice exception/);
});

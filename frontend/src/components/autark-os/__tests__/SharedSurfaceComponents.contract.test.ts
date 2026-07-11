import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('shared surface components provide typed accessible primitives', () => {
  const components = [
    'PageLoadingState',
    'PageLoadError',
    'StatusBadge',
    'CopyField',
    'RecommendedActionCard',
    'FoundAppsPrompt',
    'ResponsiveDetailsSheet',
    'LocalizedDateTime',
    'JobProgress',
  ];

  for (const component of components) {
    assert.equal(existsSync(resolve(root, `src/components/autark-os/${component}.tsx`)), true, `${component} should be a project-level component`);
  }

  const loading = source('src/components/autark-os/PageLoadingState.tsx');
  const error = source('src/components/autark-os/PageLoadError.tsx');
  const status = source('src/components/autark-os/StatusBadge.tsx');
  const copy = source('src/components/autark-os/CopyField.tsx');
  const detail = source('src/components/autark-os/ResponsiveDetailsSheet.tsx');
  const dateTime = source('src/components/autark-os/LocalizedDateTime.tsx');
  const pageHeader = source('src/components/layout/PageHeader.tsx');
  const jobProgress = source('src/components/autark-os/JobProgress.tsx');

  assert.match(loading, /export type PageLoadingStateModel/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(error, /export type PageLoadErrorModel/);
  assert.match(error, /role="alert"/);
  assert.match(error, /autoFocus/);
  assert.match(status, /export type StatusBadgeTone/);
  assert.match(status, /<Badge/);
  assert.match(copy, /export type CopyFieldModel/);
  assert.match(copy, /CopyTextButton/);
  assert.match(copy, /sensitive/);
  assert.match(detail, /export type ResponsiveDetailsSheetModel/);
  assert.match(detail, /<Sheet/);
  assert.match(detail, /sm:max-w-xl lg:max-w-2xl/);
  assert.match(dateTime, /export type LocalizedDateTimeModel/);
  assert.match(dateTime, /<time/);
  assert.match(pageHeader, /<Surface as="header"/);
  assert.match(pageHeader, /<Separator/);
  assert.match(jobProgress, /<Progress/);
  assert.match(jobProgress, /terminalJob/);
});

test('active pages use shared surface components instead of local page state cards', () => {
  const loadingPages = [
    'src/pages/BackupsPage/BackupsPage.tsx',
    'src/pages/MarketplacePage/MarketplacePage.tsx',
    'src/pages/NetworkPage/NetworkPage.shared.tsx',
    'src/pages/OnboardingPage/OnboardingWizard.tsx',
    'src/pages/ResolveExistingAppsPage/ResolveExistingAppsPage.tsx',
    'src/pages/SettingsPage/SettingsPage.tsx',
    'src/pages/StoragePage/StoragePage.tsx',
    'src/pages/SupportPage/SupportPage.tsx',
  ];
  const errorPages = [...loadingPages, 'src/pages/MonitoringPage/MonitoringPage.tsx'];

  for (const page of loadingPages) {
    assert.match(source(page), /PageLoadingState/, `${page} should use PageLoadingState`);
  }
  for (const page of errorPages) {
    assert.match(source(page), /PageLoadError/, `${page} should use PageLoadError`);
  }

  assert.match(source('src/pages/MarketplacePage/MarketplaceAppDetail.tsx'), /ResponsiveDetailsSheet/);
  assert.match(source('src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx'), /ResponsiveDetailsSheet/);
  assert.match(source('src/pages/ApplicationsPage/managementTabs/ApplicationGuideTab.tsx'), /CopyField/);
  assert.match(source('src/pages/ApplicationsPage/managementTabs/ApplicationLinksTab.tsx'), /CopyField/);
  assert.match(source('src/pages/OverviewPage/OverviewPage.tsx'), /RecommendedActionCard/);
  assert.match(source('src/pages/ApplicationsPage/ApplicationsPage.tsx'), /FoundAppsPrompt/);
  assert.match(source('src/pages/OverviewPage/OverviewPage.tsx'), /FoundAppsPrompt/);
});

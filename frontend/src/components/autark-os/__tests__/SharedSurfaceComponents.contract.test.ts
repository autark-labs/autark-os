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
    'AppCardName',
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
  const appCardName = source('src/components/autark-os/AppCardName.tsx');
  const metadata = source('src/components/autark-os/MetadataBadge.tsx');
  const variants = source('src/components/primitives/SemanticVariants.ts');
  const buttons = source('src/components/primitives/ProjectButtons.tsx');
  const baseButton = source('src/components/ui/button.tsx');
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
  assert.match(status, /statusIcon/);
  assert.match(status, /data-icon="inline-start"/);
  assert.match(metadata, /export type MetadataBadgeTone/);
  assert.match(variants, /semanticStatusVariants/);
  assert.match(variants, /semanticSolidStatusVariants/);
  assert.match(variants, /bg-emerald-700 text-white/);
  assert.match(variants, /semanticSurfaceVariants/);
  assert.match(variants, /semanticDisabledClass/);
  assert.match(variants, /disabled:bg-app-disabled-surface/);
  assert.match(buttons, /semanticPrimaryActionClass/);
  assert.match(baseButton, /semanticDisabledClass/);
  assert.match(status, /StatusBadgeAppearance = 'soft' \| 'solid'/);
  assert.match(appCardName, /copyText\(name\)/);
  assert.match(appCardName, /TooltipContent/);
  assert.match(appCardName, /copied \? <Check/);
  assert.match(metadata, /MetadataBadgeAppearance = 'soft' \| 'solid'/);
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

test('active pages delegate status and metadata badges to the shared semantic primitives', () => {
  const pages = [
    'src/pages/ApplicationsPage/components/AppStateBadges.tsx',
    'src/pages/BackupsPage/BackupsPage.components.tsx',
    'src/pages/MarketplacePage/MarketplaceAppList.tsx',
    'src/pages/MonitoringPage/MonitoringActivitySections.tsx',
    'src/pages/NetworkPage/NetworkPage.tsx',
    'src/pages/SettingsPage/SettingsPage.tsx',
    'src/pages/StoragePage/StoragePage.tsx',
    'src/pages/SupportPage/SupportPage.tsx',
  ];

  for (const page of pages) {
    const content = source(page);
    assert.doesNotMatch(content, /from ['"]@\/components\/ui\/badge['"]/);
    assert.match(content, /(StatusBadge|MetadataBadge|semanticStatusVariants|AppCardName|DisabledAction)/, `${page} should use a shared semantic visual primitive`);
  }
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
  assert.match(source('src/components/autark-os/NotificationCenter.tsx'), /useRecommendedActionQuery/);
  assert.match(source('src/pages/ApplicationsPage/ApplicationsPage.tsx'), /FoundAppsPrompt/);
  assert.match(source('src/pages/OverviewPage/components/HomeDashboardPanels.tsx'), /InstalledAppsLauncher/);
});

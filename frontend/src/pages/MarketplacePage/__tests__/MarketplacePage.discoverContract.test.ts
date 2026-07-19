import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function source(fileName) {
  return readFileSync(resolve(here, '..', fileName), 'utf8');
}

function projectSource(relativePath) {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

test('marketplace detail and install wizard do not carry legacy install result props', () => {
  const detail = source('MarketplaceAppDetail.tsx');
  const wizard = source('MarketplaceInstallWizard.tsx');
  const settings = source('MarketplaceAppSettingsDialog.tsx');
  const marketplaceTypes = projectSource('types/marketplace.ts');

  assert.doesNotMatch(detail, /\bInstallResult\b|installResult/);
  assert.doesNotMatch(wizard, /\bInstallResult\b|installResult|InstallResultCard|PostInstallGuideCard/);
  assert.doesNotMatch(detail, /<MarketplaceSetupPanel|<InstallPlanPreview/);
  assert.match(wizard, /InstallConfigurationCallout/);
  assert.match(wizard, /appSpecificSetupInputs/);
  assert.match(settings, /input\.tier === 'app_specific'/);
  assert.match(settings, /Autark-OS manages the app name, access, storage, and backups safely/);
  assert.doesNotMatch(marketplaceTypes, /\bInstallResult\b|PostInstallGuide|ResolvedSetupField|ResolvedSetupIntegration/);
});

test('marketplace page reads discover data and jobs through the repository layer', () => {
  const page = source('MarketplacePage.tsx');
  const jobTracking = source('useDiscoverJobTracking.ts');
  const repository = projectSource('repositories/discoverRepository.ts');
  const jobRepository = projectSource('repositories/jobRepository.ts');

  assert.doesNotMatch(page, /ActivityAPIClient|BackupAPIClient|DiscoverAPIClient|JobsAPIClient|SystemAPIClient/);
  assert.doesNotMatch(page, /setInterval|clearInterval|loadApps|loadInstallPreview/);
  assert.match(page, /useDiscoverAppsQuery/);
  assert.match(page, /useDiscoverInstallMutation/);
  assert.match(page, /useDiscoverInstallPreviewQuery/);
  assert.match(page, /useDiscoverJobTracking/);
  assert.match(jobTracking, /useDiscoverJobQuery/);
  assert.match(jobTracking, /useDiscoverJobsQuery/);
  assert.match(page, /useMarketplaceActivityQuery/);

  assert.match(repository, /discoverQueryKeys/);
  assert.match(repository, /useDiscoverAppsQuery/);
  assert.match(repository, /useDiscoverReadinessQuery/);
  assert.match(repository, /useMarketplaceActivityQuery/);
  assert.match(repository, /useDiscoverInstallPreviewQuery/);
  assert.match(repository, /useDiscoverInstallMutation/);
  assert.match(repository, /useDiscoverBackupMutation/);
  assert.match(repository, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(repository, /useDiscoverJobQuery/);
  assert.match(repository, /useDiscoverJobsQuery/);
  assert.match(repository, /DiscoverAPIClient\.listApps/);
  assert.match(repository, /useAutarkOsJobsQuery/);
  assert.match(repository, /useAutarkOsJobQuery/);
  assert.doesNotMatch(repository, /JobsAPIClient/);
  assert.match(jobRepository, /JobsAPIClient\.list/);
  assert.match(jobRepository, /JobsAPIClient\.get/);
  assert.match(repository, /invalidateDiscoverQueries\(queryClient\)/);
});

test('marketplace detail deep-links found services and installed apps into My Apps', () => {
  const detail = source('MarketplaceAppDetail.tsx');

  assert.match(detail, /applicationDeepLinkForManagedApp/);
  assert.match(detail, /applicationDeepLinkForObservedService/);
  assert.match(detail, /applicationRouteWithManagementPanel/);
  assert.doesNotMatch(detail, /reviewHref=\{appView\.reviewExistingHref\}/);
  assert.doesNotMatch(detail, /<Link to="\/apps">View in My Apps<\/Link>/);
  assert.doesNotMatch(detail, /<Link to="\/apps">Manage in My Apps<\/Link>/);
});

test('marketplace first-backup prompt uses canonical installed backup protection', () => {
  const detail = source('MarketplaceAppDetail.tsx');
  const discoverTypes = projectSource('types/discover.ts');

  assert.match(discoverTypes, /protectedByBackups: boolean/);
  assert.match(discoverTypes, /firstBackupRecommended: boolean/);
  assert.match(detail, /firstBackupRecommended/);
  assert.match(detail, /protectedByBackups/);
  assert.doesNotMatch(detail, /function shouldOfferFirstBackup\([^)]*\) \{\s*return true;\s*\}/s);
});

test('marketplace hides dead link controls when an app lacks URLs or review targets', () => {
  const detail = source('MarketplaceAppDetail.tsx');
  const duplicateWarning = source('DuplicateInstallWarningDialog.tsx');

  assert.doesNotMatch(detail, /cannot open the existing service review yet|does not publish a source URL yet|does not publish documentation yet/);
  assert.doesNotMatch(duplicateWarning, /cannot open the existing service review yet|Review existing service[\s\S]*disabled/);
});

test('dense launcher cards keep canonical app states visible and long app names readable', () => {
  const list = source('MarketplaceAppList.tsx');

  assert.match(list, /line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-50/);
  assert.match(list, /launcherCardAttentionClass\(app\)/);
  assert.match(list, /app\.stateLabel/);
  assert.match(list, /aria-label=\{`Select \$\{app\.name\}`\}/);
  assert.match(list, /title=\{app\.name\}/);
});

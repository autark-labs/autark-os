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
  const marketplaceTypes = projectSource('types/marketplace.ts');

  assert.doesNotMatch(detail, /\bInstallResult\b|installResult/);
  assert.doesNotMatch(wizard, /\bInstallResult\b|installResult|InstallResultCard|PostInstallGuideCard/);
  assert.doesNotMatch(detail, /<MarketplaceSetupPanel|<InstallPlanPreview/);
  assert.match(wizard, /Installation choices/);
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

test('catalog cards keep long app names readable instead of clipping them to one line', () => {
  const list = source('MarketplaceAppList.tsx');

  assert.match(list, /line-clamp-2 min-w-0 break-words text-base text-slate-50/);
  assert.match(list, /line-clamp-2 min-h-10 break-words text-base font-bold text-slate-50/);
  assert.match(list, /title=\{app\.name\}/);
});

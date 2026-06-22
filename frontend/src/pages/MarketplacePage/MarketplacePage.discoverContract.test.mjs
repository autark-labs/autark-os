import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function source(fileName) {
  return readFileSync(resolve(here, fileName), 'utf8');
}

function projectSource(relativePath) {
  return readFileSync(resolve(here, '../../', relativePath), 'utf8');
}

test('marketplace detail and install wizard do not carry legacy install result props', () => {
  const detail = source('MarketplaceAppDetail.tsx');
  const wizard = source('MarketplaceInstallWizard.tsx');
  const marketplaceTypes = projectSource('types/marketplace.ts');

  assert.doesNotMatch(detail, /\bInstallResult\b|installResult/);
  assert.doesNotMatch(wizard, /\bInstallResult\b|installResult|InstallResultCard|PostInstallGuideCard/);
  assert.doesNotMatch(marketplaceTypes, /\bInstallResult\b|PostInstallGuide|ResolvedSetupField|ResolvedSetupIntegration/);
});

test('marketplace page reads discover data and jobs through the repository layer', () => {
  const page = source('MarketplacePage.tsx');
  const repository = projectSource('repositories/discoverRepository.ts');

  assert.doesNotMatch(page, /ActivityAPIClient|BackupAPIClient|DiscoverAPIClient|JobsAPIClient|SystemAPIClient/);
  assert.doesNotMatch(page, /setInterval|clearInterval|loadApps|loadInstallPreview/);
  assert.match(page, /useDiscoverAppsQuery/);
  assert.match(page, /useDiscoverInstallMutation/);
  assert.match(page, /useDiscoverInstallPreviewQuery/);
  assert.match(page, /useDiscoverJobQuery/);
  assert.match(page, /useDiscoverJobsQuery/);
  assert.match(page, /useMarketplaceActivityQuery/);

  assert.match(repository, /discoverQueryKeys/);
  assert.match(repository, /useDiscoverAppsQuery/);
  assert.match(repository, /useDiscoverReadinessQuery/);
  assert.match(repository, /useMarketplaceActivityQuery/);
  assert.match(repository, /useDiscoverInstallPreviewQuery/);
  assert.match(repository, /useDiscoverInstallMutation/);
  assert.match(repository, /useDiscoverBackupMutation/);
  assert.match(repository, /useDiscoverJobQuery/);
  assert.match(repository, /useDiscoverJobsQuery/);
  assert.match(repository, /DiscoverAPIClient\.listApps/);
  assert.match(repository, /JobsAPIClient\.list/);
  assert.match(repository, /JobsAPIClient\.get/);
  assert.match(repository, /invalidateApplicationState/);
});

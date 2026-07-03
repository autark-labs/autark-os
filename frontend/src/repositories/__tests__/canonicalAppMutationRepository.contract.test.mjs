import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('app mutation results are synchronized through one canonical app-state helper', () => {
  const helperPath = 'src/repositories/canonicalAppMutationRepository.ts';
  assert.equal(existsSync(resolve(root, helperPath)), true);

  const helper = source(helperPath);
  assert.match(helper, /syncCanonicalAppMutationResult/);
  assert.match(helper, /setApplicationStateFromActionResultCache\(queryClient, result\)/);
  assert.match(helper, /setProjectOsJobCache\(queryClient, result\)/);
  assert.match(helper, /setProjectOsJobInApplicationStateCache\(queryClient, result\)/);
  assert.match(helper, /setRuntimeAppInApplicationStateCache\(queryClient, result\.app\)/);
  assert.match(helper, /invalidateProjectOsJobs\(queryClient\)/);
  assert.match(helper, /invalidateApplicationState\(queryClient\)/);
});

test('app-affecting repositories use canonical app-state synchronization after mutations', () => {
  const backupRepository = source('src/repositories/backupRepository.ts');
  const discoverRepository = source('src/repositories/discoverRepository.ts');
  const networkPage = source('src/pages/NetworkPage/NetworkPage.tsx');

  assert.match(backupRepository, /syncCanonicalAppMutationResult/);
  assert.match(backupRepository, /useRunAppBackupMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(backupRepository, /useRunFullBackupMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(backupRepository, /useRunRoutineBackupMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(backupRepository, /useRestoreBackupMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(backupRepository, /useVerifyRestorePointMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);

  assert.match(discoverRepository, /syncCanonicalAppMutationResult/);
  assert.match(discoverRepository, /useDiscoverInstallMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(discoverRepository, /useDiscoverBackupMutation[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);

  assert.match(networkPage, /syncCanonicalAppMutationResult/);
  assert.match(networkPage, /syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.doesNotMatch(networkPage, /setRuntimeAppInApplicationStateCache\(queryClient, result\.app\)/);
});

test('applications page uses canonical synchronization for lifecycle, repair, backup, uninstall, access, and observed-service actions', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /syncCanonicalAppMutationResult/);
  assert.match(page, /InstalledAppsAPIClient\.runAction\(appId, action\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, data\)/);
  assert.match(page, /InstalledAppsAPIClient\.repair\(appId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /BackupAPIClient\.run\(appId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /InstalledAppsAPIClient\.uninstall\(appId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /InstalledAppsAPIClient\.enablePrivateAccess\(appId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /ObservedServicesAPIClient\.pin\(serviceId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /ObservedServicesAPIClient\.unpin\(serviceId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /ObservedServicesAPIClient\.match\(serviceId, catalogAppId\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /ObservedServicesAPIClient\.adopt\(serviceId, confirmation\)[\s\S]*syncCanonicalAppMutationResult\(queryClient, result\)/);

  assert.doesNotMatch(page, /setObservedServicePinnedInApplicationStateCache\(queryClient/);
  assert.doesNotMatch(page, /setRuntimeAppInApplicationStateCache\(queryClient, result\.app\)/);
});

test('existing-app resolution surfaces use canonical synchronization for observed-service actions', () => {
  const page = source('src/pages/ResolveExistingAppsPage/ResolveExistingAppsPage.tsx');
  const sheet = source('src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx');

  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /ObservedServicesAPIClient\.pin\(service\.id\)/);
  assert.match(page, /onActionComplete=\{handleObservedServiceResult\}/);
  assert.doesNotMatch(page, /setObservedServicePinnedInApplicationStateCache/);
  assert.doesNotMatch(page, /setApplicationStateFromActionResultCache/);

  assert.match(sheet, /onActionComplete\(result\)/);
  assert.doesNotMatch(sheet, /setObservedServicePinnedInApplicationStateCache/);
  assert.doesNotMatch(sheet, /setApplicationStateFromActionResultCache/);
});

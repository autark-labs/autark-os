import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications rebuild starts lifecycle jobs and re-pulls canonical app state', () => {
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const operations = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.operations.js');
  const advanced = source('src/pages/ApplicationsPageRebuild/AdvancedApplicationsView.tsx');
  const rail = source('src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx');

  assert.match(page, /InstalledAppsAPIClient\.runAction\(appId, action\)/);
  assert.match(page, /setProjectOsJobCache\(queryClient, data\)/);
  assert.match(page, /setProjectOsJobInApplicationStateCache\(queryClient, data\)/);
  assert.match(page, /invalidateApplicationState\(queryClient\)/);
  assert.match(page, /actionLoadingByAppId/);
  assert.match(page, /useProjectOsJobsQuery\(\)/);
  assert.match(page, /operationStateForItem\(/);
  assert.match(page, /settingsLoadingByAppId\[itemId\]/);
  assert.match(page, /showActionNotification\(\{[\s\S]*App action started/);
  assert.match(page, /showActionErrorNotification\(err, 'App action failed'\)/);
  assert.doesNotMatch(page, /setRuntimeAppStatusInApplicationStateCache/);
  assert.doesNotMatch(page, /setRuntimeAppInApplicationStateCache\(queryClient, data\.app\)/);
  assert.doesNotMatch(page, /Start requested just now|Pause requested just now|Restart requested just now/);
  assert.match(operations, /start_app/);
  assert.match(operations, /stop_app/);
  assert.match(operations, /restart_app/);
  assert.match(operations, /kind: 'uninstalling'/);
  assert.match(operations, /kind: 'backing_up'/);
  assert.match(operations, /kind: 'saving_settings'/);
  assert.match(operations, /kind: 'failed'/);
  assert.match(advanced, /actionLoadingByItemId/);
  assert.match(advanced, /item\.operationState\.kind !== 'idle'/);
  assert.match(rail, /actionLoadingByItemId/);
  assert.match(rail, /item\.operationState\.kind !== 'idle'/);
});

test('applications rebuild pins and unpins observed services through canonical application state', () => {
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const types = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onPinObservedService: \(serviceId: string\) => Promise<void>/);
  assert.match(types, /onUnpinObservedService: \(serviceId: string\) => Promise<void>/);

  assert.match(page, /ObservedServicesAPIClient/);
  assert.match(page, /ObservedServicesAPIClient\.pin\(serviceId\)/);
  assert.match(page, /ObservedServicesAPIClient\.unpin\(serviceId\)/);
  assert.match(page, /setApplicationStateFromActionResultCache\(queryClient, result\)/);
  assert.match(page, /showActionNotification\(result/);
  assert.match(page, /showActionErrorNotification\(err, 'Service could not be pinned'\)/);
  assert.match(page, /showActionErrorNotification\(err, 'Service could not be unpinned'\)/);
  assert.doesNotMatch(page, /setObservedServicePinnedInApplicationStateCache\(queryClient, serviceId/);
  assert.doesNotMatch(page, /queryClient\.setQueryData\(applicationStateQueryKey, previousState\)/);
  assert.match(page, /invalidateApplicationState\(queryClient\)/);

  assert.match(panel, /ObservedServiceManagementSection/);
  assert.match(panel, /actions\.onPinObservedService\(serviceId\)/);
  assert.match(panel, /actions\.onUnpinObservedService\(serviceId\)/);
  assert.match(panel, /item\.managementState === 'found'/);
  assert.match(panel, /item\.managementState === 'linked'/);
  assert.match(panel, /Pin to My Apps/);
  assert.match(panel, /Unpin/);
  assert.doesNotMatch(panel, />\s*Match\s*</);
  assert.doesNotMatch(panel, />\s*Adopt\s*</);
});

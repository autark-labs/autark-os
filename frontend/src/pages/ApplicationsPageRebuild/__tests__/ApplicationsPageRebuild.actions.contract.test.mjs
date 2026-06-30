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
  assert.match(advanced, /runtimeControlsDisabled\(item\.operationState, loadingAction\)/);
  assert.match(rail, /actionLoadingByItemId/);
  assert.match(rail, /runtimeControlsDisabled\(item\.operationState, loadingAction\)/);
});

test('applications rebuild pins and unpins observed services through canonical application state', () => {
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPageRebuild/managementTabs/ObservedServiceManagementSection.tsx');
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
  assert.match(observedSection, /actions\.onPinObservedService\(serviceId\)/);
  assert.match(observedSection, /actions\.onUnpinObservedService\(serviceId\)/);
  assert.match(observedSection, /item\.managementState === 'found'/);
  assert.match(observedSection, /item\.managementState === 'linked'/);
  assert.match(observedSection, /Pin to My Apps/);
  assert.match(observedSection, /Unpin/);
  assert.doesNotMatch(panel, />\s*Match\s*</);
  assert.doesNotMatch(panel, />\s*Adopt\s*</);
});

test('applications rebuild manages observed-service matching and adoption inside the pullout', () => {
  const page = source('src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPageRebuild/managementTabs/ObservedServiceManagementSection.tsx');
  const types = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onMatchObservedService: \(serviceId: string, catalogAppId: string \| null\) => Promise<void>/);
  assert.match(types, /onLoadObservedServiceAdoptionPlan: \(serviceId: string\) => Promise<ObservedServiceAdoptionPlan>/);
  assert.match(types, /onAdoptObservedService: \(serviceId: string, confirmation: string\) => Promise<void>/);

  assert.match(page, /ObservedServicesAPIClient\.match\(serviceId, catalogAppId\)/);
  assert.match(page, /ObservedServicesAPIClient\.adoptionPlan\(serviceId\)/);
  assert.match(page, /ObservedServicesAPIClient\.adopt\(serviceId, confirmation\)/);
  assert.match(page, /showActionErrorNotification\(err, 'Service match could not be saved'\)/);
  assert.match(page, /showActionErrorNotification\(err, 'Service could not be adopted'\)/);

  assert.match(panel, /ObservedServiceManagementSection/);
  assert.match(observedSection, /Recovery plan/);
  assert.match(observedSection, /Review recovery plan/);
  assert.match(observedSection, /Adopt service/);
  assert.match(observedSection, /Install copy/);
  assert.match(observedSection, /adoption_plan/);
  assert.match(observedSection, /planList\(/);
});

test('applications rebuild keeps catalog matching in the advanced pullout tab', () => {
  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPageRebuild/managementTabs/ObservedServiceManagementSection.tsx');
  const catalogSection = source('src/pages/ApplicationsPageRebuild/managementTabs/ObservedServiceCatalogMatchSection.tsx');

  assert.match(panel, /ObservedServiceCatalogMatchSection/);
  assert.match(panel, /<TabsContent className="grid gap-4" value="advanced">[\s\S]*<ObservedServiceCatalogMatchSection/);
  assert.doesNotMatch(observedSection, /Catalog match/);
  assert.doesNotMatch(observedSection, /Clear match/);
  assert.doesNotMatch(observedSection, /change_match/);
  assert.match(catalogSection, /Catalog match/);
  assert.match(catalogSection, /Clear match/);
  assert.match(catalogSection, /change_match/);
});

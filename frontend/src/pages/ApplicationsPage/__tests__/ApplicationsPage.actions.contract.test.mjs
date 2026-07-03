import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page starts lifecycle jobs and re-pulls canonical app state', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const operations = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.operations.js');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');

  assert.match(page, /InstalledAppsAPIClient\.runAction\(appId, action\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, data\)/);
  assert.match(page, /actionLoadingByAppId/);
  assert.match(page, /useAutarkOsJobsQuery\(\)/);
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

test('applications page pins and unpins observed services through canonical application state', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPage/managementTabs/ObservedServiceManagementSection.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onPinObservedService: \(serviceId: string\) => Promise<void>/);
  assert.match(types, /onUnpinObservedService: \(serviceId: string\) => Promise<void>/);

  assert.match(page, /ObservedServicesAPIClient/);
  assert.match(page, /ObservedServicesAPIClient\.pin\(serviceId\)/);
  assert.match(page, /ObservedServicesAPIClient\.unpin\(serviceId\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.doesNotMatch(page, /setObservedServicePinnedInApplicationStateCache\(queryClient/);
  assert.doesNotMatch(page, /appState\.refresh\(\)/);
  assert.match(page, /showActionNotification\(result/);
  assert.match(page, /showActionErrorNotification\(err, 'Service could not be pinned'\)/);
  assert.match(page, /showActionErrorNotification\(err, 'Service could not be unpinned'\)/);
  assert.doesNotMatch(page, /queryClient\.setQueryData\(applicationStateQueryKey, previousState\)/);

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

test('applications page manages observed-service matching and adoption inside the pullout', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPage/managementTabs/ObservedServiceManagementSection.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

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

test('applications page keeps catalog matching in the advanced pullout tab', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const observedSection = source('src/pages/ApplicationsPage/managementTabs/ObservedServiceManagementSection.tsx');
  const catalogSection = source('src/pages/ApplicationsPage/managementTabs/ObservedServiceCatalogMatchSection.tsx');

  assert.match(panel, /ObservedServiceCatalogMatchSection/);
  assert.match(panel, /<TabsContent[^>]+value="advanced"[\s\S]*<ObservedServiceCatalogMatchSection/);
  assert.doesNotMatch(observedSection, /Catalog match/);
  assert.doesNotMatch(observedSection, /Clear match/);
  assert.doesNotMatch(observedSection, /change_match/);
  assert.match(catalogSection, /Catalog match/);
  assert.match(catalogSection, /Clear match/);
  assert.match(catalogSection, /change_match/);
});

test('applications page exposes a red recovery tab for failed app operations', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');

  assert.match(panel, /const recoveryNeeded = item\.operationState\.kind === 'failed'/);
  assert.match(panel, /ApplicationRecoveryTab/);
  assert.match(panel, /value="recovery"/);
  assert.doesNotMatch(panel, /ExpandedOperationStatus/);

  assert.match(recovery, /Start again/);
  assert.match(recovery, /Edit settings/);
  assert.match(recovery, /Stop app/);
  assert.match(recovery, /Review recent activity/);
  assert.match(recovery, /item\.operationState\.message/);
  assert.match(recovery, /item\.runtime\.recentEvents/);

  assert.match(rail, /Open recovery/);
  assert.match(rail, /onManagementOpenChange\(true\)/);
  assert.match(settings, /operationBlocksManagement\(item\.operationState\)/);
});

test('applications page runs repair only from canonical available actions', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  const api = source('src/api/InstalledAppsAPIClient.ts');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onRepair: \(id: string\) => void/);
  assert.ok(api.includes('post<AutarkOsJob>(`/api/apps/${appId}/repair`)'));
  assert.match(page, /InstalledAppsAPIClient\.repair\(appId\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /title: 'Repair started'/);

  assert.match(rail, /const repairAction = item\.availableActions\.find\(\(action\) => action\.id === 'repair'\)/);
  assert.match(rail, /repairAction &&/);
  assert.match(rail, /actions\.onRepair\(item\.id\)/);
  assert.doesNotMatch(rail, /item\.attentionState !== 'none' \|\| item\.nextAction/);

  assert.match(recovery, /const repairAction = item\.availableActions\.find\(\(action\) => action\.id === 'repair'\)/);
  assert.match(recovery, /Run repair/);
  assert.match(recovery, /actions\.onRepair\(item\.id\)/);
});

test('applications page starts app backup jobs from real backup actions', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onCreateBackup: \(id: string\) => void/);
  assert.match(types, /'backup'/);
  assert.match(page, /BackupAPIClient/);
  assert.match(page, /BackupAPIClient\.run\(appId\)/);
  assert.match(page, /setAppActionLoading\(appId, 'backup'\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /invalidateBackupQueries\(queryClient\)/);
  assert.match(page, /title: 'Backup started'/);
  assert.doesNotMatch(page, /const handleCreateBackup = \(id: string\) => \{[\s\S]*setManagementOpen\(true\);[\s\S]*invalidateApplicationState\(queryClient\);[\s\S]*\};/);

  assert.match(rail, /actions\.onCreateBackup\(item\.id\)/);
  assert.match(advanced, /actions\.onCreateBackup\(item\.id\)/);
});

test('applications page only exposes concrete next actions from the rail', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');

  assert.match(page, /item\.nextAction\?\.id === 'start_app'/);
  assert.match(page, /item\.nextAction\?\.id === 'create_backup'/);
  assert.match(page, /void runBackup\(item\.sourceId \|\| item\.id\)/);
  assert.match(page, /setManagementOpen\(true\)/);

  assert.match(rail, /nextActionButtonLabel\(item\.nextAction\.id\)/);
  assert.match(rail, /Create backup/);
  assert.match(rail, /Review/);
  assert.doesNotMatch(rail, />\s*Run\s*</);
});

test('applications page review-next opens the review panel and has an all-clear state', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /const reviewableItems = items\.filter\(isReviewableItem\)/);
  assert.match(page, /const visibleReviewableItems = visibleItems\.filter\(isReviewableItem\)/);
  assert.match(page, /nextAction\.id === 'review_issue' \|\| nextAction\.id === 'review_found_service'/);
  assert.doesNotMatch(page, /const nextReviewItem = visibleItems\.find\(\(item\) => item\.nextAction\)/);
  assert.match(page, /reviewNextButtonLabel/);
  assert.match(page, /nextReviewItem \? 'Review next' : 'All clear'/);
  assert.match(page, /title=\{nextReviewItem \? 'Open the next app or service that needs review\.' : 'No apps or services need review\.'\}/);
  assert.match(page, /focusApplicationItem\(nextReviewItem, true\)/);
  assert.match(page, /setFilter\('needs_review'\)/);
});

test('applications page removes placeholder overflow controls until real actions are chosen', () => {
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.doesNotMatch(basic, /DropdownMenu/);
  assert.doesNotMatch(basic, /Trash2/);
  assert.doesNotMatch(basic, />\s*Uninstall\s*</);
  assert.doesNotMatch(basic, /onUninstall/);
  assert.doesNotMatch(advanced, /MoreHorizontal/);
  assert.doesNotMatch(advanced, /More controls for/);
  assert.doesNotMatch(page, /handleUninstall/);
  assert.doesNotMatch(page, /onUninstall=\{handleUninstall\}/);
});

test('applications page changes private network access as a standalone settings action', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /ApplicationSettingsAction = 'planning' \| 'saving' \| 'private_access'/);
  assert.match(types, /onSetPrivateNetworkAccess: \(id: string, enabled: boolean\) => Promise<void>/);

  assert.match(page, /runPrivateNetworkAccessChange\(appId: string, enabled: boolean\)/);
  assert.match(page, /setSettingsLoading\(appId, 'private_access'\)/);
  assert.match(page, /InstalledAppsAPIClient\.enablePrivateAccess\(appId\)/);
  assert.match(page, /InstalledAppsAPIClient\.disablePrivateAccess\(appId\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(page, /invalidateNetworkQueries\(queryClient\)/);
  assert.doesNotMatch(page, /repairPrivateAccess\(appId\)/);

  assert.match(panel, /onSetPrivateNetworkAccess/);
  assert.match(settings, /loadingAction === 'private_access'/);
  assert.match(settings, /actions\.onSetPrivateNetworkAccess\(item\.id, checked\)/);
  assert.match(settings, /Private network/);
  assert.doesNotMatch(settings, /name: 'autoRepairEnabled' \| 'backupEnabled' \| 'tailscaleEnabled'/);
});

test('applications page surfaces backup-aware safety warnings around risky flows', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');
  const observed = source('src/pages/ApplicationsPage/managementTabs/ObservedServiceManagementSection.tsx');

  assert.match(panel, /backupSafetyMessage\(item\)/);
  assert.match(panel, /No verified backup/);
  assert.match(recovery, /backupSafetyMessage\(item\)/);
  assert.match(recovery, /Repair preserves data/);
  assert.match(settings, /item\.backup !== 'Protected'/);
  assert.match(settings, /No verified restore point/);
  assert.match(observed, /Backup protection starts after recovery/);
});

test('applications page finish pass removes placeholders and explains disabled runtime controls', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');

  for (const file of [page, rail, advanced, basic]) {
    assert.doesNotMatch(file, /Lorem ipsum|Lorem ipsum dolor sit amet/);
  }

  assert.match(rail, /DisabledAction/);
  assert.match(advanced, /DisabledAction/);
  assert.match(rail, /runtimeControlDisabledReason\(item, loadingAction\)/);
  assert.match(advanced, /runtimeControlDisabledReason\(item, loadingAction\)/);
  assert.match(rail, /reason=\{runtimeDisabledReason\}/);
  assert.match(advanced, /reason=\{runtimeDisabledReason\}/);
});

test('applications page has filter-specific empty states and compact recent activity', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');

  assert.match(page, /emptyStateForFilter\(filter, query\)/);
  assert.match(page, /emptyState=\{emptyState\}/);
  assert.match(page, /No managed apps installed/);
  assert.match(page, /No unmanaged services found/);
  assert.match(page, /No apps need review/);
  assert.match(basic, /emptyState: ApplicationEmptyState/);
  assert.match(advanced, /emptyState: ApplicationEmptyState/);

  assert.match(rail, /RecentActivitySummary/);
  assert.match(rail, /Last action/);
  assert.match(rail, /item\.lastEvent/);
});

test('applications page advanced tab can copy compact support details', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');

  assert.match(panel, /Support details/);
  assert.match(panel, /copySupportDetails\(item\)/);
  assert.match(panel, /navigator\.clipboard\?\.writeText\(supportDetailsText\(item\)\)/);
  assert.match(panel, /App ID:/);
  assert.match(panel, /Compose project:/);
  assert.match(panel, /Runtime path:/);
  assert.match(panel, /Last event:/);
});

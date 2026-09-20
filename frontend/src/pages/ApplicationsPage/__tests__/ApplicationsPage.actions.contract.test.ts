import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page starts lifecycle jobs and re-pulls canonical app state', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const operations = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.operations.ts');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');

  assert.match(page, /InstalledAppsAPIClient\.runAction\(appId, action\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, data\)/);
  assert.match(page, /actionLoadingByAppId/);
  assert.match(page, /useAutarkOsJobsQuery\(\)/);
  assert.doesNotMatch(page, /operationStateForItem|operationForItem/);
  assert.match(page, /showActionNotification\(data\)/);
  assert.match(page, /showActionErrorNotification\(err, 'App action failed'\)/);
  assert.doesNotMatch(page, /setRuntimeAppStatusInApplicationStateCache/);
  assert.doesNotMatch(page, /setRuntimeAppInApplicationStateCache\(queryClient, data\.app\)/);
  assert.doesNotMatch(page, /Start requested just now|Pause requested just now|Restart requested just now/);
  assert.match(operations, /item\.operation/);
  assert.doesNotMatch(operations, /AutarkOsJob|operationFromJob/);
  assert.match(advanced, /actionLoadingByItemId/);
  assert.match(advanced, /runtimeActionDisabled\(item, action, loadingAction\)/);
  assert.match(panel, /loadingAction/);
  assert.match(panel, /runtimeActionDisabled\(item, id, loadingAction\)/);
});

test('My Apps exposes only managed applications and no linked-service controls', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const liveModel = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.liveModel.ts');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.doesNotMatch(page, /ObservedServicesAPIClient|Pin to My Apps|Unpin|Change app match/);
  assert.doesNotMatch(liveModel, /observedServices|observedServiceSurfaceItem|pinned_external|managementState.*linked/);
  assert.doesNotMatch(panel, /ObservedServiceManagementSection|ObservedServiceCatalogMatchSection/);
  assert.doesNotMatch(types, /onPinObservedService|onUnpinObservedService|onMatchObservedService/);
});

test('failed operations offer contextual recovery without another tab', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  assert.match(panel, /ApplicationRecoveryTab/);
  assert.doesNotMatch(panel, /value="recovery"/);
  assert.match(recovery, /recoveryForOperation/);
  assert.match(recovery, /item\.operation\.message/);
});

test('applications page runs repair only from canonical available actions', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  const api = source('src/api/InstalledAppsAPIClient.ts');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onRepair: \(id: string\) => void/);
  assert.ok(api.includes('post<AutarkOsJob>(`/api/apps/${appId}/repair`)'));
  assert.match(page, /InstalledAppsAPIClient\.repair\(appId\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /showActionNotification\(job\)/);

  assert.match(panel, /item.availableActions.some/);
  assert.match(panel, /actions.onRepair/);
  assert.doesNotMatch(panel, /item\.attentionState !== 'none' \|\| item\.nextAction/);

  assert.doesNotMatch(recovery, /onRepair/);
});

test('applications page starts app backup jobs from real backup actions', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onCreateBackup: \(id: string\) => void/);
  assert.match(types, /'backup'/);
  assert.match(page, /BackupAPIClient/);
  assert.match(page, /BackupAPIClient\.run\(appId\)/);
  assert.match(page, /setAppActionLoading\(appId, 'backup'\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /invalidateBackupQueries\(queryClient\)/);
  assert.match(page, /showActionNotification\(job\)/);
  assert.doesNotMatch(page, /const handleCreateBackup = \(id: string\) => \{[\s\S]*setManagementOpen\(true\);[\s\S]*invalidateApplicationState\(queryClient\);[\s\S]*\};/);

  assert.match(panel, /actions\.onCreateBackup/);
  assert.match(advanced, /actions\.onCreateBackup\(item\.id\)/);
});

test('overview mutation shortcuts use the same canonical availability as the menu', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  assert.match(panel, /runtimeActionDisabled\(item, nextRuntimeAction, loadingAction\)/);
  assert.match(panel, /runtimeActionDisabledReason\(item, nextRuntimeAction, loadingAction\)/);
  assert.match(panel, /actions\.onStart\(item\.id\)/);
  assert.match(panel, /actions\.onCreateBackup\(item\.id\)/);
});

test('applications page opens canonical app review without a second observed-service route', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /reviewApplications = useMemo\([\s\S]*application\.relationship === 'recovery_required'/);
  assert.match(page, /reviewedApplication = appState\.applications\.find[\s\S]*application\.relationship === 'blocked'/);
  assert.match(page, /<ApplicationReviewDialog/);
  assert.doesNotMatch(page, /focus=service|deepLinkTarget\.kind === 'service'/);
  assert.doesNotMatch(page, /reviewNextButtonLabel|setFilter\('needs_review'\)/);
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

  assert.match(panel, /<ApplicationSettingsTab actions=\{actions\}/);
  assert.match(settings, /loadingAction === 'private_access'/);
  assert.match(settings, /actions\.onSetPrivateNetworkAccess\(item\.id, checked\)/);
  assert.match(settings, /Private network/);
  assert.doesNotMatch(settings, /name: 'autoRepairEnabled' \| 'backupEnabled' \| 'tailscaleEnabled'/);
});

test('applications page surfaces backup-aware safety warnings around risky flows', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const recovery = source('src/pages/ApplicationsPage/managementTabs/ApplicationRecoveryTab.tsx');
  const settings = source('src/pages/ApplicationsPage/managementTabs/ApplicationSettingsTab.tsx');

  assert.match(panel, /No verified backup/);
  assert.match(recovery, /Repair preserves data/);
  assert.match(settings, /item\.backup !== 'Protected'/);
  assert.match(settings, /No verified restore point/);
});

test('applications page finish pass removes placeholders and explains disabled runtime controls', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');

  for (const file of [page, panel, advanced, basic]) {
    assert.doesNotMatch(file, /Lorem ipsum|Lorem ipsum dolor sit amet/);
  }

  assert.match(panel, /DisabledAction/);
  assert.match(advanced, /DisabledAction/);
  assert.match(panel, /runtimeActionDisabledReason\(item, id, loadingAction\)/);
  assert.match(advanced, /runtimeActionDisabledReason\(item, action, loadingAction\)/);
  assert.match(advanced, /reason=\{disabledReason\(/);
});

test('applications page has managed-app empty states and compact recent activity', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const presentation = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.presentation.ts');

  assert.match(page, /emptyStateForApplicationCollection\(collectionFilters, query\)/);
  assert.match(page, /emptyState=\{emptyState\}/);
  assert.match(presentation, /No managed apps/);
  assert.match(presentation, /No matching apps/);
  assert.match(basic, /emptyState: ApplicationEmptyState/);
  assert.match(advanced, /emptyState: ApplicationEmptyState/);

  assert.match(panel, /Latest activity/);
  assert.match(panel, /item\.lastEvent/);
});

test('applications page diagnostics can copy compact support details', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');

  assert.match(panel, /Support details/);
  assert.match(panel, /copySupportDetails\(item\)/);
  assert.match(panel, /copyText\(supportDetailsText\(item\)\)/);
  assert.match(panel, /Support details copied/);
  assert.match(panel, /App ID:/);
  assert.match(panel, /Compose project:/);
  assert.match(panel, /Runtime path:/);
  assert.match(panel, /Last event:/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page destructive actions use a shared plan-confirm-run dialog', () => {
  const dialog = source('src/pages/ApplicationsPage/components/DestructiveActionDialog.tsx');
  const destructiveActions = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.destructiveActions.ts');
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const client = source('src/api/InstalledAppsAPIClient.ts');

  assert.match(destructiveActions, /export type DestructiveActionPlan/);
  assert.match(destructiveActions, /severity: 'warning' \| 'danger'/);
  assert.match(destructiveActions, /requiresTextConfirmation\?: string/);
  assert.match(destructiveActions, /blockedReasons: string\[\]/);
  assert.match(destructiveActions, /mapUninstallPlanToDestructiveActionPlan/);
  assert.doesNotMatch(destructiveActions, /requiresConfirmation/);
  assert.match(destructiveActions, /needsConfirmation/);

  assert.match(dialog, /export function DestructiveActionDialog/);
  assert.match(dialog, /Dialog/);
  assert.match(dialog, /loadPlan/);
  assert.match(dialog, /runAction/);
  assert.match(dialog, /disabledReason/);
  assert.match(dialog, /requiresTextConfirmation/);
  assert.match(dialog, /blockedReasons/);
  assert.match(dialog, /warnings/);
  assert.match(dialog, /preservesDataByDefault/);
  assert.match(dialog, /confirmationText/);
  assert.match(dialog, /setActionError/);
  assert.match(dialog, /canRun/);
  assert.match(dialog, /<DialogClose asChild>/);

  assert.match(panel, /DestructiveActionDialog/);
  assert.match(panel, /disabledReason/);
  assert.doesNotMatch(panel, /<AlertDialog/);
  assert.doesNotMatch(dialog, /AlertDialog/);
  assert.doesNotMatch(panel, /This wireframe keeps data by default/);
  assert.doesNotMatch(panel, /Keep data and uninstall/);

  assert.match(client, /uninstallPlan\(appId: string\)/);
  assert.match(client, /uninstall\(appId: string\)/);
});

test('applications page uninstall uses real plan and job-backed action wiring', () => {
  const panel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');

  assert.match(types, /onLoadUninstallPlan: \(id: string\) => Promise<DestructiveActionPlan>/);
  assert.match(types, /onRunUninstall: \(id: string\) => Promise<void>/);

  assert.match(page, /mapUninstallPlanToDestructiveActionPlan/);
  assert.match(page, /loadUninstallPlan\(appId: string\)/);
  assert.match(page, /InstalledAppsAPIClient\.uninstallPlan\(appId\)/);
  assert.match(page, /runUninstall\(appId: string\)/);
  assert.match(page, /InstalledAppsAPIClient\.uninstall\(appId\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, job\)/);
  assert.match(page, /setTrackedAppJobIds/);
  assert.match(page, /showActionNotification\(\{\s*ok: true,\s*severity: 'info',\s*title: 'Uninstall started'/);
  assert.doesNotMatch(page, /Uninstall review opened just now/);

  assert.match(panel, /loadPlan=\{\(\) => actions\.onLoadUninstallPlan\(item\.id\)\}/);
  assert.match(panel, /runAction=\{\(\) => actions\.onRunUninstall\(item\.id\)\}/);
  assert.match(panel, /disabledReason=\{uninstallDisabledReason\}/);
  assert.match(panel, /operationBlocksManagement\(item\.operationState\)/);
  assert.doesNotMatch(panel, /A safety plan is required before uninstall can run/);
});

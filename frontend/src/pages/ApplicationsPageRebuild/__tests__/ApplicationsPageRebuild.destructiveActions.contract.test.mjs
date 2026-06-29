import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications rebuild destructive actions use a shared plan-confirm-run dialog', () => {
  const dialog = source('src/pages/ApplicationsPageRebuild/components/DestructiveActionDialog.tsx');
  const destructiveActions = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.destructiveActions.ts');
  const panel = source('src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx');
  const client = source('src/api/InstalledAppsAPIClient.ts');

  assert.match(destructiveActions, /export type DestructiveActionPlan/);
  assert.match(destructiveActions, /severity: 'warning' \| 'danger'/);
  assert.match(destructiveActions, /requiresTextConfirmation\?: string/);
  assert.match(destructiveActions, /blockedReasons: string\[\]/);
  assert.match(destructiveActions, /mapUninstallPlanToDestructiveActionPlan/);

  assert.match(dialog, /export function DestructiveActionDialog/);
  assert.match(dialog, /AlertDialog/);
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

  assert.match(panel, /DestructiveActionDialog/);
  assert.match(panel, /disabledReason/);
  assert.doesNotMatch(panel, /<AlertDialog/);
  assert.doesNotMatch(panel, /This wireframe keeps data by default/);
  assert.doesNotMatch(panel, /Keep data and uninstall/);

  assert.match(client, /uninstallPlan\(appId: string\)/);
  assert.match(client, /uninstall\(appId: string\)/);
});

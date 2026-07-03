import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();

function loadDestructiveActionsModule() {
  const source = readFileSync(resolve(root, 'src/pages/ApplicationsPage/extensions/ApplicationsPage.destructiveActions.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module, require: () => ({}) });
  return module.exports;
}

test('maps backend-shaped uninstall plans without turning normal confirmations into blockers', () => {
  const { mapUninstallPlanToDestructiveActionPlan } = loadDestructiveActionsModule();

  const plan = mapUninstallPlanToDestructiveActionPlan({
    appId: 'jellyfin',
    appName: 'Jellyfin',
    headline: 'Autark-OS can remove the app while keeping your data on disk.',
    safetyCheckpointPlanned: true,
    safetyCheckpointMessage: 'Autark-OS will save a safety checkpoint.',
    willStop: ['Stop the app containers'],
    willKeep: ['Application data in /runtime/apps/jellyfin'],
    needsConfirmation: ['Confirm you understand that containers will be removed'],
  });

  assert.equal(plan.title, 'Uninstall Jellyfin');
  assert.deepEqual(Array.from(plan.warnings), [
    'Confirm you understand that containers will be removed',
    'Autark-OS will save a safety checkpoint.',
  ]);
  assert.deepEqual(Array.from(plan.blockedReasons), []);
  assert.equal(plan.requiresTextConfirmation, 'UNINSTALL');
});

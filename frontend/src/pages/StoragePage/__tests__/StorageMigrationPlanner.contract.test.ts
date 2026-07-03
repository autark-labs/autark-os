import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Storage page does not expose runtime migration planning without an apply job', () => {
  const storagePage = source('src/pages/StoragePage/StoragePage.tsx');
  const storageRepository = source('src/repositories/storageRepository.ts');
  const systemClient = source('src/api/SystemAPIClient.ts');
  const systemTypes = source('src/types/system.ts');

  assert.doesNotMatch(storagePage, /Move Autark-OS data|RuntimeMigrationPlanPreview|migrationGuidance|migrationTarget|migrationPlan/);
  assert.doesNotMatch(storageRepository, /useRuntimeMigrationPlanMutation|RuntimeMigrationPlan|RuntimeMigrationPlanRequest|runtimeMigrationPlan/);
  assert.doesNotMatch(systemClient, /runtimeMigrationPlan|storage\/migration\/plan|RuntimeMigrationPlan|RuntimeMigrationPlanRequest/);
  assert.doesNotMatch(systemTypes, /RuntimeMigrationGuidance|RuntimeMigrationPlan|RuntimeMigrationPlanRequest|migrationGuidance/);
});

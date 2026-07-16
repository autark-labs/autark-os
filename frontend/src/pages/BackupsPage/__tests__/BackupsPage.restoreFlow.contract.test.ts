import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('restore details and confirmation share one viewport-safe dialog flow', () => {
  const page = source('src/pages/BackupsPage/BackupsPage.tsx');
  const components = source('src/pages/BackupsPage/BackupsPage.components.tsx');

  assert.match(page, /restoreFlow/);
  assert.match(page, /<RestoreFlowDialog/);
  assert.doesNotMatch(page, /<RestoreDialog/);
  assert.doesNotMatch(page, /<RestorePointDetailsDialog/);
  assert.match(components, /phase: 'details' \| 'plan_error' \| 'planning' \| 'confirm'/);
  assert.match(components, /max-h-\[calc\(100dvh-2rem\)\] w-\[calc\(100vw-2rem\)\] max-w-2xl overflow-y-auto/);
  assert.doesNotMatch(components, /min-w-200/);
});

test('restore plan errors stay visible and retryable before a destructive confirmation', () => {
  const page = source('src/pages/BackupsPage/BackupsPage.tsx');
  const components = source('src/pages/BackupsPage/BackupsPage.components.tsx');

  assert.match(page, /phase: phase === 'details' \? 'details' : 'plan_error'/);
  assert.match(page, /function retryRestorePlan/);
  assert.match(page, /restorePlanTokenRef/);
  assert.match(page, /token === restorePlanTokenRef\.current/);
  assert.match(components, /Restore plan unavailable/);
  assert.match(components, /Retry plan/);
  assert.match(components, /This restore point cannot be restored until the complete restore plan is executable/);
  assert.match(components, /What will change/);
  assert.match(components, /What is preserved/);
});

test('restore flow returns focus to its originating control and retains durable job recovery', () => {
  const page = source('src/pages/BackupsPage/BackupsPage.tsx');

  assert.match(page, /restoreOriginRef/);
  assert.match(page, /restoreOriginRef\.current\?\.focus\(\)/);
  assert.match(page, /useBackupJobsQuery\(\)/);
  assert.match(page, /useAutarkOsJobQuery\(currentActiveJob/);
});

test('missing app runtime disables focused and batch backups with a visible reason', () => {
  const page = source('src/pages/BackupsPage/BackupsPage.tsx');
  const components = source('src/pages/BackupsPage/BackupsPage.components.tsx');

  assert.match(page, /report\?\.apps\.filter\(\(app\) => !app\.backupAvailable\)/);
  assert.match(page, /batchBackupUnavailableReason/);
  assert.match(components, /!app\.backupAvailable/);
  assert.match(components, /app\.backupUnavailableReason/);
  assert.match(components, /<DisabledAction[^>]*disabled=\{disabled\}[^>]*reason=\{disabledReason\}/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications rebuild uses split behavior states instead of a single app status source', () => {
  const types = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.types.ts');
  const liveModel = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.liveModel.ts');
  const visuals = source('src/pages/ApplicationsPageRebuild/extensions/ApplicationVisuals.tsx');
  const basic = source('src/pages/ApplicationsPageRebuild/BasicApplicationsView.tsx');
  const advanced = source('src/pages/ApplicationsPageRebuild/AdvancedApplicationsView.tsx');
  const rail = source('src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx');

  assert.match(types, /export type AppManagementState = 'managed' \| 'found' \| 'linked'/);
  assert.match(types, /export type AppReadinessState = 'ready' \| 'starting' \| 'paused' \| 'stopped' \| 'unreachable' \| 'unknown'/);
  assert.match(types, /export type AppAttentionState = 'none' \| 'needs_review' \| 'conflict' \| 'blocked'/);
  assert.match(types, /export type AppOperationState =/);
  assert.match(types, /managementState: AppManagementState/);
  assert.match(types, /readinessState: AppReadinessState/);
  assert.match(types, /attentionState: AppAttentionState/);
  assert.match(types, /operationState: AppOperationState/);

  assert.match(liveModel, /managementState: 'managed'/);
  assert.match(liveModel, /managementState: pinned \? 'linked' : 'found'/);
  assert.match(liveModel, /const readinessState = managedReadinessState/);
  assert.match(liveModel, /const attentionState = managedAttentionState/);
  assert.match(liveModel, /readinessState,/);
  assert.match(liveModel, /attentionState,/);
  assert.match(liveModel, /operationState: idleOperationState\(\)/);
  assert.match(liveModel, /service\.userStatus === 'blocked'/);
  assert.match(liveModel, /service\.userStatus === 'managed_elsewhere'/);

  assert.match(visuals, /ApplicationReadinessBadge/);
  assert.match(visuals, /ApplicationManagementBadge/);
  assert.match(visuals, /ApplicationAttentionIndicator/);
  assert.match(visuals, /labelForReadiness/);
  assert.match(visuals, /labelForManagementState/);

  assert.match(basic, /item\.attentionState !== 'none'/);
  assert.match(basic, /item\.readinessState === 'paused'/);
  assert.match(basic, /ApplicationReadinessBadge item=\{item\} overlay/);
  assert.match(basic, /ApplicationManagementBadge item=\{item\}/);
  assert.doesNotMatch(basic, /item\.runtimeState === 'paused'/);

  assert.match(advanced, /ApplicationManagementBadge item=\{item\}/);
  assert.match(advanced, /ApplicationReadinessBadge item=\{item\}/);
  assert.match(advanced, /ApplicationAttentionIndicator item=\{item\}/);
  assert.match(advanced, /item\.managementState === 'managed'/);
  assert.doesNotMatch(advanced, /item\.kind === 'managed'/);

  assert.match(rail, /labelForManagementState\(item\.managementState\)/);
  assert.match(rail, /labelForReadiness\(item\.readinessState\)/);
  assert.match(rail, /labelForAttention\(item\.attentionState\)/);
  assert.match(rail, /item\.managementState === 'managed'/);
  assert.match(rail, /item\.attentionState !== 'none'/);
  assert.doesNotMatch(rail, /item\.runtimeState === 'needs_attention'/);
});

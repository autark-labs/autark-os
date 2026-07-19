import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page uses split behavior states instead of a single app status source', () => {
  const types = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');
  const liveModel = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.liveModel.ts');
  const visuals = source('src/pages/ApplicationsPage/extensions/ApplicationVisuals.tsx');
  const badges = source('src/pages/ApplicationsPage/components/AppStateBadges.tsx');
  const operationStatus = source('src/pages/ApplicationsPage/components/AppOperationStatus.tsx');
  const basic = source('src/pages/ApplicationsPage/BasicApplicationsView.tsx');
  const applicationCard = source('src/pages/ApplicationsPage/components/ApplicationCard.tsx');
  const advanced = source('src/pages/ApplicationsPage/AdvancedApplicationsView.tsx');
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');
  const managementPanel = source('src/pages/ApplicationsPage/ApplicationManagementPanel.tsx');

  assert.match(types, /export type AppManagementState = 'managed' \| 'found' \| 'linked'/);
  assert.match(types, /export type AppReadinessState = 'ready' \| 'starting' \| 'paused' \| 'stopped' \| 'unreachable' \| 'unknown'/);
  assert.match(types, /export type AppAttentionState = 'none' \| 'needs_review' \| 'conflict' \| 'blocked'/);
  assert.match(types, /export type AppOperationState =/);
  assert.match(types, /managementState: AppManagementState/);
  assert.match(types, /readinessState: AppReadinessState/);
  assert.match(types, /attentionState: AppAttentionState/);
  assert.match(types, /operationState: AppOperationState/);

  assert.match(liveModel, /app\.managementState \?\? 'managed'/);
  assert.match(liveModel, /service\.managementState \?\? \(pinned \? 'linked' : 'found'\)/);
  assert.match(liveModel, /app\.readinessState \?\? managedReadinessState/);
  assert.match(liveModel, /app\.attentionState \?\? managedAttentionState/);
  assert.match(liveModel, /service\.managementState \?\? \(pinned \? 'linked' : 'found'\)/);
  assert.match(liveModel, /service\.readinessState \?\? observedReadinessState/);
  assert.match(liveModel, /service\.attentionState \?\? observedAttentionState/);
  assert.match(liveModel, /readinessState,/);
  assert.match(liveModel, /attentionState,/);
  assert.match(liveModel, /operationState: idleOperationState\(\)/);
  assert.match(liveModel, /value\.kind === 'repairing'/);
  assert.match(liveModel, /app\.canonicalBackupState === 'protected_by_restore_point'/);
  assert.doesNotMatch(liveModel, /if \(backup === 'Needs backup'\)/);
  assert.match(liveModel, /service\.userStatus === 'blocked'/);
  assert.match(liveModel, /service\.userStatus === 'managed_elsewhere'/);

  assert.doesNotMatch(visuals, /ApplicationReadinessBadge/);
  assert.doesNotMatch(visuals, /ApplicationManagementBadge/);
  assert.doesNotMatch(visuals, /ApplicationAttentionIndicator/);
  assert.match(badges, /export function ReadinessBadge/);
  assert.match(badges, /export function ManagementBadge/);
  assert.match(badges, /export function AttentionIndicator/);
  assert.match(badges, /export function OperationBadge/);
  assert.match(badges, /labelForReadiness/);
  assert.match(badges, /labelForManagementState/);
  assert.match(badges, /item\.operationState\.kind !== 'idle'/);

  assert.match(operationStatus, /export function CompactOperationStatus/);
  assert.match(operationStatus, /export function ExpandedOperationStatus/);
  assert.match(operationStatus, /item\.operationState\.currentStep/);
  assert.match(operationStatus, /item\.operationState\.kind === 'failed'/);

  assert.match(basic, /ApplicationCard/);
  assert.match(applicationCard, /item\.attentionState !== 'none'/);
  assert.match(applicationCard, /labelForReadiness/);
  assert.match(applicationCard, /from '\.\/AppStateBadges'/);
  assert.match(applicationCard, /AppArtwork/);
  assert.match(applicationCard, /AppCardName/);
  assert.match(applicationCard, /item\.attentionState !== 'none'/);
  assert.doesNotMatch(applicationCard, /CompactOperationStatus/);
  assert.doesNotMatch(basic, /item\.runtimeState === 'paused'/);

  assert.match(advanced, /from '\.\/components\/AppStateBadges'/);
  assert.match(advanced, /from '\.\/components\/AppOperationStatus'/);
  assert.match(advanced, /ManagementBadge item=\{item\}/);
  assert.match(advanced, /ReadinessBadge item=\{item\}/);
  assert.match(advanced, /AttentionIndicator item=\{item\}/);
  assert.match(advanced, /CompactOperationStatus item=\{item\}/);
  assert.match(advanced, /item\.managementState === 'managed'/);
  assert.doesNotMatch(advanced, /item\.kind === 'managed'/);

  assert.match(rail, /from '\.\/components\/AppStateBadges'/);
  assert.match(rail, /from '\.\/components\/AppOperationStatus'/);
  assert.match(rail, /labelForManagementState\(item\.managementState\)/);
  assert.match(rail, /labelForReadiness\(item\.readinessState\)/);
  assert.match(rail, /labelForAttention\(item\.attentionState\)/);
  assert.match(rail, /ExpandedOperationStatus item=\{item\}/);
  assert.match(rail, /item\.managementState === 'managed'/);
  assert.match(rail, /item\.availableActions\.find\(\(action\) => action\.id === 'repair'\)/);
  assert.match(rail, /repairAction &&/);
  assert.doesNotMatch(rail, /item\.runtimeState === 'needs_attention'/);

  assert.match(managementPanel, /ApplicationRecoveryTab/);
  assert.doesNotMatch(managementPanel, /from '\.\/components\/AppOperationStatus'/);
  assert.doesNotMatch(managementPanel, /ExpandedOperationStatus item=\{item\}/);
});

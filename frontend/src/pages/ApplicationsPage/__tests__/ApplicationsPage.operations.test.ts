import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  applicationActionRestriction,
  operationBlocksManagement,
  runtimeActionDisabled,
  runtimeActionDisabledReason,
  runtimeControlsDisabled,
} from '../extensions/ApplicationsPage.operations';

test('runtime controls follow the canonical operation state', () => {
  assert.equal(runtimeControlsDisabled({ kind: 'idle' }, null), false);
  assert.equal(runtimeControlsDisabled({ kind: 'failed', label: 'Failed', message: 'Failed' }, null), false);
  assert.equal(runtimeControlsDisabled({ kind: 'starting', label: 'Starting' }, null), true);
  assert.equal(runtimeControlsDisabled({ kind: 'idle' }, 'start'), true);
});

test('backend action restrictions provide disabled reasons', () => {
  const item = {
    name: 'Vaultwarden',
    operation: { kind: 'idle' as const },
    availableActions: [{ id: 'start', label: 'Start', disabled: true, reason: 'The original Compose file is missing.' }],
  };
  assert.deepEqual(applicationActionRestriction(item, 'start'), { disabled: true, reason: 'The original Compose file is missing.' });
  assert.equal(runtimeActionDisabled(item, 'start', null), true);
  assert.equal(runtimeActionDisabledReason(item, 'start', null), 'The original Compose file is missing.');
  assert.equal(runtimeActionDisabled(item, 'stop', null), false);
});

test('failed operations leave recovery controls available', () => {
  assert.equal(operationBlocksManagement({ kind: 'idle' }), false);
  assert.equal(operationBlocksManagement({ kind: 'failed', label: 'Failed', message: 'Failed' }), false);
  assert.equal(operationBlocksManagement({ kind: 'starting', label: 'Starting' }), true);
  assert.equal(operationBlocksManagement({ kind: 'uninstalling', label: 'Uninstalling' }), true);
});

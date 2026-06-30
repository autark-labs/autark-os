import assert from 'node:assert/strict';
import test from 'node:test';
import { operationStateForItem, runtimeControlsDisabled, operationBlocksManagement } from '../extensions/ApplicationsPage.operations.js';

test('operationStateForItem maps local runtime actions before idle state', () => {
  assert.deepEqual(operationStateForItem(item('vaultwarden'), 'start', null, []), {
    kind: 'starting',
    label: 'Starting',
  });
  assert.deepEqual(operationStateForItem(item('vaultwarden'), 'stop', null, []), {
    kind: 'stopping',
    label: 'Pausing',
  });
  assert.deepEqual(operationStateForItem(item('vaultwarden'), 'restart', null, []), {
    kind: 'restarting',
    label: 'Restarting',
  });
  assert.deepEqual(operationStateForItem(item('vaultwarden'), 'backup', null, []), {
    kind: 'backing_up',
    label: 'Creating backup',
  });
});

test('operationStateForItem maps settings save but not settings planning', () => {
  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, 'saving', []), {
    kind: 'saving_settings',
    label: 'Saving settings',
  });
  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, 'planning', []), {
    kind: 'idle',
  });
});

test('operationStateForItem maps durable jobs by app subject and current step', () => {
  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, null, [
    job('restart-1', 'restart_app', 'vaultwarden', 'running', 'wait'),
  ]), {
    kind: 'restarting',
    label: 'Restarting',
    jobId: 'restart-1',
    currentStep: 'Waiting for app readiness',
  });

  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, null, [
    job('start-1', 'start_app', 'vaultwarden', 'queued', 'run'),
  ]), {
    kind: 'starting',
    label: 'Starting',
    jobId: 'start-1',
    currentStep: 'Running app command',
  });

  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, null, [
    job('backup-1', 'backup', 'vaultwarden', 'running', 'archive'),
  ]), {
    kind: 'backing_up',
    label: 'Creating backup',
    jobId: 'backup-1',
    currentStep: 'Writing backup archive',
  });

  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, null, [
    job('repair-1', 'repair_app', 'vaultwarden', 'running', 'repair'),
  ]), {
    kind: 'repairing',
    label: 'Repairing',
    jobId: 'repair-1',
    currentStep: 'Repairing app',
  });

  assert.deepEqual(operationStateForItem(item('vaultwarden'), 'restart', null, [
    job('uninstall-1', 'uninstall_app', 'vaultwarden', 'running', 'remove'),
  ]), {
    kind: 'uninstalling',
    label: 'Uninstalling safely',
    jobId: 'uninstall-1',
    currentStep: 'Removing containers',
  });
});

test('operationStateForItem maps relevant failed durable jobs and ignores jobs for other apps', () => {
  assert.deepEqual(operationStateForItem(item('vaultwarden', { readinessState: 'unreachable', attentionState: 'needs_review' }), null, null, [
    {
      ...job('failed-1', 'uninstall_app', 'vaultwarden', 'failed', 'remove'),
      error: { message: 'Docker could not remove the app safely.' },
    },
  ]), {
    kind: 'failed',
    label: 'Action failed',
    message: 'Docker could not remove the app safely.',
    jobId: 'failed-1',
  });

  assert.deepEqual(operationStateForItem(item('vaultwarden'), null, null, [
    job('backup-2', 'backup', 'jellyfin', 'running', 'archive'),
  ]), {
    kind: 'idle',
  });
});

test('operationStateForItem does not resurrect stale failed lifecycle jobs after recovery', () => {
  assert.deepEqual(operationStateForItem(item('syncthing', { readinessState: 'ready', attentionState: 'none' }), null, null, [
    {
      ...job('failed-1', 'restart_app', 'syncthing', 'failed', 'wait'),
      error: { message: 'Port 8385 is already in use.' },
    },
  ]), {
    kind: 'idle',
  });

  assert.deepEqual(operationStateForItem(item('syncthing', { readinessState: 'starting', attentionState: 'none' }), null, null, [
    {
      ...job('failed-1', 'start_app', 'syncthing', 'failed', 'wait'),
      error: { message: 'Port 8385 is already in use.' },
    },
  ]), {
    kind: 'idle',
  });

  assert.deepEqual(operationStateForItem(item('syncthing', { readinessState: 'ready', attentionState: 'none' }), null, null, [
    {
      ...job('success-1', 'restart_app', 'syncthing', 'succeeded', 'wait', '2026-06-29T12:01:00Z'),
    },
    {
      ...job('failed-1', 'restart_app', 'syncthing', 'failed', 'wait', '2026-06-29T12:00:00Z'),
      error: { message: 'Port 8385 is already in use.' },
    },
  ]), {
    kind: 'idle',
  });
});

test('runtime controls remain available after a failed operation', () => {
  assert.equal(runtimeControlsDisabled({ kind: 'idle' }, null), false);
  assert.equal(runtimeControlsDisabled({ kind: 'failed' }, null), false);
  assert.equal(runtimeControlsDisabled({ kind: 'starting' }, null), true);
  assert.equal(runtimeControlsDisabled({ kind: 'idle' }, 'start'), true);
});

test('failed operations do not block settings or uninstall recovery actions', () => {
  assert.equal(operationBlocksManagement({ kind: 'idle' }), false);
  assert.equal(operationBlocksManagement({ kind: 'failed' }), false);
  assert.equal(operationBlocksManagement({ kind: 'starting' }), true);
  assert.equal(operationBlocksManagement({ kind: 'uninstalling' }), true);
});

function item(id, overrides = {}) {
  return {
    id,
    sourceId: id,
    name: id,
    ...overrides,
  };
}

function job(jobId, type, subjectId, status, currentStep, updatedAt = '2026-06-29T12:00:00Z') {
  return {
    jobId,
    type,
    subjectId,
    status,
    currentStep,
    steps: [
      { id: 'run', label: 'Run command', message: 'Running app command', status: currentStep === 'run' ? 'running' : 'pending' },
      { id: 'wait', label: 'Wait for readiness', message: 'Waiting for app readiness', status: currentStep === 'wait' ? 'running' : 'pending' },
      { id: 'archive', label: 'Create archive', message: 'Writing backup archive', status: currentStep === 'archive' ? 'running' : 'pending' },
      { id: 'remove', label: 'Remove app', message: 'Removing containers', status: currentStep === 'remove' ? 'running' : 'pending' },
      { id: 'repair', label: 'Run repair', message: 'Repairing app', status: currentStep === 'repair' ? 'running' : 'pending' },
    ],
    createdAt: '2026-06-29T12:00:00Z',
    updatedAt,
  };
}

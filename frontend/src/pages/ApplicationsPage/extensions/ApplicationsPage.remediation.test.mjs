import assert from 'node:assert/strict';
import test from 'node:test';
import { appRemediationDisplay } from './ApplicationsPage.remediation.js';

const baseApp = {
  appId: 'vaultwarden',
  appName: 'Vaultwarden',
  friendlyStatus: 'Ready',
  canonicalBackupState: 'backup_enabled_no_restore_point',
  recentEvents: [],
  settings: { autoRepairEnabled: true },
};

test('shows healthy apps as being watched by Project OS when auto repair is enabled', () => {
  const display = appRemediationDisplay({
    app: baseApp,
    health: { status: 'Ready', message: 'Ready', localAccessStatus: 'reachable' },
  });

  assert.equal(display.state, 'watching');
  assert.equal(display.label, 'Project OS is watching');
  assert.match(display.summary, /will try safe repair/i);
});

test('shows active repair without asking the user to take another action', () => {
  const display = appRemediationDisplay({
    app: {
      ...baseApp,
      recentEvents: [{ type: 'repair_started', message: 'Repair started' }],
      settings: { autoRepairEnabled: true, lastRepairStatus: 'running' },
    },
    health: { status: 'Needs attention', message: 'Container missing', repairAvailable: true },
  });

  assert.equal(display.state, 'auto_repairing');
  assert.equal(display.nextActionLabel, 'Wait for repair');
  assert.match(display.summary, /trying a safe repair/i);
});

test('recommends restore only after repair failed and a completed restore point exists', () => {
  const display = appRemediationDisplay({
    app: {
      ...baseApp,
      canonicalBackupState: 'protected_by_restore_point',
      settings: { autoRepairEnabled: true, lastRepairStatus: 'failed' },
    },
    health: { status: 'Needs attention', message: 'Container keeps restarting', repairAvailable: false },
  });

  assert.equal(display.state, 'restore_recommended');
  assert.equal(display.nextActionLabel, 'Review restore');
  assert.match(display.summary, /restore point/i);
});

test('does not recommend restore after repair failed without a completed restore point', () => {
  const display = appRemediationDisplay({
    app: {
      ...baseApp,
      canonicalBackupState: 'backup_enabled_no_restore_point',
      settings: { autoRepairEnabled: true, lastRepairStatus: 'failed' },
    },
    health: { status: 'Needs attention', message: 'Container keeps restarting', repairAvailable: false },
  });

  assert.equal(display.state, 'repair_failed');
  assert.equal(display.nextActionLabel, 'Review repair');
  assert.doesNotMatch(display.summary, /restore point/i);
});

test('uses needs user action when Project OS cannot safely repair the app', () => {
  const display = appRemediationDisplay({
    app: { ...baseApp, settings: { autoRepairEnabled: false } },
    health: { status: 'Unavailable', message: 'Container was removed', repairAvailable: false },
  });

  assert.equal(display.state, 'needs_user_action');
  assert.equal(display.nextActionLabel, 'Open Manage');
  assert.match(display.summary, /needs your review/i);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldApplyProjectSettingsToApps } from './SettingsPage.logic.js';

const baseSettings = {
  automaticBackupsEnabled: true,
  automaticRepairEnabled: true,
  backupFrequency: 'daily',
  backupRetentionDays: 7,
};

test('shouldApplyProjectSettingsToApps only changes when app defaults changed', () => {
  assert.equal(shouldApplyProjectSettingsToApps(null, baseSettings), true);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, baseSettings), false);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, { ...baseSettings, deviceName: 'project-os-renamed' }), false);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, { ...baseSettings, automaticRepairEnabled: false }), true);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, { ...baseSettings, automaticBackupsEnabled: false }), true);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, { ...baseSettings, backupFrequency: 'weekly' }), true);
  assert.equal(shouldApplyProjectSettingsToApps(baseSettings, { ...baseSettings, backupRetentionDays: 14 }), true);
});

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clampOnboardingStep, cleanPrivateAccessChoice, completedOnboardingSteps, validateOnboardingStep } from '../OnboardingWizard.logic';

const draft = {
  automaticBackups: true,
  backupDestination: '/mnt/backups/autark-os',
  backupPosture: 'routine' as const,
  deviceName: 'Homelab',
  privateAccessChoice: 'local-only' as const,
  selectedApps: ['vaultwarden'],
};

test('clamps persisted setup steps to the supported guided flow', () => {
  assert.equal(clampOnboardingStep(-1), 0);
  assert.equal(clampOnboardingStep(3), 3);
  assert.equal(clampOnboardingStep(99), 5);
});

test('persists completed guided steps as a user advances', () => {
  assert.deepEqual(completedOnboardingSteps(0), []);
  assert.deepEqual(completedOnboardingSteps(4), ['device', 'doctor', 'tailscale', 'storage', 'backups']);
  assert.deepEqual(completedOnboardingSteps(5), ['device', 'doctor', 'tailscale', 'storage', 'backups', 'apps']);
});

test('requires a device name and a safe external backup path before advancing', () => {
  assert.equal(validateOnboardingStep(0, { ...draft, deviceName: '  ' }), 'Give this device a name before continuing.');
  assert.equal(validateOnboardingStep(3, { ...draft, backupPosture: 'external', backupDestination: 'relative/path' }), 'Backup destination must be an absolute path that starts with /.');
  assert.equal(validateOnboardingStep(3, { ...draft, backupPosture: 'external', backupDestination: '/mnt/backups/autark-os' }), null);
});

test('uses a truthful private-access default when the saved choice is invalid', () => {
  assert.equal(cleanPrivateAccessChoice('unknown', false), 'local-only');
  assert.equal(cleanPrivateAccessChoice('unknown', true), 'already-connected');
});

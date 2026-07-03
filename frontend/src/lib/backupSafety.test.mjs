import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backupSafetyChecklist,
  backupSafetyWarning,
  backupSafetyWarnings,
} from './backupSafety.js';

test('describes reinstall as preserving data folders while requiring a backup', () => {
  const warning = backupSafetyWarning('reinstall');

  assert.match(warning, /configured data folders/i);
  assert.match(warning, /backup/i);
  assert.doesNotMatch(warning, /remove app state/i);
});

test('describes reset as potentially removing app state', () => {
  const warning = backupSafetyWarning('reset');

  assert.match(warning, /remove app state/i);
  assert.match(warning, /back up/i);
});

test('describes restore as replacing current data with the restore point', () => {
  const warnings = backupSafetyWarnings('restore');

  assert.ok(warnings.some((warning) => /current app data will be replaced/i.test(warning)));
  assert.ok(warnings.some((warning) => /safety backup/i.test(warning)));
});

test('adds verification warning for unverified restore points', () => {
  const warnings = backupSafetyWarnings('restore', { verified: false });

  assert.ok(warnings.some((warning) => /verify this restore point/i.test(warning)));
});

test('provides cleanup checklist for safety checkpoint copy', () => {
  const checklist = backupSafetyChecklist('storage-cleanup');

  assert.ok(checklist.includes('Autark-OS will create a safety checkpoint before removing this folder.'));
  assert.ok(checklist.some((item) => /direct child/i.test(item)));
});

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  backupSafetyChecklist,
  backupSafetyWarning,
  backupSafetyWarnings,
} from '../backupSafety';

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

test('cleanup promises only a manual archive before deletion, not a Backups restore point', () => {
  const checklist = backupSafetyChecklist('storage-cleanup');

  assert.match(checklist[0], /After you confirm.*archives.*then deletes/);
  assert.match(checklist[1], /manual recovery/);
  assert.match(checklist[1], /not a Backups restore point/);
  assert.match(checklist[1], /does not preserve the complete app installation/);
  assert.match(checklist[1], /Installed app folders are left unchanged/);
});

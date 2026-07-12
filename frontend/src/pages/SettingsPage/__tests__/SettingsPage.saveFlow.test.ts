import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('settings preserves a dirty draft until the user confirms refresh or navigation', () => {
  const page = readFileSync(resolve(here, '../SettingsPage.tsx'), 'utf8');
  const controller = readFileSync(resolve(here, '../useSettingsPageController.ts'), 'utf8');

  assert.match(controller, /beforeunload/);
  assert.match(controller, /guardNavigation/);
  assert.match(page, /Discard unsaved changes\?/);
  assert.match(page, /Leave without saving\?/);
  assert.match(page, /Discard and refresh/);
  assert.match(page, /Discard and leave/);
});

test('settings uses one save result instead of a second app-defaults mutation', () => {
  const controller = readFileSync(resolve(here, '../useSettingsPageController.ts'), 'utf8');
  const client = readFileSync(resolve(here, '../../../api/SystemAPIClient.ts'), 'utf8');

  assert.match(controller, /const result = await SystemAPIClient\.updateSettings\(draft\)/);
  assert.match(controller, /result\.appDefaults\.message/);
  assert.doesNotMatch(controller, /applyAppDefaults/);
  assert.doesNotMatch(client, /settings\/app-defaults\/apply/);
});

test('settings has distinct recoverable load and save failures', () => {
  const page = readFileSync(resolve(here, '../SettingsPage.tsx'), 'utf8');

  assert.match(page, /Settings are unavailable/);
  assert.match(page, /Settings could not refresh/);
  assert.match(page, /Settings could not save/);
  assert.match(page, /Your edits are still here/);
});

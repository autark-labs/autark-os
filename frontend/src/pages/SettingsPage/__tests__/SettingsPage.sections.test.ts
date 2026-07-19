import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { settingsGroups, sectionsForGroup, defaultSettingsGroup, visibleSettingsGroups } from '../SettingsPage.sections';

const here = dirname(fileURLToPath(import.meta.url));

test('consolidates settings into five focused top-level groups', () => {
  assert.deepEqual(settingsGroups.map((group) => group.id), ['general', 'apps', 'backups', 'network', 'advanced']);
});

test('keeps everyday settings out of the advanced group', () => {
  assert.deepEqual(sectionsForGroup('general'), ['general']);
  assert.deepEqual(sectionsForGroup('apps'), ['applications']);
  assert.deepEqual(sectionsForGroup('backups'), ['backups', 'storage']);
  assert.deepEqual(sectionsForGroup('network'), ['network', 'remote-access', 'security']);
});

test('places low-frequency technical settings in advanced', () => {
  assert.deepEqual(sectionsForGroup('advanced'), ['system', 'advanced']);
});

test('falls back to the general group for unknown values', () => {
  assert.equal(defaultSettingsGroup('missing'), 'general');
  assert.deepEqual(sectionsForGroup('missing'), ['general']);
});

test('can hide advanced group for simplified views', () => {
  assert.deepEqual(visibleSettingsGroups(false).map((group) => group.id), ['general', 'apps', 'backups', 'network']);
  assert.deepEqual(visibleSettingsGroups(true).map((group) => group.id), ['general', 'apps', 'backups', 'network', 'advanced']);
});

test('does not expose unfinished MVP settings controls', () => {
  const page = readFileSync(resolve(here, '../SettingsPage.tsx'), 'utf8');
  const sections = readFileSync(resolve(here, '../SettingsPage.sections.ts'), 'utf8');

  assert.doesNotMatch(page, /Show advanced disk info|Coming soon|Audit logging|Update channel|Update checks|UpdatesPanel/);
  assert.doesNotMatch(sections, /updates|Update channel/);
});

test('keeps storage-only preferences out of the free settings surface', () => {
  const page = readFileSync(resolve(here, '../SettingsPage.tsx'), 'utf8');

  assert.doesNotMatch(page, /label="Language"|label="Temperature unit"|label="Date format"|label="Time format"/);
  assert.doesNotMatch(page, /Start Autark-OS on boot|Default install access|Prefer private installs/);
});

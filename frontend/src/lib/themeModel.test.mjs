import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyThemeToDocument,
  defaultThemeId,
  projectOsThemes,
  readStoredTheme,
  resolveThemeId,
  storeTheme,
  themeStorageKey,
} from './themeModel.js';

test('theme model exposes four stable Autark-OS themes', () => {
  assert.equal(defaultThemeId, 'project-slate');
  assert.deepEqual(projectOsThemes.map((theme) => theme.id), ['project-slate', 'harbor', 'forest', 'ember']);
  assert.equal(new Set(projectOsThemes.map((theme) => theme.id)).size, 4);
});

test('theme model reads, validates, stores, and applies themes', () => {
  const storage = new MapStorage();
  const document = { documentElement: { dataset: {} } };

  assert.equal(readStoredTheme(storage), null);
  storage.setItem(themeStorageKey, 'not-real');
  assert.equal(readStoredTheme(storage), null);
  assert.equal(resolveThemeId('forest'), 'forest');
  assert.equal(resolveThemeId('not-real'), defaultThemeId);

  storeTheme('ember', storage);
  assert.equal(storage.getItem(themeStorageKey), 'ember');
  assert.equal(readStoredTheme(storage), 'ember');

  applyThemeToDocument(document, 'harbor');
  assert.equal(document.documentElement.dataset.theme, 'harbor');

  applyThemeToDocument(document, 'bad-theme');
  assert.equal(document.documentElement.dataset.theme, defaultThemeId);
});

class MapStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

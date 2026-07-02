import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page does not silently fall back to the first visible item', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.doesNotMatch(page, /visibleItems\.find\(\(item\) => item\.id === selectedId\) \?\? visibleItems\[0\]/);
  assert.doesNotMatch(page, /setSelectedId\(items\[0\]\.id\)/);
  assert.match(page, /selectedItem = items\.find\(\(item\) => item\.id === selectedId\) \?\? null/);
  assert.match(page, /selectedItemIsVisible/);
});

test('details rail renders the selected item even when grid visibility is changing', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.doesNotMatch(page, /item=\{selectedItemIsVisible \? selectedItem : null\}/);
  assert.match(page, /item=\{selectedItem\}/);
});

test('deep-link selection can reapply after selected item temporarily disappears', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /appliedDeepLinkKeyRef\.current = '';\s+setSelectedId\(''\);/);
});

test('empty selection is not cleared after a deep-link effect schedules a real selection', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /if \(!selectedId\) {\s+return;\s+}/);
});

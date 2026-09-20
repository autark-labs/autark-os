import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('applications page does not silently fall back to the first visible item', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.doesNotMatch(page, /visibleItems\.find\(\(item\) => item\.id === selectedId\) \?\? visibleItems\[0\]/);
  assert.doesNotMatch(page, /setSelectedId\(items\[0\]\.id\)/);
  assert.match(page, /selectedItem = findApplicationDeepLinkTarget\(items, deepLinkTarget\) \?\? null/);
  assert.match(page, /selectedItemIsVisible/);
});

test('management dialog renders the selected item even when grid visibility is changing', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.doesNotMatch(page, /item=\{selectedItemIsVisible \? selectedItem : null\}/);
  assert.match(page, /item=\{selectedItem\}/);
});

test('applications page keeps app focus in the route and clears it when management closes', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /const navigate = useNavigate\(\)/);
  assert.match(page, /applicationDeepLinkForSurfaceItem/);
  assert.match(page, /navigate\(applicationDeepLinkForSurfaceItem\(item, \{ panel: 'manage' \}\), \{ replace: true \}\)/);
  assert.match(page, /navigate\('\/apps', \{ replace: true \}\)/);
  assert.doesNotMatch(page, /setSelectedId|setManagementOpen/);
  assert.match(page, /onSelect=\{handleSelectItem\}/);
  assert.match(page, /<Dialog open=\{Boolean\(selectedItem\)\}/);
});

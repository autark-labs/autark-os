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

test('stale selected apps collapse management instead of leaving an empty expanded rail', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /if \(!items\.some\(\(item\) => item\.id === selectedId\)\) \{\s+clearApplicationFocus\(\);\s+\}/);
});

test('management outside click listener runs in capture phase before child stopPropagation', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(page, /document\.removeEventListener\('pointerdown', handlePointerDown, true\)/);
});

test('management drawer is masked and borderless while it is collapsed', () => {
  const rail = source('src/pages/ApplicationsPage/ApplicationDetailsRail.tsx');

  assert.match(rail, /w-\[64rem\] overflow-hidden/);
  assert.match(rail, /right-\[calc\(22rem-1px\)\]/);
  assert.match(rail, /border-transparent shadow-none/);
});

test('empty selection is not cleared after a deep-link effect schedules a real selection', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /if \(!selectedId\) {\s+return;\s+}/);
});

test('applications page keeps app focus in the route and clears it when management closes', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');

  assert.match(page, /const navigate = useNavigate\(\)/);
  assert.match(page, /applicationDeepLinkForSurfaceItem/);
  assert.match(page, /navigate\(applicationDeepLinkForSurfaceItem\(item, \{ panel: managementOpen \? 'manage' : null \}\), \{ replace: true \}\)/);
  assert.match(page, /navigate\('\/apps', \{ replace: true \}\)/);
  assert.match(page, /setManagementOpen\(deepLinkTarget\.panel === 'manage'\)/);
  assert.match(page, /onSelect=\{handleSelectItem\}/);
  assert.match(page, /onManagementOpenChange=\{handleManagementOpenChange\}/);
});

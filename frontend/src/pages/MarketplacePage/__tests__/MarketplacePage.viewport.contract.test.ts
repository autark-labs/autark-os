import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/MarketplacePage/MarketplacePage.tsx'), 'utf8');
const appList = readFileSync(resolve(process.cwd(), 'src/pages/MarketplacePage/MarketplaceAppList.tsx'), 'utf8');

test('Discover keeps its first-run guidance without duplicating global recommendations', () => {
  assert.doesNotMatch(page, /CanonicalRecommendedAction/);
  assert.match(page, /starterGuidanceVisible/);
  assert.match(page, /vaultwardenRecommendation/);
  assert.match(page, /!showAdvancedMetrics/);
  assert.match(page, /basicCatalogMode === 'starter'/);
  assert.match(appList, /aria-label="Starter app recommendation"/);
  assert.match(appList, /Start with \{appName\}/);
  assert.match(appList, /Hide starter recommendation/);
  assert.doesNotMatch(page, /Recommended path/);
});

test('Discover uses a compact bounded workspace with browse, catalog, and inspector regions', () => {
  assert.match(page, /contained/);
  assert.match(page, /lg:h-\[calc\(100dvh-7\.25rem\)\]/);
  assert.match(page, /xl:grid-cols-\[12rem_minmax\(0,1fr\)_19rem\]/);
  assert.match(page, /<MarketplaceCatalogToolbar/);
  assert.match(page, /statusFilter=\{statusFilter\}/);
  assert.match(page, /onStatusFilterChange=\{setStatusFilter\}/);
  assert.doesNotMatch(page, /Showing new apps only|Hide installed/);
  assert.match(page, /<MarketplaceAppList/);
  assert.match(page, /starterGuidance=\{starterGuidanceVisible/);
  assert.doesNotMatch(page, /function MarketplaceBrowseSidebar\([\s\S]*Start with one app/);
});

test('Discover preserves dismissal and explicit restoration of first-run guidance', () => {
  assert.match(page, /window\.localStorage\.setItem\(START_HERE_DISMISSAL_KEY, 'true'\)/);
  assert.match(page, /window\.localStorage\.removeItem\(START_HERE_DISMISSAL_KEY\)/);
  assert.match(page, /onRestoreStarterGuidance=\{canRestoreStarterGuidance \? restoreStartHere : undefined\}/);
});

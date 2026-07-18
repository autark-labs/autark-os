import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Discover uses a route-backed detail selection and preserves catalog context on close', () => {
  const page = source('src/pages/MarketplacePage/MarketplacePage.tsx');

  assert.match(page, /const explicitDetailAppId = marketplaceDetailId\(searchParams\)/);
  assert.match(page, /setSearchParams\(marketplaceSearchWithDetail\(searchParams, appId\)\)/);
  assert.match(page, /setSearchParams\(marketplaceSearchWithoutDetail\(searchParams, Boolean\(recoveryAppId\)\), \{ replace: true \}\)/);
  assert.match(page, /catalogScrollPositionRef\.current = window\.scrollY/);
  assert.match(page, /window\.scrollTo\(\{ top: catalogScrollPositionRef\.current \}\)/);
  assert.match(page, /detailTriggerRef\.current\?\.focus\(\)/);
  assert.match(page, /\{detailView && \(/);
});

test('Discover keeps dense catalog selection in a persistent rail and opens full review in the shared details sheet', () => {
  const detail = source('src/pages/MarketplacePage/MarketplaceAppDetail.tsx');
  const list = source('src/pages/MarketplacePage/MarketplaceAppList.tsx');
  const page = source('src/pages/MarketplacePage/MarketplacePage.tsx');
  const rail = source('src/pages/MarketplacePage/MarketplaceAppRail.tsx');
  const jobTracking = source('src/pages/MarketplacePage/useDiscoverJobTracking.ts');

  assert.match(detail, /<ResponsiveDetailsSheet/);
  assert.match(detail, /onOpenChange=\{\(open\) => !open && onBack\(\)\}/);
  assert.match(detail, /<JobProgress/);
  assert.match(page, /const wideRailLayout = useDiscoverRailLayout\(\)/);
  assert.match(page, /<MarketplaceAppRail/);
  assert.match(page, /onSelect=\{selectApp\}/);
  assert.match(list, /grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4/);
  assert.match(list, /marketplaceCardToneClass\(app\)/);
  assert.match(list, /\{app\.stateLabel\}/);
  assert.match(rail, /appView\.stateDescription/);
  assert.match(rail, /marketplacePrimaryRoute\(appView\)/);
  assert.match(rail, /<DisabledAction/);
  assert.match(page, /useDiscoverJobTracking/);
  assert.match(jobTracking, /latestActiveDiscoverJob/);
  assert.match(jobTracking, /useDiscoverJobQuery\(activeInstallJobId\)/);
});

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

test('Discover details use the shared responsive details sheet below wide desktop layouts and keep durable jobs attached', () => {
  const detail = source('src/pages/MarketplacePage/MarketplaceAppDetail.tsx');
  const page = source('src/pages/MarketplacePage/MarketplacePage.tsx');
  const jobTracking = source('src/pages/MarketplacePage/useDiscoverJobTracking.ts');

  assert.match(detail, /<ResponsiveDetailsSheet/);
  assert.match(detail, /min-width: 1536px/);
  assert.match(detail, /onOpenChange=\{\(open\) => !open && onBack\(\)\}/);
  assert.match(detail, /<JobProgress/);
  assert.match(page, /useDiscoverJobTracking/);
  assert.match(jobTracking, /latestActiveDiscoverJob/);
  assert.match(jobTracking, /useDiscoverJobQuery\(activeInstallJobId\)/);
});

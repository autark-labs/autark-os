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
  assert.match(page, /\{detailView && !wideRailLayout && \(/);
});

test('Discover keeps details anchored to the persistent rail and reserves the shared sheet for narrow screens', () => {
  const detail = source('src/pages/MarketplacePage/MarketplaceAppDetail.tsx');
  const list = source('src/pages/MarketplacePage/MarketplaceAppList.tsx');
  const page = source('src/pages/MarketplacePage/MarketplacePage.tsx');
  const rail = source('src/pages/MarketplacePage/MarketplaceAppRail.tsx');
  const jobTracking = source('src/pages/MarketplacePage/useDiscoverJobTracking.ts');

  assert.match(detail, /<ResponsiveDetailsSheet/);
  assert.match(detail, /onOpenChange=\{\(open\) => !open && onBack\(\)\}/);
  assert.match(detail, /<Tabs className="min-h-0 flex-1" defaultValue="overview">/);
  assert.match(detail, /value="install">Install<\/TabsTrigger>/);
  assert.match(detail, /value="details">Details<\/TabsTrigger>/);
  assert.match(detail, /<JobProgress/);
  assert.match(page, /const wideRailLayout = useDiscoverRailLayout\(\)/);
  assert.match(page, /<MarketplaceAppRail/);
  assert.match(page, /\{detailView && !wideRailLayout && \(/);
  assert.match(page, /onSelect=\{selectApp\}/);
  assert.match(list, /grid-cols-\[repeat\(auto-fill,minmax\(11rem,1fr\)\)\]/);
  assert.match(list, /launcherCardAttentionClass\(app\)/);
  assert.match(list, /app\.stateLabel/);
  assert.match(rail, /<MarketplaceAppDetailsCard/);
  assert.match(rail, /w-\[59\.5rem\] overflow-hidden/);
  assert.match(rail, /right-\[calc\(17\.5rem-1px\)\]/);
  assert.match(rail, /overflow-hidden rounded-l-2xl/);
  assert.match(rail, /<Tabs className="min-h-0"/);
  assert.match(rail, /onDetailsOpenChange/);
  assert.match(rail, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(rail, /document\.removeEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(rail, /data-discover-details-toggle/);
  assert.match(rail, /border-transparent shadow-none/);
  assert.match(rail, /onReviewInstall/);
  assert.doesNotMatch(rail, /onReviewDetails/);
  assert.match(rail, /marketplacePrimaryRoute\(appView\)/);
  assert.match(rail, /<DisabledAction/);
  assert.match(page, /useDiscoverJobTracking/);
  assert.match(jobTracking, /latestActiveDiscoverJob/);
  assert.match(jobTracking, /useDiscoverJobQuery\(activeInstallJobId\)/);
});

test('Discover terminal install feedback can be dismissed without hiding active install progress', () => {
  const page = source('src/pages/MarketplacePage/MarketplacePage.tsx');

  assert.match(page, /const \[dismissedInstallJobId, setDismissedInstallJobId\]/);
  assert.match(page, /dismissed=\{dismissedInstallJobId === installJob\?\.jobId\}/);
  assert.match(page, /aria-label="Dismiss install result"/);
  assert.match(page, /if \(dismissed \|\| !installJob \|\| installJob\.subjectId !== selectedAppId\)/);
  assert.match(page, /if \(!terminalJob\(installJob\)\) \{/);
});

test('Discover install confirmation uses the approved plan review and requires explicit confirmation', () => {
  const wizard = source('src/pages/MarketplacePage/MarketplaceInstallWizard.tsx');

  assert.match(wizard, /Install plan/);
  assert.match(wizard, /<InstallPlanStep icon=\{PackageOpen\}/);
  assert.match(wizard, /<InstallPlanStep icon=\{LockKeyhole\}/);
  assert.match(wizard, /<InstallConfigurationCallout/);
  assert.match(wizard, /aria-label="Confirm install plan"/);
  assert.match(wizard, /Confirm the install plan before starting\./);
  assert.doesNotMatch(wizard, />Preview</);
  assert.doesNotMatch(wizard, /<Tabs/);
});

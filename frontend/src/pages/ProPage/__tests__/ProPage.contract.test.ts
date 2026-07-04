import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { primaryNavigation } from '@/layout/navigationModel';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Pro page has a local route, navigation entry, typed API client, and no hosted frontend coupling', () => {
  assert.equal(existsSync(resolve(root, 'src/types/pro.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/api/proApi.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/pages/ProPage/ProPage.tsx')), true);

  const app = source('src/App.tsx');
  assert.match(app, /const ProPage = lazy/);
  assert.match(app, /path="\/pro"/);

  const proNav = primaryNavigation.find((item) => item.id === 'pro');
  assert.equal(proNav?.label, 'Autark Pro');
  assert.equal(proNav?.to, '/pro');

  const api = source('src/api/proApi.ts');
  assert.match(api, /get<ProStatus>\('\/api\/pro\/status'\)/);
  assert.match(api, /post<ProStatus>\('\/api\/pro\/register'\)/);
  assert.match(api, /post<ProStatus>\('\/api\/pro\/redeem-license'/);
  assert.match(api, /post<ProStatus>\('\/api\/pro\/heartbeat\/send-now'\)/);
  assert.match(api, /post<ProStatus>\('\/api\/pro\/feed\/sync'\)/);
  assert.match(api, /post<ProStatus>\('\/api\/pro\/disable'\)/);
  assert.match(api, /get<ProPrivacyPayloadPreview>\('\/api\/pro\/privacy\/payload-preview'\)/);
  assert.doesNotMatch(api, /supabase/i);

  const page = source('src/pages/ProPage/ProPage.tsx');
  assert.match(page, /PageShell/);
  assert.match(page, /ProjectPanel/);
  assert.match(page, /ProjectInset/);
  assert.match(page, /ProjectPrimaryButton/);
  assert.match(page, /ProjectDarkControlButton/);
  assert.match(page, /Loading Autark Pro/);
  assert.match(page, /Autark Pro could not load/);
  assert.match(page, /Account linking is coming later\./);
});

test('Pro registration action updates status and uses action notifications', () => {
  const page = source('src/pages/ProPage/ProPage.tsx');

  assert.match(page, /async function registerInstall/);
  assert.match(page, /setRegistering\(true\)/);
  assert.match(page, /await ProAPIClient\.register\(\)/);
  assert.match(page, /setStatus\(registeredStatus\)/);
  assert.match(page, /showActionNotification\(\{[\s\S]*title: 'Autark Pro registered'/);
  assert.match(page, /showActionErrorNotification\(registerError, 'Autark Pro registration failed'\)/);
  assert.match(page, /Register this Autark install/);
  assert.match(page, /disabled=\{registering \|\| status\.registered \|\| redeeming\}/);
});

test('Pro license redemption trims input, avoids empty network calls, and refreshes status', () => {
  const page = source('src/pages/ProPage/ProPage.tsx');

  assert.match(page, /const \[licenseCode, setLicenseCode\]/);
  assert.match(page, /async function redeemLicense/);
  assert.match(page, /normalizeLicenseCode\(licenseCode\)/);
  assert.match(page, /setLicenseError\('Enter a license code before activating Pro\.'\)/);
  assert.match(page, /await ProAPIClient\.redeemLicense\(trimmedLicenseCode\)/);
  assert.match(page, /setStatus\(redeemedStatus\)/);
  assert.match(page, /showActionNotification\(\{[\s\S]*title: 'Autark Pro activated'/);
  assert.match(page, /showActionErrorNotification\(redeemError, 'Autark Pro activation failed'\)/);
  assert.match(page, /placeholder="AUTARK-PRO-XXXX-XXXX"/);
  assert.match(page, /Activate accountless Pro/);
});

test('Pro privacy panel loads a readable payload preview and handles preview errors', () => {
  const page = source('src/pages/ProPage/ProPage.tsx');
  const types = source('src/types/pro.ts');

  assert.match(types, /export type ProPrivacyPayloadPreview/);
  assert.match(types, /payload: Record<string, unknown>/);
  assert.match(types, /maySend: string\[\]/);
  assert.match(types, /neverSends: string\[\]/);

  assert.match(page, /const \[privacyPreview, setPrivacyPreview\]/);
  assert.match(page, /const \[privacyLoading, setPrivacyLoading\]/);
  assert.match(page, /const \[privacyError, setPrivacyError\]/);
  assert.match(page, /await ProAPIClient\.privacyPayloadPreview\(\)/);
  assert.match(page, /setPrivacyPreview\(preview\)/);
  assert.match(page, /Loading payload preview/);
  assert.match(page, /Payload preview could not load/);
  assert.match(page, /JSON\.stringify\(privacyPreview\.payload, null, 2\)/);
  assert.match(page, /May send/);
  assert.match(page, /Never sends/);
});

test('Pro manual heartbeat action requires registration and updates status', () => {
  const page = source('src/pages/ProPage/ProPage.tsx');

  assert.match(page, /const \[sendingHeartbeat, setSendingHeartbeat\]/);
  assert.match(page, /async function sendHeartbeatNow/);
  assert.match(page, /await ProAPIClient\.sendHeartbeatNow\(\)/);
  assert.match(page, /setStatus\(heartbeatStatus\)/);
  assert.match(page, /showActionNotification\(\{[\s\S]*title: 'Test heartbeat sent'/);
  assert.match(page, /showActionErrorNotification\(heartbeatError, 'Autark Pro heartbeat failed'\)/);
  assert.match(page, /Send test heartbeat/);
  assert.match(page, /Register this install before sending a heartbeat\./);
  assert.match(page, /disabled=\{sendingHeartbeat \|\| !status\.registered\}/);
});

test('Pro feed sync and local disable actions update status without cloud-side deletion controls', () => {
  const page = source('src/pages/ProPage/ProPage.tsx');
  const types = source('src/types/pro.ts');

  assert.match(types, /feedAdvisoryCount: number/);
  assert.match(types, /feedDeviceProfileCount: number/);
  assert.match(types, /feedBlueprintCount: number/);

  assert.match(page, /const \[syncingFeed, setSyncingFeed\]/);
  assert.match(page, /const \[disablingPro, setDisablingPro\]/);
  assert.match(page, /async function syncProFeed/);
  assert.match(page, /await ProAPIClient\.syncProFeed\(\)/);
  assert.match(page, /setStatus\(feedStatus\)/);
  assert.match(page, /showActionNotification\(\{[\s\S]*title: 'Pro feed synced'/);
  assert.match(page, /showActionErrorNotification\(feedError, 'Autark Pro feed sync failed'\)/);
  assert.match(page, /Sync Pro feed/);
  assert.match(page, /Advisories/);
  assert.match(page, /Device profiles/);
  assert.match(page, /Blueprints/);

  assert.match(page, /async function disableProLocally/);
  assert.match(page, /await ProAPIClient\.disableLocally\(\)/);
  assert.match(page, /setStatus\(disabledStatus\)/);
  assert.match(page, /showActionNotification\(\{[\s\S]*title: 'Autark Pro disabled locally'/);
  assert.match(page, /Disable Pro locally/);
  assert.doesNotMatch(page, /delete cloud/i);
  assert.doesNotMatch(page, /delete hosted/i);
});

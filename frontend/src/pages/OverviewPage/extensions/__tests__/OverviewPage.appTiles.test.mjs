import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  managedAppIconUrl,
  observedServiceIconUrl,
} from '../OverviewPage.appTiles.js';

test('managed app tile uses its canonical app icon', () => {
  assert.equal(managedAppIconUrl({ icon: '/app-images/pi-hole.svg' }), '/app-images/pi-hole.svg');
  assert.equal(managedAppIconUrl({ icon: '' }), null);
});

test('pinned observed service tile uses known service or catalog icon', () => {
  assert.equal(observedServiceIconUrl({ metadata: { iconUrl: '/custom/icon.svg' }, catalogAppId: 'vaultwarden' }), '/custom/icon.svg');
  assert.equal(observedServiceIconUrl({ metadata: {}, catalogAppId: 'pi-hole' }), '/app-images/pi-hole.svg');
  assert.equal(observedServiceIconUrl({ metadata: { image: 'pihole/pihole:latest' }, catalogAppId: null }), null);
});

test('home cards hide actionless controls instead of rendering generic unavailable buttons', () => {
  const cards = readFileSync(resolve(process.cwd(), 'src/pages/OverviewPage/components/HomeCards.tsx'), 'utf8');

  assert.doesNotMatch(cards, /This action is not available yet/);
});

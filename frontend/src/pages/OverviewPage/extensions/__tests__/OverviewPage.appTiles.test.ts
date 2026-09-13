import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  managedAppIconUrl,
} from '../OverviewPage.appTiles';

test('managed app tile uses its canonical app icon', () => {
  assert.equal(managedAppIconUrl({ icon: '/app-images/pi-hole.svg' }), '/app-images/pi-hole.svg');
  assert.equal(managedAppIconUrl({ appId: 'vaultwarden', image: 'vaultwarden/server:1.36.0' }), '/app-images/vaultwarden.svg');
});

test('home cards hide actionless controls instead of rendering generic unavailable buttons', () => {
  const cards = readFileSync(resolve(process.cwd(), 'src/pages/OverviewPage/components/HomeCards.tsx'), 'utf8');

  assert.doesNotMatch(cards, /This action is not available yet/);
});

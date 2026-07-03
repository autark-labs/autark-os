import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildAccessZones } from '../NetworkPage.accessZones';

test('Access zones place public, private, LAN, pinned external, and server-only resources in readable zones', () => {
  const zones = buildAccessZones({
    public: { apps: [{ appId: 'public-app', appName: 'Public App', accessUrl: 'https://public.example' }] },
    tailnet: { apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', observedAccess: { privateUrl: 'https://vault.tailnet' } }] },
    lan: { apps: [{ appId: 'homepage', appName: 'Homepage', accessUrl: 'http://192.168.1.5:3000' }] },
    local: { apps: [{ appId: 'worker', appName: 'Worker' }] },
  }, [{ id: 'obs_router', displayName: 'Router', url: 'http://192.168.1.1', pinned: true, userStatus: 'pinned_external' }]);

  assert.deepEqual(zones.map((zone) => zone.label), ['Public Internet', 'Private / Tailscale', 'Home Network', 'This Server']);
  assert.deepEqual(zones[2].apps.map((app) => app.label), ['Homepage', 'Router']);
  assert.equal(zones[2].apps[1].external, true);
  assert.equal(zones[0].apps[0].url, 'https://public.example');
});

test('Access zones make public exposure visibly off by default', () => {
  const zones = buildAccessZones({
    public: { apps: [] },
    tailnet: { apps: [] },
    lan: { apps: [] },
    local: { apps: [] },
  });

  assert.equal(zones[0].id, 'public');
  assert.equal(zones[0].label, 'Public Internet');
  assert.equal(zones[0].emptyText, 'Public access is off');
  assert.equal(zones[0].statusLabel, 'Off');
});

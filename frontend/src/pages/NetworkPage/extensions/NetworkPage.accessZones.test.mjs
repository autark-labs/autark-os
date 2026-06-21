import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccessZones } from './NetworkPage.accessZones.js';

test('Access zones place public, private, LAN, linked, and server-only resources in readable zones', () => {
  const zones = buildAccessZones({
    public: { apps: [{ appId: 'public-app', appName: 'Public App', accessUrl: 'https://public.example' }] },
    tailnet: { apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', observedAccess: { privateUrl: 'https://vault.tailnet' } }] },
    lan: { apps: [{ appId: 'homepage', appName: 'Homepage', accessUrl: 'http://192.168.1.5:3000' }] },
    local: { apps: [{ appId: 'worker', appName: 'Worker' }] },
  }, [{ id: 'ext_router', name: 'Router', url: 'http://192.168.1.1', managementMode: 'linked' }]);

  assert.deepEqual(zones.map((zone) => zone.label), ['Open Internet', 'Private / Tailscale', 'Home Network / LAN', 'This Server']);
  assert.deepEqual(zones[2].apps.map((app) => app.label), ['Homepage', 'Router']);
  assert.equal(zones[2].apps[1].linked, true);
  assert.equal(zones[0].apps[0].url, 'https://public.example');
});

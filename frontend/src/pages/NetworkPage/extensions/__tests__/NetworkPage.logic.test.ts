import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AppRuntimeView } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
import type { TailscaleStatus } from '@/types/network';
import { buildReachabilityServices } from '../NetworkPage.logic';

test('reachability services include app and observed service icon URLs', () => {
  const services = buildReachabilityServices({
    apps: [{
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      image: '/app-images/vaultwarden.svg',
      desiredAccess: { mode: 'private' },
      settings: { tailscaleEnabled: true },
      observedAccess: { privateUrl: 'https://vault.tailnet', localUrl: 'http://localhost:8080' },
    } as unknown as AppRuntimeView],
    pinnedExternalServices: [{
      id: 'obs_router',
      displayName: 'Router',
      url: 'http://192.168.1.1',
      catalogAppId: 'homepage',
      metadata: { iconUrl: '/custom/router.svg' },
      pinned: true,
      userStatus: 'pinned_external',
      userStatusLabel: 'Pinned',
    } as unknown as ObservedServiceView],
    reconciliation: null,
    tailscale: { connected: true } as unknown as TailscaleStatus,
  });

  assert.equal(services[0].iconUrl, '/app-images/vaultwarden.svg');
  assert.equal(services[1].iconUrl, '/custom/router.svg');
  assert.equal(services[0].zone, 'tailnet');
  assert.equal(services[1].zone, 'lan');
});

test('observed reachability services fall back to catalog icons', () => {
  const services = buildReachabilityServices({
    apps: [],
    pinnedExternalServices: [{
      id: 'obs_pihole',
      displayName: 'Pi-hole',
      url: 'http://192.168.1.2',
      catalogAppId: 'pi-hole',
      metadata: {},
      pinned: true,
      userStatus: 'pinned_external',
      userStatusLabel: 'Pinned',
    } as unknown as ObservedServiceView],
    reconciliation: null,
    tailscale: null,
  });

  assert.equal(services[0].iconUrl, '/app-images/pi-hole.svg');
});

test('reachability services prefer saved desired access mode before URL heuristics', () => {
  const services = buildReachabilityServices({
    apps: [
      {
        appId: 'gitea',
        appName: 'Gitea',
        accessUrl: 'http://localhost:3000',
        desiredAccess: { mode: 'local' },
        settings: { desiredAccessMode: 'network', accessUrl: 'http://localhost:3000', tailscaleEnabled: false },
      } as unknown as AppRuntimeView,
      {
        appId: 'homepage',
        appName: 'Homepage',
        accessUrl: 'http://192.168.1.40:3000',
        desiredAccess: { mode: 'network' },
        settings: { desiredAccessMode: 'local', accessUrl: 'http://192.168.1.40:3000', tailscaleEnabled: false },
      } as unknown as AppRuntimeView,
    ],
    pinnedExternalServices: [],
    reconciliation: null,
    tailscale: null,
  });

  assert.equal(services.find((service) => service.id === 'gitea')?.zone, 'lan');
  assert.equal(services.find((service) => service.id === 'homepage')?.zone, 'local');
});

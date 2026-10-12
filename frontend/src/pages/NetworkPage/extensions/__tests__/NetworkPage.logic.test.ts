import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AppRuntimeView } from '@/types/app';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationReport, TailscaleStatus } from '@/types/network';
import { buildNetworkIssues, buildReachabilityServices } from '../NetworkPage.logic';

test('reachability services include managed app icon URLs', () => {
  const services = buildReachabilityServices({
    apps: [{
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      image: '/app-images/vaultwarden.svg',
      desiredAccess: { mode: 'private' },
      settings: { tailscaleEnabled: true },
      observedAccess: { privateUrl: 'https://vault.tailnet', privateLinkStatus: 'verified', localUrl: 'http://localhost:8080' },
      accessRoute: { privateUrl: 'https://vault.tailnet', privateLinkStatus: 'verified' },
    } as unknown as AppRuntimeView],
    reconciliation: null,
    tailscale: { connected: true } as unknown as TailscaleStatus,
  });

  assert.equal(services[0].iconUrl, '/app-images/vaultwarden.svg');
  assert.equal(services[0].zone, 'tailnet');
});

test('requested but unverified private access keeps the app in its reachable local zone', () => {
  const services = buildReachabilityServices({
    apps: [{
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      accessUrl: 'http://localhost:8090',
      desiredAccess: { mode: 'private' },
      settings: { tailscaleEnabled: true },
      observedAccess: { privateUrl: null, privateLinkStatus: 'missing', localUrl: 'http://localhost:8090' },
      accessRoute: { primaryOpenUrl: 'http://localhost:8090', privateUrl: null, privateLinkStatus: 'missing' },
    } as unknown as AppRuntimeView],
    reconciliation: {
      apps: [{ appId: 'vaultwarden', status: 'missing', message: 'Private link is missing' }],
    } as never,
    tailscale: { connected: true } as unknown as TailscaleStatus,
  });

  assert.equal(services[0].zone, 'local');
  assert.equal(services[0].privateUrl, null);
  assert.equal(services[0].openUrl, 'http://localhost:8090');
  assert.equal(services[0].status, 'warning');
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
    reconciliation: null,
    tailscale: null,
  });

  assert.equal(services.find((service) => service.id === 'gitea')?.zone, 'lan');
  assert.equal(services.find((service) => service.id === 'homepage')?.zone, 'local');
});


test('waiting private-app evidence stays visible once when DNS or HTTPS is unavailable', () => {
  const issues = buildNetworkIssues({
    checks: [{ id: 'private-apps', status: 'warning', message: 'Private apps waiting' }],
    appChecks: [{ id: 'serve-vaultwarden', status: 'neutral', message: 'HTTPS unavailable' }],
  } as NetworkDiagnosticsReport, {
    apps: [{ appId: 'vaultwarden', appName: 'Vaultwarden', status: 'waiting', message: 'HTTPS unavailable', actionLabel: 'Connect this server' }],
    staleMappings: [{ id: 'unassigned', servePort: 8443 }],
  } as PrivateAccessReconciliationReport);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].appId, 'vaultwarden');
  assert.equal(issues[0].message, 'HTTPS unavailable');
  assert.equal(issues[0].actionLabel, 'Connect this server');
  assert.equal(issues[1].label, 'Unassigned link on port 8443');
});

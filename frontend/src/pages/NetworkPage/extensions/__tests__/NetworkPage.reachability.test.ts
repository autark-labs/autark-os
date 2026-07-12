import { describe, expect, it } from 'vitest';
import {
  acknowledgePendingReachability,
  applyPendingReachability,
  filterReachabilityServices,
  removePendingReachabilityForToken,
  removeServiceProcessingForToken,
  settingsForReachabilityZone,
} from '../NetworkPage.reachability';
import type { ReachabilityService } from '../NetworkPage.types';

const managedService: ReachabilityService = {
  id: 'vaultwarden',
  type: 'managed-app',
  app: null,
  label: 'Vaultwarden',
  detail: 'Ready on this server',
  zone: 'local',
  openUrl: 'http://vaultwarden.local',
  status: 'connected',
  statusLabel: 'Ready',
  draggable: true,
  issue: null,
  privateUrl: null,
  localUrl: 'http://vaultwarden.local',
  iconUrl: null,
};

const externalService: ReachabilityService = {
  ...managedService,
  id: 'paperless',
  type: 'external-service',
  label: 'Paperless',
  detail: 'Linked service',
  issue: 'This link needs attention.',
};

describe('NetworkPage reachability helpers', () => {
  it('matches search and service-type filters without hiding an attention service', () => {
    expect(filterReachabilityServices([managedService, externalService], 'vault', [])).toEqual([managedService]);
    expect(filterReachabilityServices([managedService, externalService], '', ['external'])).toEqual([externalService]);
    expect(filterReachabilityServices([managedService, externalService], '', ['attention'])).toEqual([externalService]);
    expect(filterReachabilityServices([managedService, externalService], '', ['managed', 'attention']))
      .toEqual([managedService, externalService]);
  });

  it('shows an optimistic zone only until its matching canonical result settles', () => {
    const pending = { vaultwarden: { acknowledged: false, token: 3, zone: 'tailnet' as const } };
    expect(applyPendingReachability([managedService], pending)).toMatchObject([
      { zone: 'tailnet', statusLabel: 'Processing' },
    ]);

    const acknowledged = acknowledgePendingReachability(pending, 'vaultwarden', 3);
    expect(acknowledged.vaultwarden.acknowledged).toBe(true);
    expect(removePendingReachabilityForToken(acknowledged, 'vaultwarden', 2)).toBe(acknowledged);
    expect(removePendingReachabilityForToken(acknowledged, 'vaultwarden', 3)).toEqual({});
    expect(removeServiceProcessingForToken({ vaultwarden: 3 }, 'vaultwarden', 2)).toEqual({ vaultwarden: 3 });
  });

  it('builds LAN settings that turn off private access while preserving safe defaults', () => {
    const app = {
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      accessUrl: 'http://vaultwarden.local',
      settings: null,
      desiredAccess: null,
      observedAccess: null,
    };

    expect(settingsForReachabilityZone(app as never, 'lan')).toMatchObject({
      accessUrl: 'http://vaultwarden.local',
      autoRepairEnabled: true,
      desiredAccessMode: 'network',
      privateAccessRequirement: 'disabled',
      tailscaleEnabled: false,
    });
  });
});

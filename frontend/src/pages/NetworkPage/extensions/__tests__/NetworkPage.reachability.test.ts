import { describe, expect, it } from 'vitest';
import {
  filterReachabilityServices,
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

const attentionService: ReachabilityService = {
  ...managedService,
  id: 'paperless',
  type: 'managed-app',
  label: 'Paperless',
  detail: 'Managed app needs attention',
  issue: 'This link needs attention.',
};

describe('NetworkPage reachability helpers', () => {
  it('matches search and service-type filters without hiding an attention service', () => {
    expect(filterReachabilityServices([managedService, attentionService], 'vault', [])).toEqual([managedService]);
    expect(filterReachabilityServices([managedService, attentionService], '', ['attention'])).toEqual([attentionService]);
    expect(filterReachabilityServices([managedService, attentionService], '', ['managed', 'attention']))
      .toEqual([managedService, attentionService]);
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
  it('keeps private-only distinct from the explicit LAN plus private selection', () => {
    const app = { settings: { backup: { enabled: true, frequency: 'hourly', retention: 7 } } } as never;
    expect(settingsForReachabilityZone(app, 'tailnet')).toMatchObject({ desiredAccessMode: 'private', tailscaleEnabled: true, privateAccessRequirement: 'required', backup: { frequency: 'hourly' } });
    expect(settingsForReachabilityZone(app, 'lan-and-private')).toMatchObject({ desiredAccessMode: 'local-and-private', tailscaleEnabled: true });
  });

});

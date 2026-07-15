import { describe, expect, it } from 'vitest';
import {
  emptyStateForApplicationCollection,
  matchesCollectionFilters,
  settingsFromFormValues,
} from '../ApplicationsPage.presentation';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationSurfaceItem } from '../ApplicationsPage.types';
import { buildApplicationSurfaceItems } from '../ApplicationsPage.liveModel';

const managedItem = {
  managementState: 'managed',
  attentionState: 'none',
} as ApplicationSurfaceItem;

const linkedItem = {
  managementState: 'linked',
  attentionState: 'needs_review',
} as ApplicationSurfaceItem;

describe('My Apps presentation helpers', () => {
  it('keeps linked services visible to the matching and attention filters', () => {
    expect(matchesCollectionFilters(managedItem, ['managed'])).toBe(true);
    expect(matchesCollectionFilters(linkedItem, ['linked'])).toBe(true);
    expect(matchesCollectionFilters(linkedItem, ['attention'])).toBe(true);
    expect(matchesCollectionFilters(managedItem, ['linked'])).toBe(false);
    expect(emptyStateForApplicationCollection(['linked'], '')).toMatchObject({ title: 'No linked services' });
  });

  it('preserves canonical settings while applying the values from the app form', () => {
    const app = {
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      accessUrl: 'http://vaultwarden.local:8080',
      settings: {
        autoRepairEnabled: true,
        backup: { enabled: true, frequency: 'daily', retention: 7 },
        desiredAccessMode: 'local',
        expectedLocalPort: 8080,
        expectedProtocol: 'http',
        storageSubfolders: { data: 'data' },
        tailscaleEnabled: false,
      },
    } as AppRuntimeView;

    expect(settingsFromFormValues(app, {
      autoRepairEnabled: false,
      backupEnabled: false,
      backupFrequency: 'weekly',
      backupRetention: 14,
      expectedProtocol: 'https',
      localPort: 8443,
    })).toMatchObject({
      accessUrl: 'https://vaultwarden.local:8443',
      autoRepairEnabled: false,
      backup: { enabled: false, frequency: 'weekly', retention: 14 },
      storageSubfolders: { data: 'data' },
    });
  });

  it('keeps an unverified stored private URL out of My Apps links and open actions', () => {
    const app = {
      appId: 'vaultwarden',
      appName: 'Vaultwarden',
      accessUrl: 'http://localhost:8090',
      friendlyStatus: 'Ready',
      canonicalAccessState: 'private_needs_setup',
      accessRoute: {
        localUrl: 'http://localhost:8090',
        primaryOpenUrl: 'https://autark-os.tailnet.test:14743',
        privateUrl: 'https://autark-os.tailnet.test:14743',
        privateLinkStatus: 'missing',
      },
      observedAccess: {
        localUrl: 'http://localhost:8090',
        privateUrl: null,
        privateLinkStatus: 'missing',
      },
      settings: {
        accessUrl: 'http://localhost:8090',
        privateAccessUrl: 'https://autark-os.tailnet.test:14743',
        tailscaleEnabled: true,
      },
    } as AppRuntimeView;

    const [item] = buildApplicationSurfaceItems({
      accessByAppId: {},
      apps: [app],
      healthByAppId: {},
      observedServices: [],
      telemetryByAppId: {},
    });

    expect(item.href).toBe('http://localhost:8090');
    expect(item.links.primaryUrl).toBe('http://localhost:8090');
    expect(item.links.privateUrl).toBeUndefined();
    expect(item.settings.privateAccessUrl).toBeUndefined();
  });
});

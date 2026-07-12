import { describe, expect, it } from 'vitest';
import {
  emptyStateForApplicationCollection,
  matchesCollectionFilters,
  settingsFromFormValues,
} from '../ApplicationsPage.presentation';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationSurfaceItem } from '../ApplicationsPage.types';

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
});

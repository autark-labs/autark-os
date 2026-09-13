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

const attentionItem = {
  managementState: 'managed',
  attentionState: 'needs_review',
} as ApplicationSurfaceItem;

describe('My Apps presentation helpers', () => {
  it('filters managed apps by ownership and attention state', () => {
    expect(matchesCollectionFilters(managedItem, ['managed'])).toBe(true);
    expect(matchesCollectionFilters(attentionItem, ['attention'])).toBe(true);
    expect(matchesCollectionFilters(managedItem, ['attention'])).toBe(false);
    expect(emptyStateForApplicationCollection([], '')).toMatchObject({ title: 'No managed apps' });
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
      localPort: 8443,
    })).toMatchObject({
      accessUrl: 'http://vaultwarden.local:8443',
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
      applications: [{
        id: app.appId, name: app.appName, category: 'Security', image: '', summary: '', description: '', relationship: 'managed',
        catalogAvailability: 'installable', appInstanceId: app.appId, runtimeState: 'running', ownershipState: 'owned', accessState: 'private_needs_setup',
        backupState: 'backup_disabled', issues: [], relationshipLabel: 'Installed', relationshipDescription: '', statusTone: 'success', cardTone: 'success',
        installCopyWarningRequired: false, reviewExistingHref: null, primaryAction: { id: 'manage', label: 'Manage', kind: 'route', href: '/apps', method: null, disabled: false, reason: '' },
        availableActions: [], runtime: app, evidence: null,
      }],
    });

    expect(item.href).toBe('http://localhost:8090');
    expect(item.links.primaryUrl).toBe('http://localhost:8090');
    expect(item.links.privateUrl).toBeUndefined();
    expect(item.settings.privateAccessUrl).toBeUndefined();
  });
});

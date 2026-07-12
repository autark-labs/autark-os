import type { AppRuntimeView, AppSettingsChangePlan, InstallSettings } from '@/types/app';
import type {
  ApplicationEmptyState,
  ApplicationRuntimeAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
  ApplicationSurfaceItem,
} from './ApplicationsPage.types';

export type ApplicationCollectionFilter = 'managed' | 'linked' | 'attention';

/** Maps an app's canonical settings into the form contract used by My Apps. */
export function settingsFromFormValues(app: AppRuntimeView, values: ApplicationSettingsFormValues): InstallSettings {
  const currentSettings = settingsWithDefaults(app);
  const protocol = values.expectedProtocol || currentSettings.expectedProtocol || 'http';
  const accessUrl = accessUrlWithPort(currentSettings.accessUrl ?? app.accessUrl, protocol, values.localPort ?? currentSettings.expectedLocalPort);

  return {
    ...currentSettings,
    autoRepairEnabled: values.autoRepairEnabled,
    accessUrl,
    backup: {
      enabled: values.backupEnabled,
      frequency: values.backupFrequency,
      retention: values.backupRetention,
    },
    expectedLocalPort: values.localPort,
    expectedProtocol: protocol,
  };
}

export function settingsImpactFromPlan(plan: AppSettingsChangePlan): ApplicationSettingsImpact {
  return {
    blockedReasons: plan.blockedReasons,
    changes: plan.changes,
    headline: plan.headline,
    redeployRequired: plan.redeployRequired,
    restartRequired: Boolean(plan.restartRequired || plan.redeployRequired),
    saveAllowed: plan.saveAllowed,
    summary: plan.summary || plan.headline,
    warnings: [...plan.warnings, ...plan.blockedReasons],
  };
}

export function matchesCollectionFilters(item: ApplicationSurfaceItem, filters: ApplicationCollectionFilter[]) {
  if (!filters.length) return true;
  return filters.some((filter) => (
    (filter === 'managed' && item.managementState === 'managed')
    || (filter === 'linked' && item.managementState === 'linked')
    || (filter === 'attention' && item.attentionState !== 'none')
  ));
}

export function emptyStateForApplicationCollection(filters: ApplicationCollectionFilter[], query: string): ApplicationEmptyState {
  if (query.trim()) {
    return {
      title: 'No matching apps or linked services',
      description: 'Adjust the search or app-type filters to see the matching services.',
    };
  }
  if (filters.length === 1 && filters[0] === 'linked') {
    return {
      title: 'No linked services',
      description: 'Link a service from the existing-app review flow to keep it visible here without managing its runtime.',
    };
  }
  if (filters.length === 1 && filters[0] === 'attention') {
    return {
      title: 'No apps need review',
      description: 'The managed apps and linked services in this view are not asking for action right now.',
    };
  }
  return {
    title: 'No managed apps or linked services',
    description: 'Install an app from Discover or link an existing service to keep it visible without managing its runtime.',
  };
}

export function appActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Start';
  if (action === 'stop') return 'Pause';
  if (action === 'restart') return 'Restart';
  if (action === 'repair') return 'Repair';
  if (action === 'backup') return 'Backup';
  return 'App action';
}

function settingsWithDefaults(app: AppRuntimeView): InstallSettings {
  return {
    accessUrl: app.settings?.accessUrl ?? app.accessUrl ?? null,
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
    backup: {
      enabled: app.settings?.backup?.enabled ?? true,
      frequency: app.settings?.backup?.frequency || 'daily',
      retention: app.settings?.backup?.retention ?? 7,
    },
    desiredAccessMode: app.settings?.desiredAccessMode || app.desiredAccess?.mode || 'local',
    expectedLocalPort: app.settings?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? app.observedAccess?.localPort ?? null,
    expectedProtocol: app.settings?.expectedProtocol ?? app.desiredAccess?.expectedProtocol ?? app.observedAccess?.protocol ?? null,
    lastAccessCheckAt: app.settings?.lastAccessCheckAt ?? app.observedAccess?.lastAccessCheckAt ?? null,
    lastRepairAttemptAt: app.settings?.lastRepairAttemptAt ?? app.observedAccess?.lastRepairAttemptAt ?? null,
    lastRepairStatus: app.settings?.lastRepairStatus ?? app.observedAccess?.lastRepairStatus ?? null,
    lastSuccessfulAccessAt: app.settings?.lastSuccessfulAccessAt ?? app.observedAccess?.lastSuccessfulAccessAt ?? null,
    privateAccessRequirement: app.settings?.privateAccessRequirement || app.desiredAccess?.privateAccessRequirement || 'optional',
    privateAccessUrl: app.settings?.privateAccessUrl ?? app.accessRoute?.privateUrl ?? app.observedAccess?.privateUrl ?? null,
    storageSubfolders: app.settings?.storageSubfolders ?? {},
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled),
  };
}

function accessUrlWithPort(currentUrl: string | null | undefined, protocol: string, port: number | null | undefined) {
  if (!port) return currentUrl ?? null;
  try {
    const parsed = new URL(currentUrl || `${protocol}://localhost:${port}`);
    parsed.protocol = `${protocol}:`;
    parsed.port = String(port);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return `${protocol}://localhost:${port}`;
  }
}

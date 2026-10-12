import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { ReachabilityService, ReachabilityTypeFilter, ReachabilityZoneId } from './NetworkPage.types';

/** Keeps Matrix filtering consistent across the desktop and mobile layouts. */
export function filterReachabilityServices(
  services: ReachabilityService[],
  query: string,
  filters: ReachabilityTypeFilter[],
) {
  const normalizedQuery = query.trim().toLowerCase();
  return services.filter((service) => {
    if (normalizedQuery) {
      const searchable = `${service.label} ${service.detail} ${service.statusLabel}`.toLowerCase();
      if (!searchable.includes(normalizedQuery)) return false;
    }
    if (filters.length === 0) return true;
    return filters.some((filter) => {
      if (filter === 'attention') return Boolean(service.issue);
      return service.type === 'managed-app';
    });
  });
}

export function settingsForReachabilityZone(
  app: AppRuntimeView,
  zone: Exclude<ReachabilityZoneId, 'public'> | 'lan-and-private',
): InstallSettings {
  const desiredAccessMode = zone === 'lan-and-private' ? 'local-and-private' : zone === 'tailnet' ? 'private' : zone === 'lan' ? 'network' : 'local';
  const privateEnabled = desiredAccessMode === 'private' || desiredAccessMode === 'local-and-private';
  return {
    accessUrl: app.settings?.accessUrl ?? app.accessUrl ?? app.observedAccess?.localUrl ?? null,
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
    backup: {
      enabled: app.settings?.backup?.enabled ?? true,
      frequency: app.settings?.backup?.frequency || 'daily',
      retention: app.settings?.backup?.retention ?? 7,
    },
    desiredAccessMode,
    expectedLocalPort: app.settings?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? app.observedAccess?.localPort ?? null,
    expectedProtocol: app.settings?.expectedProtocol ?? app.desiredAccess?.expectedProtocol ?? app.observedAccess?.protocol ?? null,
    lastAccessCheckAt: app.settings?.lastAccessCheckAt ?? app.observedAccess?.lastAccessCheckAt ?? null,
    lastRepairAttemptAt: app.settings?.lastRepairAttemptAt ?? app.observedAccess?.lastRepairAttemptAt ?? null,
    lastRepairStatus: app.settings?.lastRepairStatus ?? app.observedAccess?.lastRepairStatus ?? null,
    lastSuccessfulAccessAt: app.settings?.lastSuccessfulAccessAt ?? app.observedAccess?.lastSuccessfulAccessAt ?? null,
    privateAccessRequirement: privateEnabled ? 'required' : 'disabled',
    privateAccessUrl: null,
    storageSubfolders: app.settings?.storageSubfolders ?? {},
    tailscaleEnabled: privateEnabled,
  };
}

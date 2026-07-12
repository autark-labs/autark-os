import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { ReachabilityService, ReachabilityTypeFilter, ReachabilityZoneId } from './NetworkPage.types';

export type PendingReachability = {
  acknowledged: boolean;
  token: number;
  zone: ReachabilityZoneId;
};

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
      if (filter === 'managed') return service.type === 'managed-app';
      return service.type === 'external-service';
    });
  });
}

/** Shows the selected zone while the canonical app-state refresh catches up. */
export function applyPendingReachability(
  services: ReachabilityService[],
  pendingByServiceId: Record<string, PendingReachability>,
) {
  return services.map((service) => {
    const pendingZone = pendingByServiceId[service.id]?.zone;
    if (!pendingZone || pendingZone === service.zone) return service;
    return {
      ...service,
      detail: processingReachabilityDetail(pendingZone),
      statusLabel: 'Processing',
      zone: pendingZone,
    };
  });
}

export function setServiceProcessingToken(current: Record<string, number>, serviceId: string, token: number) {
  return { ...current, [serviceId]: token };
}

export function removeServiceProcessingForToken(current: Record<string, number>, serviceId: string, token: number) {
  if (current[serviceId] !== token) return current;
  const next = { ...current };
  delete next[serviceId];
  return next;
}

export function acknowledgePendingReachability(
  current: Record<string, PendingReachability>,
  serviceId: string,
  token: number,
) {
  if (current[serviceId]?.token !== token) return current;
  return {
    ...current,
    [serviceId]: { ...current[serviceId], acknowledged: true },
  };
}

export function removePendingReachabilityForToken(
  current: Record<string, PendingReachability>,
  serviceId: string,
  token: number,
) {
  if (current[serviceId]?.token !== token) return current;
  return removePendingReachability(current, serviceId);
}

export function removePendingReachabilityIds(
  current: Record<string, PendingReachability>,
  serviceIds: string[],
) {
  const next = { ...current };
  for (const serviceId of serviceIds) delete next[serviceId];
  return next;
}

export function removeServiceProcessingIds(current: Record<string, number>, serviceIds: string[]) {
  const next = { ...current };
  for (const serviceId of serviceIds) delete next[serviceId];
  return next;
}

export function isPrivateAccessApp(app: AppRuntimeView) {
  const desiredMode = app.settings?.desiredAccessMode || app.desiredAccess?.mode;
  return Boolean(app.settings?.tailscaleEnabled || desiredMode === 'private' || desiredMode === 'local-and-private');
}

export function appWithReachabilityZone(
  app: AppRuntimeView,
  zone: Exclude<ReachabilityZoneId, 'tailnet' | 'public'>,
): AppRuntimeView {
  const desiredAccessMode = reachabilityZoneAccessMode(zone);
  return {
    ...app,
    desiredAccess: app.desiredAccess ? {
      ...app.desiredAccess,
      mode: desiredAccessMode,
      privateAccessRequirement: 'disabled',
      privateUrl: null,
    } : app.desiredAccess,
    settings: {
      ...(app.settings ?? settingsForReachabilityZone(app, zone)),
      desiredAccessMode,
      privateAccessRequirement: 'disabled',
      privateAccessUrl: null,
      tailscaleEnabled: false,
    },
  };
}

export function settingsForReachabilityZone(
  app: AppRuntimeView,
  zone: Exclude<ReachabilityZoneId, 'tailnet' | 'public'>,
): InstallSettings {
  const desiredAccessMode = reachabilityZoneAccessMode(zone);
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
    privateAccessRequirement: 'disabled',
    privateAccessUrl: null,
    storageSubfolders: app.settings?.storageSubfolders ?? {},
    tailscaleEnabled: false,
  };
}

function processingReachabilityDetail(zone: ReachabilityZoneId) {
  if (zone === 'tailnet') return 'Autark-OS is turning on private Tailnet access.';
  if (zone === 'lan') return 'Autark-OS is saving home-network reachability.';
  if (zone === 'local') return 'Autark-OS is moving this service back to this server.';
  return 'Autark-OS is updating this service.';
}

function removePendingReachability(current: Record<string, PendingReachability>, serviceId: string) {
  const next = { ...current };
  delete next[serviceId];
  return next;
}

function reachabilityZoneAccessMode(zone: Exclude<ReachabilityZoneId, 'tailnet' | 'public'>) {
  return zone === 'lan' ? 'network' : 'local';
}

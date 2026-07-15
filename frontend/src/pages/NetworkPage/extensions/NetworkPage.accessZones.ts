import type { AppRuntimeView } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
import type { AppExposureGroup } from './NetworkPage.types';

type ZoneAppSource = AppRuntimeView | ObservedServiceView;

export function buildAccessZones(
  exposureGroups: Record<string, AppExposureGroup>,
  pinnedExternalServices: ObservedServiceView[] = [],
) {
  return [
    zone('public', 'Public Internet', exposureGroups?.public?.apps || [], 'Public access is off', 'Off'),
    zone('tailnet', 'Private / Tailscale', exposureGroups?.tailnet?.apps || [], 'No private links yet'),
    zone('lan', 'Home Network', [...(exposureGroups?.lan?.apps || []), ...pinnedExternalServices], 'No home network links yet'),
    zone('local', 'This Server', exposureGroups?.local?.apps || [], 'No server-only apps'),
  ];
}

export function zoneAppChip(item: ZoneAppSource) {
  if ('displayName' in item) {
    return {
      id: item.id,
      label: item.displayName,
      url: item.url || '',
      external: true,
      status: item.userStatus === 'pinned_external' || item.pinned ? 'Pinned external' : item.userStatusLabel,
    };
  }
  return {
    id: item.appId,
    label: item.appName,
    url: item.accessRoute?.privateLinkStatus === 'verified' && item.accessRoute.privateUrl
      ? item.accessRoute.privateUrl
      : item.accessRoute?.localUrl || item.observedAccess?.localUrl || item.accessUrl || item.settings?.accessUrl || '',
    external: false,
    status: item.friendlyStatus || item.canonicalUserStatus || 'Unknown',
  };
}

function zone(id: string, label: string, apps: ZoneAppSource[], emptyText: string, emptyStatusLabel = '0') {
  return {
    id,
    label,
    emptyText,
    statusLabel: apps.length ? String(apps.length) : emptyStatusLabel,
    apps: apps.map(zoneAppChip),
  };
}

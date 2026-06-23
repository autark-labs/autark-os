export function buildAccessZones(exposureGroups, pinnedExternalServices = []) {
  return [
    zone('public', 'Open Internet', exposureGroups?.public?.apps || [], 'No apps exposed publicly'),
    zone('tailnet', 'Private / Tailscale', exposureGroups?.tailnet?.apps || [], 'No private links yet'),
    zone('lan', 'Home Network / LAN', [...(exposureGroups?.lan?.apps || []), ...pinnedExternalServices], 'No LAN links yet'),
    zone('local', 'This Server', exposureGroups?.local?.apps || [], 'No server-only apps'),
  ];
}

export function zoneAppChip(item) {
  if (item.userStatus === 'pinned_external' || item.pinned) {
    return {
      id: item.id,
      label: item.displayName || item.name,
      url: item.url,
      external: true,
      status: 'Pinned external',
    };
  }
  return {
    id: item.appId,
    label: item.appName,
    url: item.accessRoute?.primaryOpenUrl || item.settings?.privateAccessUrl || item.observedAccess?.privateUrl || item.accessRoute?.localUrl || item.observedAccess?.localUrl || item.accessUrl || item.settings?.accessUrl || '',
    external: false,
    status: item.friendlyStatus || item.canonicalUserStatus || 'Unknown',
  };
}

function zone(id, label, apps, emptyText) {
  return {
    id,
    label,
    emptyText,
    apps: apps.map(zoneAppChip),
  };
}

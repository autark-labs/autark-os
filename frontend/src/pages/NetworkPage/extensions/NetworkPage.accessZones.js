export function buildAccessZones(exposureGroups, linkedServices = []) {
  return [
    zone('public', 'Open Internet', exposureGroups?.public?.apps || [], 'No apps exposed publicly'),
    zone('tailnet', 'Private / Tailscale', exposureGroups?.tailnet?.apps || [], 'No private links yet'),
    zone('lan', 'Home Network / LAN', [...(exposureGroups?.lan?.apps || []), ...linkedServices], 'No LAN links yet'),
    zone('local', 'This Server', exposureGroups?.local?.apps || [], 'No server-only apps'),
  ];
}

export function zoneAppChip(item) {
  if (item.managementMode === 'linked') {
    return {
      id: item.id,
      label: item.name,
      url: item.url,
      linked: true,
      status: 'Linked',
    };
  }
  return {
    id: item.appId,
    label: item.appName,
    url: item.observedAccess?.privateUrl || item.observedAccess?.localUrl || item.accessUrl || item.settings?.privateAccessUrl || item.settings?.accessUrl || '',
    linked: false,
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

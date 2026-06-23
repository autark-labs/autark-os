export function pinnedExternalServiceCard(service) {
  return {
    id: service.id,
    title: service.displayName || service.name,
    subtitle: `${service.category || 'External'} - ${service.accessScope || 'LAN'}`,
    url: service.url,
    status: 'Pinned',
    managementMode: 'pinned_external',
    primaryAction: 'Open',
    secondaryAction: 'Review service',
  };
}

export function appCardPrimaryUrl(app) {
  return app.accessRoute?.primaryOpenUrl
    || app.settings?.privateAccessUrl
    || app.observedAccess?.privateUrl
    || app.accessRoute?.localUrl
    || app.observedAccess?.localUrl
    || app.accessUrl
    || app.settings?.accessUrl
    || '';
}

export function linkedServiceCard(service) {
  return {
    id: service.id,
    title: service.name,
    subtitle: `${service.category || 'External'} - ${service.accessScope || 'LAN'}`,
    url: service.url,
    status: 'Linked',
    managementMode: 'linked',
    primaryAction: 'Open',
    secondaryAction: 'Manage link',
  };
}

export function appCardPrimaryUrl(app) {
  return app.observedAccess?.privateUrl || app.observedAccess?.localUrl || app.accessUrl || app.settings?.privateAccessUrl || app.settings?.accessUrl || '';
}

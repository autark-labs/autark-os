export function visibleResolveExistingServices(services = []) {
  return services
    .filter((service) => !service.managedByThisAutarkOs && service.userStatus !== 'installed_managed')
    .sort((left, right) => servicePriority(left) - servicePriority(right) || left.displayName.localeCompare(right.displayName));
}

export function resolveExistingServiceActions(service) {
  if (!service) {
    return [];
  }
  const actions = [];
  if (service.url) {
    actions.push({ id: 'open', label: 'Open', href: service.url });
  }
  actions.push({ id: 'review', label: 'Review', href: null });
  const pinAction = (service.availableActions || []).find((action) => action.id === 'pin');
  if (pinAction && !pinAction.disabled && !service.pinned) {
    actions.push({ id: 'pin', label: pinAction.label || 'Pin to My Apps', href: null });
  }
  return actions;
}

function servicePriority(service) {
  if (service.userStatus === 'failed_install') return 0;
  if (service.userStatus === 'recoverable') return 0;
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 1;
  if (service.userStatus === 'found_on_server') return 2;
  if (service.userStatus === 'pinned_external') return 3;
  return 4;
}

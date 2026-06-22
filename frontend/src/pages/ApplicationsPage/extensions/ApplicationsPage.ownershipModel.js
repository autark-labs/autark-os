export function splitOwnershipViews(views = []) {
  const managed = views.filter((view) => view.state === 'installed_managed' && view.installed && view.ownedByCurrentInstance);
  const pinned = views.filter((view) => view.state === 'pinned_external');
  return {
    managed,
    pinned,
    main: [...managed, ...pinned],
    observed: views.filter((view) => ['pinned_external', 'found_on_server', 'recoverable', 'managed_elsewhere', 'blocked'].includes(view.state)),
  };
}

export function observedServicesWithoutOwnership(observedServices = [], ownershipViews = []) {
  const representedServiceIds = new Set(
    ownershipViews
      .map((view) => view.observedService?.id)
      .filter(Boolean),
  );

  return observedServices
    .filter((service) => !representedServiceIds.has(service.id))
    .map((service) => ({
      catalogAppId: service.catalogAppId || '',
      name: service.displayName,
      category: service.category || 'External',
      image: '',
      summary: service.userStatusDescription || 'Observed service',
      description: service.userStatusDescription || 'Observed service',
      state: service.userStatus || (service.pinned ? 'pinned_external' : 'found_on_server'),
      stateLabel: service.userStatusLabel || (service.pinned ? 'Pinned' : 'Found'),
      stateDescription: service.userStatusDescription || 'Project OS observes this service but does not manage its runtime.',
      statusTone: serviceTone(service),
      cardTone: serviceCardTone(service),
      installed: false,
      ownedByCurrentInstance: false,
      installCopyWarningRequired: Boolean(service.catalogAppId || service.duplicateInstallWarningRequired),
      reviewExistingHref: `/apps?service=${encodeURIComponent(service.id)}`,
      primaryAction: {
        id: 'review_existing',
        label: 'Review existing service',
        kind: 'route',
        href: `/apps?service=${encodeURIComponent(service.id)}`,
        method: null,
        disabled: false,
        reason: '',
      },
      availableActions: [
        {
          id: 'open',
          label: 'Open',
          kind: 'external',
          href: service.url,
          method: null,
          disabled: false,
          reason: '',
        },
        {
          id: 'review_existing',
          label: 'Review existing service',
          kind: 'route',
          href: `/apps?service=${encodeURIComponent(service.id)}`,
          method: null,
          disabled: false,
          reason: '',
        },
      ],
      installedApp: null,
      foundResource: null,
      observedService: service,
    }));
}

export function pinnedExternalViewsFromObservedServices(observedServices = []) {
  return observedServices
    .filter((service) => service.pinned || service.userStatus === 'pinned_external')
    .map((service) => observedServiceOwnershipView(service));
}

function observedServiceOwnershipView(service) {
  return {
    catalogAppId: service.catalogAppId || '',
    name: service.displayName,
    category: service.category || 'External',
    image: '',
    summary: service.userStatusDescription || 'Pinned external service',
    description: service.userStatusDescription || 'Pinned external service',
    state: service.userStatus,
    stateLabel: service.userStatusLabel || 'Pinned',
    stateDescription: service.userStatusDescription || 'Pinned to My Apps. Project OS can open it but does not manage its runtime.',
    statusTone: 'info',
    cardTone: 'info',
    installed: false,
    ownedByCurrentInstance: false,
    installCopyWarningRequired: Boolean(service.catalogAppId || service.duplicateInstallWarningRequired),
    reviewExistingHref: `/apps?service=${encodeURIComponent(service.id)}`,
    primaryAction: {
      id: 'review_existing',
      label: 'Review existing service',
      kind: 'route',
      href: `/apps?service=${encodeURIComponent(service.id)}`,
      method: null,
      disabled: false,
      reason: '',
    },
    availableActions: service.availableActions || [],
    installedApp: null,
    foundResource: null,
    observedService: service,
  };
}

function serviceTone(service) {
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  if (service.userStatus === 'recoverable') return 'warning';
  if (service.userStatus === 'pinned_external') return 'info';
  return 'neutral';
}

function serviceCardTone(service) {
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  if (service.userStatus === 'recoverable') return 'warning';
  if (service.userStatus === 'pinned_external') return 'info';
  if (service.userStatus === 'found_on_server') return 'observed';
  return 'neutral';
}

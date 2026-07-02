const APPLICATIONS_PATH = '/apps';
const FOCUS_KINDS = new Set(['managed', 'app', 'service', 'observed', 'catalog']);
const MANAGEMENT_PANEL = 'manage';

export function applicationDeepLinkForManagedApp(appId, options = {}) {
  return applicationDeepLink('managed', appId, options);
}

export function applicationDeepLinkForObservedService(service, options = {}) {
  if (service?.id) {
    return applicationDeepLink('service', service.id, options);
  }
  if (service?.catalogAppId) {
    return applicationDeepLink('catalog', service.catalogAppId, options);
  }
  return APPLICATIONS_PATH;
}

export function applicationDeepLinkForSurfaceItem(item, options = {}) {
  if (!item) {
    return APPLICATIONS_PATH;
  }

  const itemId = item.sourceId || item.id;
  if (item.managementState === 'managed' && itemId) {
    return applicationDeepLink('managed', itemId, options);
  }
  if ((item.managementState === 'found' || item.managementState === 'linked') && item.sourceId) {
    return applicationDeepLink('service', item.sourceId, options);
  }
  if (item.catalogAppId) {
    return applicationDeepLink('catalog', item.catalogAppId, options);
  }
  return APPLICATIONS_PATH;
}

export function applicationRouteWithManagementPanel(href) {
  if (!href) {
    return href;
  }

  const parsed = parseAppRelativeUrl(href);
  if (!parsed || parsed.pathname !== APPLICATIONS_PATH || !parsed.searchParams.get('focus')) {
    return href;
  }

  parsed.searchParams.set('panel', MANAGEMENT_PANEL);
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

export function parseApplicationsDeepLink(search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawFocus = params.get('focus') || legacyFocusParam(params);
  const separatorIndex = rawFocus.indexOf(':');
  const rawKind = separatorIndex >= 0 ? rawFocus.slice(0, separatorIndex) : '';
  const id = separatorIndex >= 0 ? rawFocus.slice(separatorIndex + 1).trim() : '';
  const kind = normalizeKind(rawKind);
  const panel = params.get('panel') === MANAGEMENT_PANEL ? MANAGEMENT_PANEL : null;
  const tab = params.get('tab') || null;

  if (!kind || !id) {
    return {
      id: null,
      key: '',
      kind: null,
      panel,
      tab,
    };
  }

  return {
    id,
    key: `${kind}:${id}:${panel || ''}:${tab || ''}`,
    kind,
    panel,
    tab,
  };
}

function legacyFocusParam(params) {
  const serviceId = params.get('service');
  if (serviceId) {
    return `service:${serviceId}`;
  }
  const appId = params.get('app');
  if (appId) {
    return `managed:${appId}`;
  }
  return '';
}

export function findApplicationDeepLinkTarget(items, target) {
  if (!target?.kind || !target.id) {
    return null;
  }

  return items.find((item) => matchesApplicationDeepLinkTarget(item, target)) ?? null;
}

export function filterForApplicationDeepLinkTarget(item) {
  if (item?.managementState === 'managed') {
    return 'managed';
  }
  if (item?.managementState === 'linked') {
    return 'pinned';
  }
  if (item?.managementState === 'found') {
    return 'found';
  }
  return 'all';
}

function applicationDeepLink(kind, id, options = {}) {
  if (!id) {
    return APPLICATIONS_PATH;
  }

  const params = new URLSearchParams();
  params.set('focus', `${kind}:${id}`);
  if (options.panel === MANAGEMENT_PANEL) {
    params.set('panel', MANAGEMENT_PANEL);
  }
  if (options.tab) {
    params.set('tab', options.tab);
  }
  return `${APPLICATIONS_PATH}?${params.toString()}`;
}

function parseAppRelativeUrl(href) {
  try {
    return new URL(href, 'http://project-os.local');
  } catch {
    return null;
  }
}

function normalizeKind(kind) {
  if (!FOCUS_KINDS.has(kind)) {
    return null;
  }
  if (kind === 'app') {
    return 'managed';
  }
  if (kind === 'observed') {
    return 'service';
  }
  return kind;
}

function matchesApplicationDeepLinkTarget(item, target) {
  const itemIds = new Set([item.id, item.sourceId].filter(Boolean));
  if (target.kind === 'managed') {
    return item.managementState === 'managed' && itemIds.has(target.id);
  }
  if (target.kind === 'service') {
    return item.managementState !== 'managed' && itemIds.has(target.id);
  }
  if (target.kind === 'catalog') {
    return item.catalogAppId === target.id || itemIds.has(target.id);
  }
  return false;
}

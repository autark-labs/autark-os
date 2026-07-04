import type { ReachabilityService } from './NetworkPage.types';

const ACCESS_PATH = '/access';
const ACCESS_TABS = new Set(['matrix', 'issues', 'devices', 'advanced']);
const FOCUS_KINDS = new Set(['managed', 'app', 'service', 'observed']);

type AccessDeepLinkKind = 'managed' | 'service';
export type AccessDeepLinkTab = 'matrix' | 'issues' | 'devices' | 'advanced';

export type AccessDeepLinkTarget = {
  id: string | null;
  key: string;
  kind: AccessDeepLinkKind | null;
  tab: AccessDeepLinkTab;
};

export function accessDeepLinkForService(service: ReachabilityService | null | undefined, options: { tab?: AccessDeepLinkTab | null } = {}) {
  const tab = options.tab || 'matrix';
  if (!service) {
    return accessDeepLink({ tab });
  }
  return accessDeepLink({
    focus: `${service.type === 'managed-app' ? 'managed' : 'service'}:${service.id}`,
    tab,
  });
}

export function accessDeepLinkForManagedApp(appId: string, options: { tab?: AccessDeepLinkTab | null } = {}) {
  return accessDeepLink({
    focus: `managed:${appId}`,
    tab: options.tab || 'matrix',
  });
}

export function accessDeepLinkForObservedService(serviceId: string, options: { tab?: AccessDeepLinkTab | null } = {}) {
  return accessDeepLink({
    focus: `service:${serviceId}`,
    tab: options.tab || 'matrix',
  });
}

export function accessDeepLinkForTab(tab: AccessDeepLinkTab, focus?: ReachabilityService | null) {
  return accessDeepLinkForService(focus, { tab });
}

export function parseAccessDeepLink(search = ''): AccessDeepLinkTarget {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tab = normalizeTab(params.get('tab'));
  const rawFocus = params.get('focus') || legacyFocusParam(params);
  const separatorIndex = rawFocus.indexOf(':');
  const rawKind = separatorIndex >= 0 ? rawFocus.slice(0, separatorIndex) : '';
  const id = separatorIndex >= 0 ? rawFocus.slice(separatorIndex + 1).trim() : '';
  const kind = normalizeKind(rawKind);

  if (!kind || !id) {
    return {
      id: null,
      key: `:${tab}`,
      kind: null,
      tab,
    };
  }

  return {
    id,
    key: `${kind}:${id}:${tab}`,
    kind,
    tab,
  };
}

export function findAccessDeepLinkTarget(services: ReachabilityService[], target: AccessDeepLinkTarget | null | undefined) {
  if (!target?.kind || !target.id) {
    return null;
  }
  return services.find((service) => {
    if (target.kind === 'managed') {
      return service.type === 'managed-app' && service.id === target.id;
    }
    return service.type === 'external-service' && service.id === target.id;
  }) ?? null;
}

function accessDeepLink({ focus, tab }: { focus?: string | null; tab: AccessDeepLinkTab }) {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (focus) {
    params.set('focus', focus);
  }
  return `${ACCESS_PATH}?${params.toString()}`;
}

function legacyFocusParam(params: URLSearchParams) {
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

function normalizeKind(kind: string): AccessDeepLinkKind | null {
  if (!FOCUS_KINDS.has(kind)) {
    return null;
  }
  if (kind === 'app') {
    return 'managed';
  }
  if (kind === 'observed') {
    return 'service';
  }
  return kind as AccessDeepLinkKind;
}

function normalizeTab(tab: string | null): AccessDeepLinkTab {
  if (tab && ACCESS_TABS.has(tab)) {
    return tab as AccessDeepLinkTab;
  }
  return 'matrix';
}

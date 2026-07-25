import { appRoutes } from '@/appRouteManifest';

export type ExtensionRouteId =
  | 'access'
  | 'activity'
  | 'apps'
  | 'backups'
  | 'diagnostics'
  | 'discover'
  | 'home'
  | 'pro'
  | 'settings'
  | 'storage';

export type ExtensionActionId =
  | 'review-access'
  | 'review-activity'
  | 'review-app'
  | 'review-backups'
  | 'review-diagnostics'
  | 'review-pro'
  | 'review-storage';

export type ExtensionNavigationTarget = {
  actionId: ExtensionActionId;
  path: string;
  routeId: ExtensionRouteId;
};

export type ExtensionNavigationState = {
  actionId: ExtensionActionId;
  extensionId: string;
  routeId: ExtensionRouteId;
  source: 'extension-navigation-v1';
};

const navigationTargets: Record<string, ExtensionNavigationTarget> = {
  'access:review-access': {
    actionId: 'review-access',
    path: appRoutes.access,
    routeId: 'access',
  },
  'activity:review-activity': {
    actionId: 'review-activity',
    path: appRoutes.activity,
    routeId: 'activity',
  },
  'apps:review-app': {
    actionId: 'review-app',
    path: appRoutes.apps,
    routeId: 'apps',
  },
  'backups:review-backups': {
    actionId: 'review-backups',
    path: appRoutes.backups,
    routeId: 'backups',
  },
  'diagnostics:review-diagnostics': {
    actionId: 'review-diagnostics',
    path: appRoutes.diagnostics,
    routeId: 'diagnostics',
  },
  'discover:review-app': {
    actionId: 'review-app',
    path: appRoutes.discover,
    routeId: 'discover',
  },
  'home:review-pro': {
    actionId: 'review-pro',
    path: appRoutes.home,
    routeId: 'home',
  },
  'pro:review-pro': {
    actionId: 'review-pro',
    path: appRoutes.pro,
    routeId: 'pro',
  },
  'settings:review-pro': {
    actionId: 'review-pro',
    path: appRoutes.settings,
    routeId: 'settings',
  },
  'storage:review-storage': {
    actionId: 'review-storage',
    path: appRoutes.storage,
    routeId: 'storage',
  },
};

export function resolveExtensionNavigation(routeId: string, actionId: string | undefined): ExtensionNavigationTarget | null {
  if (!actionId) return null;
  return navigationTargets[`${routeId}:${actionId}`] ?? null;
}

export function extensionNavigationState(extensionId: string, target: ExtensionNavigationTarget): ExtensionNavigationState {
  return {
    actionId: target.actionId,
    extensionId,
    routeId: target.routeId,
    source: 'extension-navigation-v1',
  };
}

export function readExtensionNavigationState(value: unknown): ExtensionNavigationState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<ExtensionNavigationState>;
  if (state.source !== 'extension-navigation-v1'
    || typeof state.extensionId !== 'string'
    || state.extensionId.length === 0
    || typeof state.routeId !== 'string'
    || typeof state.actionId !== 'string') {
    return null;
  }
  const target = resolveExtensionNavigation(state.routeId, state.actionId);
  if (!target || target.routeId !== state.routeId || target.actionId !== state.actionId) return null;
  return {
    actionId: target.actionId,
    extensionId: state.extensionId,
    routeId: target.routeId,
    source: 'extension-navigation-v1',
  };
}

/**
 * A rejected request never includes route or action values: private modules are
 * not trusted with audit fields, and one deduplicated event avoids audit noise.
 */
export function recordRejectedExtensionNavigation(extensionId: string) {
  const apiBase = `/api/v1/extensions/${encodeURIComponent(extensionId)}`;
  return fetch(`${apiBase}/navigation-rejections`, {
    credentials: 'same-origin',
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
}

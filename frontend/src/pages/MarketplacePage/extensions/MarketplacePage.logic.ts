export const START_HERE_DISMISSAL_KEY = 'autark-os:discover:start-here-dismissed:v1';

import { applicationRouteWithManagementPanel } from '../../ApplicationsPage/extensions/ApplicationsPage.deepLinks';
import type { DiscoverAppView, DiscoverInstalledAppSummary } from '@/types/discover';
import type { InstallOptions, MarketplaceApp } from '@/types/marketplace';
import type { StorageReport, SystemDoctorStatus } from '@/types/system';
import type { MarketplaceStatusFilter } from './MarketplacePage.constants';

/**
 * @param {{ apps?: unknown[]; hideInstalled?: boolean; installedAppIds?: Set<string>; searchQuery?: string; selectedCategory?: string; sortBy?: string }} params
 */
type MarketplaceVisibleAppsParams = {
  apps?: MarketplaceApp[];
  hideInstalled?: boolean;
  installedAppIds?: Set<string>;
  searchQuery?: string;
  selectedCategory?: string;
  sortBy?: string;
};

type MarketplaceVisibleAppViewsParams = {
  views?: DiscoverAppView[];
  hideInstalled?: boolean;
  searchQuery?: string;
  selectedCategory?: string;
  sortBy?: string;
  statusFilter?: MarketplaceStatusFilter;
};

type StarterAppContext = {
  appInstallsBlocked: boolean;
  limitedStorage: boolean;
  privateAccessBlocked: boolean;
};

export function marketplaceVisibleApps({
  apps = [],
  hideInstalled = false,
  installedAppIds = new Set(),
  searchQuery = '',
  selectedCategory = 'All',
  sortBy = 'Recommended',
}: MarketplaceVisibleAppsParams = {}) {
  return sortMarketplaceApps(
    apps.filter((app) => (selectedCategory === 'All' || app.category === selectedCategory) && (!hideInstalled || !installedAppIds.has(app.id)) && marketplaceAppMatchesSearch(app, searchQuery)),
    sortBy,
  );
}

/**
 * @param {{ views?: Array<{ app: unknown; state?: string }>; hideInstalled?: boolean; searchQuery?: string; selectedCategory?: string; sortBy?: string }} params
 */
export function marketplaceVisibleAppViews({
  views = [],
  hideInstalled = false,
  searchQuery = '',
  selectedCategory = 'All',
  sortBy = 'Recommended',
  statusFilter = 'all',
}: MarketplaceVisibleAppViewsParams = {}) {
  const appOrder = new Map(marketplaceVisibleApps({
    apps: views.map((view) => view.app),
    hideInstalled: false,
    searchQuery,
    selectedCategory,
    sortBy,
  }).map((app, index) => [app.id, index]));

  return views
    .filter((view) => appOrder.has(view.app.id))
    .filter((view) => !hideInstalled || view.state !== 'installed_managed')
    .filter((view) => marketplaceStatusMatches(view, statusFilter))
    .sort((left, right) => (appOrder.get(left.app.id) ?? 0) - (appOrder.get(right.app.id) ?? 0));
}

export function marketplaceStatusMatches(view: Pick<DiscoverAppView, 'state'>, statusFilter: MarketplaceStatusFilter) {
  if (statusFilter === 'installed') {
    return view.state === 'installed_managed';
  }
  if (statusFilter === 'pinned') {
    return view.state === 'pinned_external';
  }
  if (statusFilter === 'available') {
    return view.state === 'available';
  }
  return true;
}

export function marketplacePrimaryRoute(view: Pick<DiscoverAppView, 'primaryAction'> | null | undefined = null) {
  const action = view?.primaryAction;
  if (!action || action.disabled || action.kind !== 'route' || !action.href) {
    return null;
  }
  if (action.id === 'manage' || action.id === 'review_existing') {
    return applicationRouteWithManagementPanel(action.href) ?? null;
  }
  return null;
}

/**
 * @param {unknown[]} apps
 * @param {string[]} recommendedApps
 * @param {Map<string, unknown>} installedById
 * @param {unknown | null} doctor
 * @param {unknown | null} storage
 */
export function starterAppsForMarketplace(
  apps: MarketplaceApp[],
  recommendedApps: string[],
  installedById: Map<string, DiscoverInstalledAppSummary | null>,
  doctor: SystemDoctorStatus | null | undefined,
  storage: StorageReport | null | undefined,
) {
  const selectedIds = (recommendedApps.length ? recommendedApps : ['vaultwarden', 'jellyfin', 'homepage', 'freshrss', 'syncthing']).slice(0, 5);
  const appInstallsBlocked = doctor?.readiness.groups.find((group) => group.id === 'app-installs')?.status === 'warning';
  const privateAccessBlocked = doctor?.readiness.groups.find((group) => group.id === 'private-access')?.status === 'warning';
  const limitedStorage = storage?.status === 'warning' || storage?.status === 'critical' || (storage?.runtimeDisk.usedPercent ?? 0) >= 75;
  return selectedIds
    .map((appId, index) => ({ app: apps.find((candidate) => candidate.id === appId), index }))
    .filter((item): item is { app: MarketplaceApp; index: number } => Boolean(item.app))
    .map(({ app, index }) => {
      const notes = starterAppNotes(app, { appInstallsBlocked, privateAccessBlocked, limitedStorage });
      const readiness = appInstallsBlocked ? 'blocked' : limitedStorage && !isLightweightMarketplaceApp(app) ? 'review' : 'ready';
      return {
        app,
        installed: installedById.has(app.id),
        notes,
        readiness,
        index,
      };
    })
    .sort((left, right) => Number(right.readiness === 'ready') - Number(left.readiness === 'ready') || Number(isLightweightMarketplaceApp(right.app)) - Number(isLightweightMarketplaceApp(left.app)) || left.index - right.index)
    .map((recommendation) => ({
      app: recommendation.app,
      installed: recommendation.installed,
      notes: recommendation.notes,
      readiness: recommendation.readiness,
    }));
}

export function shouldShowStartHereSection(
  recommendations: Array<{ installed?: boolean }>,
  dismissed: boolean,
) {
  if (dismissed || !recommendations.length) {
    return false;
  }
  return recommendations.some((recommendation) => !recommendation.installed);
}

export function starterCatalogForDiscover(apps: MarketplaceApp[]) {
  const starterIds = ['vaultwarden', 'jellyfin', 'homepage', 'immich', 'adguard-home', 'home-assistant', 'nextcloud'];
  const byId = new Map(apps.map((app) => [app.id, app]));
  const starterApps = starterIds.map((appId) => byId.get(appId)).filter((app): app is MarketplaceApp => Boolean(app));
  const readyApps = apps.filter((app) => app.supportLevel === 'Ready' || app.badge === 'Official' || marketplaceDifficultyRank(app.difficulty) === 0);
  const catalog: MarketplaceApp[] = [];
  for (const app of [...starterApps, ...readyApps]) {
    if (!catalog.some((candidate) => candidate.id === app.id) && app.supportLevel !== 'Advanced' && app.supportLevel !== 'Experimental') {
      catalog.push(app);
    }
    if (catalog.length >= 6) {
      break;
    }
  }
  return catalog;
}

export function safeBasicCatalogForDiscover(apps: MarketplaceApp[]) {
  return apps.filter((app) => app.supportLevel === 'Ready');
}

export function starterAppNotes(app: MarketplaceApp, context: StarterAppContext) {
  const notes: string[] = [];
  if (context.appInstallsBlocked) {
    notes.push('Docker setup is needed first. Review host readiness before installing apps.');
  } else {
    notes.push('Opens the existing install wizard for explicit confirmation.');
  }
  if (context.privateAccessBlocked && app.access.privateAccessRecommended) {
    notes.push('Private access can wait. This app can start with local access until Tailscale is ready.');
  }
  if (context.limitedStorage) {
    notes.push(isLightweightMarketplaceApp(app) ? 'Recommended as a lightweight first install while storage is tight.' : 'Storage is tight; review space before installing this larger app.');
  }
  if (!notes.length) {
    notes.push('Ready to review as a first Autark-OS app.');
  }
  return notes;
}

export function marketplaceAppMatchesSearch(app: MarketplaceApp, searchQuery: string) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [
    app.name,
    app.category,
    app.description,
    app.shortValue,
    app.plainLanguage,
    app.usage.kind,
    ...app.tags,
    ...app.bestFor,
    ...app.highlights,
  ].some((value) => value.toLowerCase().includes(query));
}

export function sortMarketplaceApps(apps: MarketplaceApp[], sortBy: string) {
  const sorted = [...apps];
  switch (sortBy) {
    case 'Easiest to install':
      return sorted.sort((left, right) => marketplaceDifficultyRank(left.difficulty) - marketplaceDifficultyRank(right.difficulty) || left.name.localeCompare(right.name));
    case 'Recently updated':
      return sorted.sort((left, right) => marketplaceUpdateRank(left.lastUpdated) - marketplaceUpdateRank(right.lastUpdated) || left.name.localeCompare(right.name));
    default:
      return sorted.sort((left, right) => Number(right.badge === 'Official') - Number(left.badge === 'Official') || Number(right.access.privateAccessRecommended) - Number(left.access.privateAccessRecommended) || left.name.localeCompare(right.name));
  }
}

export function marketplaceDifficultyRank(difficulty: string) {
  const normalized = difficulty.toLowerCase();
  if (normalized.includes('easy')) return 0;
  if (normalized.includes('moderate')) return 1;
  return 2;
}

export function isLightweightMarketplaceApp(app: MarketplaceApp) {
  return marketplaceDifficultyRank(app.difficulty) === 0 || app.installTime.toLowerCase().includes('2-3');
}

export function marketplaceUpdateRank(lastUpdated: string) {
  const value = lastUpdated.toLowerCase();
  if (value.includes('today') || value.includes('recent')) return 0;
  if (value.includes('day')) return 1;
  if (value.includes('week')) return 2;
  if (value.includes('month')) return 3;
  return 4;
}

export function marketplaceActivityTone(level: string) {
  switch (level) {
    case 'success':
      return 'text-emerald-200';
    case 'warning':
      return 'text-orange-200';
    case 'error':
      return 'text-red-200';
    default:
      return 'text-cyan-200';
  }
}

export function formatMarketplaceActivityTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function optionsFromInstalledSettings(
  settings: {
    accessUrl?: string | null;
    backup?: { enabled?: boolean; frequency?: string; retention?: number } | null;
    expectedLocalPort?: number | null;
    storageSubfolders?: Record<string, string> | null;
    tailscaleEnabled?: boolean;
  } | null | undefined,
  fallback: InstallOptions,
) {
  if (!settings) {
    return fallback;
  }
  return {
    ports: { hostPort: settings.expectedLocalPort ?? portFromUrl(settings.accessUrl) ?? fallback.ports.hostPort },
    access: { tailscaleEnabled: settings.tailscaleEnabled },
    storage: { subfolders: settings.storageSubfolders ?? fallback.storage.subfolders },
    backup: {
      enabled: settings.backup?.enabled ?? fallback.backup.enabled,
      frequency: settings.backup?.frequency ?? fallback.backup.frequency,
      retention: settings.backup?.retention ?? fallback.backup.retention,
    },
    reinstall: true,
  };
}

export function portFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.port) {
      return Number(parsed.port);
    }
    if (parsed.protocol === 'http:') {
      return 80;
    }
    if (parsed.protocol === 'https:') {
      return 443;
    }
    return null;
  } catch {
    return null;
  }
}

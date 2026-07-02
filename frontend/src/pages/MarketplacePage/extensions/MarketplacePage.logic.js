export const START_HERE_DISMISSAL_KEY = 'project-os:discover:start-here-dismissed:v1';

/**
 * @param {{ apps?: unknown[]; hideInstalled?: boolean; installedAppIds?: Set<string>; searchQuery?: string; selectedCategory?: string; sortBy?: string }} params
 */
export function marketplaceVisibleApps({
  apps = [],
  hideInstalled = false,
  installedAppIds = new Set(),
  searchQuery = '',
  selectedCategory = 'All',
  sortBy = 'Recommended',
} = {}) {
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
} = {}) {
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
    .sort((left, right) => (appOrder.get(left.app.id) ?? 0) - (appOrder.get(right.app.id) ?? 0));
}

export function marketplacePrimaryRoute(view = {}) {
  const action = view.primaryAction;
  if (!action || action.disabled || action.kind !== 'route' || !action.href) {
    return null;
  }
  if (action.id === 'manage' || action.id === 'review_existing') {
    return action.href;
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
export function starterAppsForMarketplace(apps, recommendedApps, installedById, doctor, storage) {
  const selectedIds = (recommendedApps.length ? recommendedApps : ['vaultwarden', 'jellyfin', 'homepage', 'freshrss', 'syncthing']).slice(0, 5);
  const appInstallsBlocked = doctor?.readiness.groups.find((group) => group.id === 'app-installs')?.status === 'warning';
  const privateAccessBlocked = doctor?.readiness.groups.find((group) => group.id === 'private-access')?.status === 'warning';
  const limitedStorage = storage?.status === 'warning' || storage?.status === 'critical' || (storage?.runtimeDisk.usedPercent ?? 0) >= 75;
  return selectedIds
    .map((appId, index) => ({ app: apps.find((candidate) => candidate.id === appId), index }))
    .filter((item) => Boolean(item.app))
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

export function shouldShowStartHereSection(recommendations, dismissed) {
  if (dismissed || !recommendations.length) {
    return false;
  }
  return recommendations.some((recommendation) => !recommendation.installed);
}

export function starterCatalogForDiscover(apps) {
  const starterIds = ['vaultwarden', 'jellyfin', 'homepage', 'immich', 'adguard-home', 'home-assistant', 'nextcloud'];
  const byId = new Map(apps.map((app) => [app.id, app]));
  const starterApps = starterIds.map((appId) => byId.get(appId)).filter(Boolean);
  const readyApps = apps.filter((app) => app.supportLevel === 'Ready' || app.badge === 'Official' || marketplaceDifficultyRank(app.difficulty) === 0);
  const catalog = [];
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

export function safeBasicCatalogForDiscover(apps) {
  return apps.filter((app) => app.supportLevel === 'Ready');
}

export function starterAppNotes(app, context) {
  const notes = [];
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
    notes.push('Ready to review as a first Project OS app.');
  }
  return notes;
}

export function marketplaceAppMatchesSearch(app, searchQuery) {
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

export function sortMarketplaceApps(apps, sortBy) {
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

export function marketplaceDifficultyRank(difficulty) {
  const normalized = difficulty.toLowerCase();
  if (normalized.includes('easy')) return 0;
  if (normalized.includes('moderate')) return 1;
  return 2;
}

export function isLightweightMarketplaceApp(app) {
  return marketplaceDifficultyRank(app.difficulty) === 0 || app.installTime.toLowerCase().includes('2-3');
}

export function marketplaceUpdateRank(lastUpdated) {
  const value = lastUpdated.toLowerCase();
  if (value.includes('today') || value.includes('recent')) return 0;
  if (value.includes('day')) return 1;
  if (value.includes('week')) return 2;
  if (value.includes('month')) return 3;
  return 4;
}

export function marketplaceCardToneClass(view = {}) {
  const tone = view.cardTone || cardToneForState(view.state);
  const tones = {
    success: 'border-emerald-300/35 bg-emerald-500/10 hover:bg-emerald-500/15',
    info: 'border-cyan-300/35 bg-cyan-400/10 hover:bg-cyan-400/15',
    observed: 'border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/15',
    warning: 'border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/15',
    danger: 'border-red-400/35 bg-red-500/10 hover:bg-red-500/15',
    neutral: 'border-sky-400/25 bg-slate-900 hover:bg-slate-700',
    muted: 'border-sky-400/25 bg-slate-800 hover:bg-slate-700',
  };
  return tones[tone] || tones.neutral;
}

function cardToneForState(state) {
  if (state === 'installed_managed') return 'success';
  if (state === 'pinned_external') return 'info';
  if (state === 'found_on_server') return 'observed';
  if (state === 'recoverable') return 'warning';
  if (state === 'managed_elsewhere' || state === 'blocked') return 'danger';
  if (state === 'coming_soon') return 'muted';
  return 'neutral';
}

export function marketplaceActivityTone(level) {
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

export function formatMarketplaceActivityTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function optionsFromInstalledSettings(settings, fallback) {
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

export function portFromUrl(value) {
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

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

export function discoverAppCardView(app, { foundResourcesByAppId = new Map(), installedById = new Map() } = {}) {
  const installedApp = installedById.get(app.id) ?? null;
  const foundResource = foundResourcesByAppId.get(app.id) ?? null;
  const state = discoverAppState(app, installedApp, foundResource);
  const stateLabel = discoverAppStateLabel(state, foundResource);
  const primaryAction = discoverAppPrimaryAction(state);
  return {
    id: app.id,
    app,
    name: app.name,
    image: app.image,
    summary: app.shortValue || app.plainLanguage || app.description,
    description: app.plainLanguage || app.description,
    categoryLabel: app.category,
    serviceKindLabel: serviceKindLabel(app.usage?.kind || ''),
    estimatedInstallTime: app.installTime,
    difficulty: app.difficulty,
    state,
    stateLabel,
    stateDescription: discoverAppStateDescription(state, foundResource),
    primaryAction,
    primaryActionLabel: discoverAppPrimaryActionLabel(primaryAction),
    installed: Boolean(installedApp),
    installedApp,
    foundResource,
  };
}

function discoverAppState(app, installedApp, foundResource) {
  if (installedApp) {
    return 'installed';
  }
  if (foundResource?.ownershipState === 'unknown_conflict') {
    return 'blocked';
  }
  if (foundResource?.ownershipState === 'foreign_project_os') {
    return 'managed_elsewhere';
  }
  if (foundResource) {
    return 'found_on_server';
  }
  if (app.installable === false || app.state === 'coming_soon') {
    return 'coming_soon';
  }
  return 'available';
}

function discoverAppStateLabel(state, foundResource) {
  switch (state) {
    case 'installed':
      return 'Installed';
    case 'found_on_server':
      return foundResource?.ownershipState === 'legacy_project_os' ? 'Recoverable' : 'Found on server';
    case 'managed_elsewhere':
      return 'Managed elsewhere';
    case 'blocked':
      return 'Blocked';
    case 'coming_soon':
      return 'Coming soon';
    default:
      return 'Available';
  }
}

function discoverAppStateDescription(state, foundResource) {
  switch (state) {
    case 'installed':
      return 'Managed by this Project OS installation.';
    case 'found_on_server':
    case 'managed_elsewhere':
    case 'blocked':
      return foundResource?.summary || 'Project OS found a matching app on this server.';
    case 'coming_soon':
      return 'This catalog entry is not installable yet.';
    default:
      return 'Ready to review before install.';
  }
}

function discoverAppPrimaryAction(state) {
  switch (state) {
    case 'installed':
      return 'manage';
    case 'found_on_server':
    case 'managed_elsewhere':
    case 'blocked':
      return 'resolve';
    case 'coming_soon':
      return 'unavailable';
    default:
      return 'review_setup';
  }
}

function discoverAppPrimaryActionLabel(action) {
  switch (action) {
    case 'manage':
      return 'Manage';
    case 'resolve':
      return 'Resolve';
    case 'unavailable':
      return 'Unavailable';
    default:
      return 'Review setup';
  }
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

function serviceKindLabel(kind) {
  const labels = {
    'web-app': 'App',
    'companion-service': 'Connect service',
    'admin-service': 'Setup tool',
    'background-service': 'Background',
    infrastructure: 'Infrastructure',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
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

export function marketplaceActivityTone(level) {
  switch (level) {
    case 'success':
      return 'text-emerald-300';
    case 'warning':
      return 'text-amber-300';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-sky-300';
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

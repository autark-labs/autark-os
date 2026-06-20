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
  const selectedIds = recommendedApps.length ? recommendedApps : ['vaultwarden', 'jellyfin', 'homepage'];
  const appInstallsBlocked = doctor?.readiness.groups.find((group) => group.id === 'app-installs')?.status === 'warning';
  const privateAccessBlocked = doctor?.readiness.groups.find((group) => group.id === 'private-access')?.status === 'warning';
  const limitedStorage = storage?.status === 'warning' || storage?.status === 'critical' || (storage?.runtimeDisk.usedPercent ?? 0) >= 75;
  return selectedIds
    .map((appId) => apps.find((app) => app.id === appId))
    .filter(Boolean)
    .map((app) => {
      const notes = starterAppNotes(app, { appInstallsBlocked, privateAccessBlocked, limitedStorage });
      const readiness = appInstallsBlocked ? 'blocked' : limitedStorage && !isLightweightMarketplaceApp(app) ? 'review' : 'ready';
      return {
        app,
        installed: installedById.has(app.id),
        notes,
        readiness,
      };
    })
    .sort((left, right) => Number(right.readiness === 'ready') - Number(left.readiness === 'ready') || Number(isLightweightMarketplaceApp(right.app)) - Number(isLightweightMarketplaceApp(left.app)) || left.app.name.localeCompare(right.app.name));
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

export function sortMarketplaceApps(apps, sortBy) {
  const sorted = [...apps];
  switch (sortBy) {
    case 'Easiest to install':
      return sorted.sort((left, right) => marketplaceDifficultyRank(left.difficulty) - marketplaceDifficultyRank(right.difficulty) || left.name.localeCompare(right.name));
    case 'Most popular':
      return sorted.sort((left, right) => numericMarketplacePopularity(right.downloads) - numericMarketplacePopularity(left.downloads) || left.name.localeCompare(right.name));
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

export function numericMarketplacePopularity(downloads) {
  const match = downloads.toLowerCase().match(/([\d.]+)\s*([mk])?/);
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  return value * multiplier;
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

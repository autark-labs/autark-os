import assert from 'node:assert/strict';
import test from 'node:test';
import {
  marketplaceVisibleApps,
  optionsFromInstalledSettings,
  starterCatalogForDiscover,
  starterAppsForMarketplace,
} from './MarketplacePage.logic.js';

function app(overrides = {}) {
  return {
    access: { privateAccessRecommended: false },
    badge: 'Community',
    bestFor: ['families'],
    category: 'Media',
    description: 'Stream movies at home',
    difficulty: 'Easy',
    downloads: '2.1k',
    highlights: ['Fast setup'],
    id: 'jellyfin',
    installTime: '2-3 minutes',
    lastUpdated: 'today',
    name: 'Jellyfin',
    plainLanguage: 'A home media server',
    shortValue: 'Media streaming',
    tags: ['video'],
    usage: { kind: 'Media' },
    ...overrides,
  };
}

test('marketplaceVisibleApps filters by category, installed state, and search query', () => {
  const apps = [
    app({ id: 'jellyfin', name: 'Jellyfin', category: 'Media', badge: 'Official' }),
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security', description: 'Password manager' }),
    app({ id: 'homepage', name: 'Homepage', category: 'Utilities', tags: ['dashboard'] }),
  ];
  const visible = marketplaceVisibleApps({
    apps,
    hideInstalled: true,
    installedAppIds: new Set(['jellyfin']),
    searchQuery: 'password',
    selectedCategory: 'Security',
    sortBy: 'Recommended',
  });

  assert.deepEqual(visible.map((item) => item.id), ['vaultwarden']);
});

test('marketplaceVisibleApps applies supported sort modes', () => {
  const apps = [
    app({ id: 'advanced', name: 'Advanced App', difficulty: 'Advanced', downloads: '3m', lastUpdated: '1 month ago' }),
    app({ id: 'easy', name: 'Easy App', difficulty: 'Easy', downloads: '10k', lastUpdated: 'today' }),
    app({ id: 'moderate', name: 'Moderate App', difficulty: 'Moderate', downloads: '50k', lastUpdated: '1 week ago' }),
  ];

  assert.deepEqual(marketplaceVisibleApps({ apps, sortBy: 'Easiest to install' }).map((item) => item.id), ['easy', 'moderate', 'advanced']);
  assert.deepEqual(marketplaceVisibleApps({ apps, sortBy: 'Recently updated' }).map((item) => item.id), ['easy', 'moderate', 'advanced']);
});

test('starterAppsForMarketplace marks blocked and storage-review recommendations', () => {
  const apps = [
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security', difficulty: 'Easy' }),
    app({ id: 'jellyfin', name: 'Jellyfin', difficulty: 'Advanced', installTime: '10 minutes' }),
  ];
  const doctor = {
    readiness: {
      groups: [
        { id: 'app-installs', status: 'ok' },
        { id: 'private-access', status: 'warning' },
      ],
    },
  };
  const storage = { runtimeDisk: { usedPercent: 82 }, status: 'warning' };
  const recommendations = starterAppsForMarketplace(apps, ['jellyfin', 'vaultwarden'], new Map(), doctor, storage);

  assert.equal(recommendations[0].app.id, 'vaultwarden');
  assert.equal(recommendations[0].readiness, 'ready');
  assert.equal(recommendations[1].app.id, 'jellyfin');
  assert.equal(recommendations[1].readiness, 'review');
  assert.match(recommendations[1].notes.join(' '), /Storage is tight/);
});

test('starterCatalogForDiscover keeps the basic catalog focused on ready starter apps', () => {
  const apps = [
    app({ id: 'advanced', name: 'Advanced App', difficulty: 'Advanced', supportLevel: 'Advanced' }),
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security', supportLevel: 'Ready' }),
    app({ id: 'jellyfin', name: 'Jellyfin', supportLevel: 'Ready' }),
    app({ id: 'homepage', name: 'Homepage', category: 'Utilities', supportLevel: 'Ready' }),
    app({ id: 'immich', name: 'Immich', supportLevel: 'Needs testing' }),
    app({ id: 'easy-ready', name: 'Easy Ready', supportLevel: 'Ready' }),
  ];

  assert.deepEqual(starterCatalogForDiscover(apps).map((item) => item.id), ['vaultwarden', 'jellyfin', 'homepage', 'immich', 'easy-ready']);
});

test('optionsFromInstalledSettings preserves installed app choices for reinstall', () => {
  const fallback = {
    access: { tailscaleEnabled: false },
    backup: { enabled: true, frequency: 'daily', retention: 7 },
    ports: { hostPort: 8080 },
    reinstall: false,
    storage: { subfolders: { data: 'data' } },
  };
  const options = optionsFromInstalledSettings({
    accessUrl: 'http://host.local:8096',
    backup: { enabled: false, frequency: 'weekly', retention: 3 },
    expectedLocalPort: null,
    storageSubfolders: { config: 'custom-config' },
    tailscaleEnabled: true,
  }, fallback);

  assert.deepEqual(options, {
    access: { tailscaleEnabled: true },
    backup: { enabled: false, frequency: 'weekly', retention: 3 },
    ports: { hostPort: 8096 },
    reinstall: true,
    storage: { subfolders: { config: 'custom-config' } },
  });
});

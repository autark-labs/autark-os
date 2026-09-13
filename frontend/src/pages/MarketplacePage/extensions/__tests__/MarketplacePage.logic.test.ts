import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  START_HERE_DISMISSAL_KEY,
  betaStarterAppIds,
  marketplacePrimaryRoute,
  marketplaceVisibleAppViews,
  marketplaceVisibleApps,
  optionsFromInstalledSettings,
  safeBasicCatalogForDiscover,
  shouldShowStartHereSection,
  starterCatalogForDiscover,
  starterAppsForMarketplace,
} from '../MarketplacePage.logic';
import { buildApplicationSurfaceItems } from '../../../ApplicationsPage/extensions/ApplicationsPage.liveModel';

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

test('marketplaceVisibleAppViews hides only canonical current-instance installs', () => {
  const views = [
    discoverView('vaultwarden', 'managed', { category: 'Security' }),
    discoverView('jellyfin', 'blocked', { name: 'Jellyfin', category: 'Media' }),
    discoverView('homepage', 'blocked', { name: 'Homepage', category: 'Utilities' }),
  ];

  const visible = marketplaceVisibleAppViews({
    views,
    hideInstalled: true,
    selectedCategory: 'All',
    sortBy: 'Recommended',
  });

  assert.deepEqual(visible.map((view) => view.application.id), ['homepage', 'jellyfin']);
});

test('marketplaceVisibleAppViews filters canonical availability and installs', () => {
  const views = [
    discoverView('available', 'available'),
    discoverView('installed', 'managed'),
    discoverView('found', 'blocked'),
  ];

  assert.deepEqual(marketplaceVisibleAppViews({ views, statusFilter: 'available' }).map((view) => view.application.id), ['available']);
  assert.deepEqual(marketplaceVisibleAppViews({ views, statusFilter: 'installed' }).map((view) => view.application.id), ['installed']);
});

test('marketplacePrimaryRoute follows My Apps management and existing-service actions', () => {
  assert.equal(marketplacePrimaryRoute({
    application: application('vaultwarden', 'managed', { id: 'manage', kind: 'route', href: '/apps?focus=managed%3Avaultwarden', disabled: false }),
  }), '/apps?focus=managed%3Avaultwarden&panel=manage');
  assert.equal(marketplacePrimaryRoute({
    application: application('vaultwarden', 'blocked', { id: 'review_existing', kind: 'route', href: '/apps/found?service=docker%3Avaultwarden', disabled: false }),
  }), '/apps/found?service=docker%3Avaultwarden');
  assert.equal(marketplacePrimaryRoute({
    application: application('vaultwarden', 'available', { id: 'review_setup', kind: 'route', href: '/discover?app=vaultwarden', disabled: false }),
  }), null);
  assert.equal(marketplacePrimaryRoute({
    application: application('vaultwarden', 'managed', { id: 'manage', kind: 'route', href: '/apps?focus=managed%3Avaultwarden', disabled: true }),
  }), null);
});

test('Discover and My Apps consume the same canonical relationship', () => {
  const canonical = application('vaultwarden', 'managed');
  canonical.runtime = {
    appId: 'vaultwarden', appName: 'Vaultwarden', category: 'Security', description: '', image: '', friendlyStatus: 'Ready',
    technicalStatus: 'running', readinessState: 'ready', attentionState: 'none', availableActions: [], recentEvents: [], appConfiguration: [],
  };
  const discover = discoverView('vaultwarden', 'available');
  discover.application = canonical;

  assert.deepEqual(marketplaceVisibleAppViews({ views: [discover], statusFilter: 'installed' }).map((view) => view.application.id), ['vaultwarden']);
  assert.deepEqual(buildApplicationSurfaceItems({ applications: [canonical] }).map((item) => item.id), ['vaultwarden']);

  canonical.relationship = 'blocked';
  assert.deepEqual(marketplaceVisibleAppViews({ views: [discover], statusFilter: 'installed' }), []);
  assert.deepEqual(buildApplicationSurfaceItems({ applications: [canonical] }), []);
});

function discoverView(id, relationship, appOverrides = {}) {
  return { application: application(id, relationship), app: app({ id, name: id, ...appOverrides }), serviceKindLabel: 'App', estimatedInstallTime: '2 minutes', difficulty: 'Easy', setupSchema: { appId: id, version: 1, inputs: [] } };
}

function application(id, relationship, primaryAction = { id: 'review_setup', kind: 'route', href: `/discover?app=${id}`, disabled: false }) {
  return {
    id, name: id, category: 'Apps', image: '', summary: '', description: '', relationship, catalogAvailability: 'installable', appInstanceId: relationship === 'managed' ? id : '',
    runtimeState: relationship === 'managed' ? 'running' : 'unknown', ownershipState: relationship === 'managed' ? 'owned' : 'unowned', accessState: 'not_ready', backupState: 'backup_disabled', issues: [],
    relationshipLabel: relationship, relationshipDescription: '', statusTone: 'neutral', cardTone: 'neutral', installCopyWarningRequired: relationship === 'blocked', reviewExistingHref: null,
    primaryAction: { label: 'Action', method: null, reason: '', ...primaryAction }, availableActions: [], runtime: null, evidence: null,
  };
}

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
    app({ id: 'freshrss', name: 'FreshRSS', category: 'Productivity', difficulty: 'Easy' }),
    app({ id: 'syncthing', name: 'Syncthing', difficulty: 'Advanced', installTime: '10 minutes' }),
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
  const recommendations = starterAppsForMarketplace(apps, ['syncthing', 'freshrss'], new Map(), doctor, storage);

  assert.equal(recommendations[0].app.id, 'freshrss');
  assert.equal(recommendations[0].readiness, 'ready');
  assert.equal(recommendations[1].app.id, 'syncthing');
  assert.equal(recommendations[1].readiness, 'review');
  assert.match(recommendations[1].notes.join(' '), /Storage is tight/);
});

test('starterAppsForMarketplace falls back to curated starter apps when onboarding did not pick apps', () => {
  const apps = [
    app({ id: 'homepage', name: 'Homepage', category: 'Utilities' }),
    app({ id: 'freshrss', name: 'FreshRSS', category: 'Productivity' }),
    app({ id: 'syncthing', name: 'Syncthing', category: 'Productivity' }),
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security' }),
    app({ id: 'grafana', name: 'Grafana', category: 'Monitoring' }),
  ];

  const recommendations = starterAppsForMarketplace(apps, [], new Map(), null, null);

  assert.deepEqual(recommendations.map((recommendation) => recommendation.app.id), betaStarterAppIds);
});

test('starterAppsForMarketplace does not revive an excluded onboarding recommendation', () => {
  const apps = [
    app({ id: 'homepage', name: 'Homepage', category: 'Utilities' }),
    app({ id: 'freshrss', name: 'FreshRSS', category: 'Productivity' }),
    app({ id: 'syncthing', name: 'Syncthing', category: 'Productivity' }),
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security' }),
  ];

  const recommendations = starterAppsForMarketplace(apps, ['vaultwarden'], new Map(), null, null);

  assert.deepEqual(recommendations.map((recommendation) => recommendation.app.id), betaStarterAppIds);
});

test('shouldShowStartHereSection hides dismissed or fully installed starter recommendations', () => {
  const recommendations = [
    { app: app({ id: 'vaultwarden' }), installed: true },
    { app: app({ id: 'jellyfin' }), installed: false },
  ];

  assert.equal(START_HERE_DISMISSAL_KEY, 'autark-os:discover:start-here-dismissed:v1');
  assert.equal(shouldShowStartHereSection(recommendations, false), true);
  assert.equal(shouldShowStartHereSection(recommendations, true), false);
  assert.equal(shouldShowStartHereSection(recommendations.map((recommendation) => ({ ...recommendation, installed: true })), false), false);
});

test('starterCatalogForDiscover keeps the basic catalog focused on ready starter apps', () => {
  const apps = [
    app({ id: 'advanced', name: 'Advanced App', difficulty: 'Advanced', supportLevel: 'Advanced' }),
    app({ id: 'homepage', name: 'Homepage', category: 'Utilities', supportLevel: 'Ready' }),
    app({ id: 'freshrss', name: 'FreshRSS', category: 'Productivity', supportLevel: 'Ready' }),
    app({ id: 'syncthing', name: 'Syncthing', category: 'Productivity', supportLevel: 'Ready' }),
    app({ id: 'vaultwarden', name: 'Vaultwarden', category: 'Security', supportLevel: 'Ready' }),
    app({ id: 'easy-ready', name: 'Easy Ready', supportLevel: 'Ready' }),
  ];

  assert.deepEqual(starterCatalogForDiscover(apps).map((item) => item.id), betaStarterAppIds);
});

test('safeBasicCatalogForDiscover shows only ready apps for basic view all', () => {
  const apps = [
    app({ id: 'ready', name: 'Ready App', supportLevel: 'Ready' }),
    app({ id: 'needs-testing', name: 'Needs Testing App', supportLevel: 'Needs testing' }),
    app({ id: 'advanced', name: 'Advanced App', supportLevel: 'Advanced' }),
    app({ id: 'experimental', name: 'Experimental App', supportLevel: 'Experimental' }),
  ];

  assert.deepEqual(safeBasicCatalogForDiscover(apps).map((item) => item.id), ['ready']);
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

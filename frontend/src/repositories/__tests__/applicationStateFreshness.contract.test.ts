import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const frontendRoot = resolve(import.meta.dirname, '../..');

function source(path: string) {
  return readFileSync(resolve(frontendRoot, path), 'utf8');
}

test('the shared repository requests a real canonical refresh and exposes backend freshness metadata', () => {
  const repository = source('repositories/applicationStateRepository.ts');

  assert.match(repository, /refresh: !queryClient\.getQueryData<ApplicationState>\(applicationStateQueryKey\)/);
  assert.match(repository, /freshness:\s*ApplicationStateFreshness/);
  assert.match(repository, /lastError:\s*string \| null/);
  assert.match(repository, /refreshStatus:\s*string/);
  assert.match(repository, /stale:\s*boolean/);
  assert.match(repository, /applicationStateFreshness\(state, \{ transportError: error \}\)/);
});

test('Discover waits for a successful canonical snapshot and locks installs while ownership is stale', () => {
  const page = source('pages/MarketplacePage/MarketplacePage.tsx');
  const repository = source('repositories/discoverRepository.ts');

  assert.match(page, /useDiscoverAppsQuery\([\s\S]*applicationState\.freshness\.hasUsableData/);
  assert.match(page, /selectedAppInstallLocked = !applicationState\.freshness\.isCurrent/);
  assert.match(page, /Refresh app information before reviewing or starting an install/);
  assert.match(repository, /queryKey: \[\.\.\.discoverQueryKeys\.apps, applicationStateUpdatedAt \?\? 'unavailable'\]/);
  assert.match(repository, /enabled,/);
});

test('one canonical state notice covers the application shell and focused app-state overlays', () => {
  const shell = source('layout/AppShell.tsx');
  const settings = source('pages/SettingsPage/SettingsPage.tsx');
  const observedServiceSheet = source('pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx');
  const notice = source('components/autark-os/ApplicationStateNotice.tsx');

  assert.match(shell, /<ApplicationStateNotice/);
  assert.match(settings, /embedded && <ApplicationStateNotice/);
  assert.match(observedServiceSheet, /<ApplicationStateNotice/);
  assert.match(notice, /Current app information is unavailable/);
  assert.match(notice, /App information may be out of date/);
  assert.match(notice, /Refresh app information/);
});

test('app-specific empty states require a successful canonical snapshot', () => {
  const home = source('pages/OverviewPage/OverviewPage.tsx');
  const applications = source('pages/ApplicationsPage/ApplicationsPage.tsx');
  const foundApps = source('pages/ResolveExistingAppsPage/ResolveExistingAppsPage.tsx');

  assert.match(home, /appState\.freshness\.hasUsableData && <InstalledAppsLauncher/);
  assert.match(applications, /appState\.freshness\.hasUsableData && \(/);
  assert.match(foundApps, /appState\.freshness\.hasUsableData \? \(/);
});

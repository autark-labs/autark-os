import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applicationStateFreshness, applicationStateQueryKey, setApplicationStateFromActionResultCache } from '../applicationStateRepository';
import type { ApplicationState } from '@/types/applicationState';

const frontendRoot = resolve(import.meta.dirname, '../..');

function source(path: string) {
  return readFileSync(resolve(frontendRoot, path), 'utf8');
}

test('the shared repository requests a real canonical refresh and exposes backend freshness metadata', () => {
  const repository = source('repositories/applicationStateRepository.ts');

  assert.match(repository, /refresh: !queryClient\.getQueryData<ApplicationState>\(applicationStateQueryKey\)/);
  assert.match(repository, /freshness:\s*ApplicationStateFreshness/);
  assert.match(repository, /applicationStateFreshness\(state, \{ transportError: error \}\)/);
  assert.doesNotMatch(repository, /useMutation|refreshMutation/);
});

test('Discover waits for a successful canonical snapshot and locks installs while ownership is stale', () => {
  const page = source('pages/MarketplacePage/MarketplacePage.tsx');
  const repository = source('repositories/discoverRepository.ts');

  assert.match(page, /useDiscoverAppsQuery\(applicationState\.freshness\.hasUsableData\)/);
  assert.match(page, /selectedAppInstallLocked = !applicationState\.freshness\.isCurrent/);
  assert.match(page, /Refresh app information before reviewing or starting an install/);
  assert.match(repository, /queryKey: discoverQueryKeys\.apps/);
  assert.doesNotMatch(repository, /applicationStateUpdatedAt/);
  assert.match(repository, /enabled,/);
});

test('app-specific empty states require a successful canonical snapshot', () => {
  const home = source('pages/OverviewPage/OverviewPage.tsx');
  const applications = source('pages/ApplicationsPage/ApplicationsPage.tsx');

  const boundary = source('components/autark-os/ApplicationStateNotice.tsx');
  assert.match(home, /<ApplicationStateContent><InstalledAppsLauncher/);
  assert.match(applications, /<ApplicationStateContent>/);
  assert.match(boundary, /if \(appState\.freshness\.hasUsableData\) return children/);
});

test('a canonical action-result snapshot clears an older shared transport failure', async () => {
  const client = new QueryClient();
  const snapshot = { applications: [], updatedAt: '2026-09-20T10:00:00Z', stale: false, refreshStatus: 'idle', lastError: null } as ApplicationState;
  client.setQueryData(applicationStateQueryKey, snapshot);
  await assert.rejects(client.fetchQuery({ queryKey: applicationStateQueryKey, queryFn: () => Promise.reject(new Error('Unavailable')), retry: false }));
  assert.equal(applicationStateFreshness(client.getQueryData(applicationStateQueryKey), { transportError: client.getQueryState(applicationStateQueryKey)?.error }).phase, 'stale');
  assert.equal(setApplicationStateFromActionResultCache(client, { applicationState: snapshot }), true);
  assert.equal(client.getQueryState(applicationStateQueryKey)?.error, null);
  assert.equal(applicationStateFreshness(client.getQueryData(applicationStateQueryKey), { transportError: client.getQueryState(applicationStateQueryKey)?.error }).phase, 'current');
  client.clear();
});

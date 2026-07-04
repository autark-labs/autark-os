import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  accessDeepLinkForManagedApp,
  accessDeepLinkForObservedService,
  accessDeepLinkForService,
  accessDeepLinkForTab,
  findAccessDeepLinkTarget,
  parseAccessDeepLink,
} from '../NetworkPage.deepLinks';
import type { ReachabilityService } from '../NetworkPage.types';

const managedService = {
  id: 'vaultwarden',
  type: 'managed-app',
  label: 'Vaultwarden',
} as ReachabilityService;

const pinnedService = {
  id: 'obs_router',
  type: 'external-service',
  label: 'Router',
} as ReachabilityService;

test('access deep links default to the matrix tab and parse service focus', () => {
  assert.deepEqual(parseAccessDeepLink(''), {
    id: null,
    key: ':matrix',
    kind: null,
    tab: 'matrix',
  });

  assert.deepEqual(parseAccessDeepLink('?tab=issues&focus=app:vaultwarden'), {
    id: 'vaultwarden',
    key: 'managed:vaultwarden:issues',
    kind: 'managed',
    tab: 'issues',
  });
});

test('access deep links generate stable managed and pinned-service routes', () => {
  assert.equal(accessDeepLinkForService(managedService), '/access?tab=matrix&focus=managed%3Avaultwarden');
  assert.equal(accessDeepLinkForService(pinnedService, { tab: 'issues' }), '/access?tab=issues&focus=service%3Aobs_router');
  assert.equal(accessDeepLinkForManagedApp('syncthing'), '/access?tab=matrix&focus=managed%3Asyncthing');
  assert.equal(accessDeepLinkForObservedService('docker:homepage'), '/access?tab=matrix&focus=service%3Adocker%3Ahomepage');
  assert.equal(accessDeepLinkForTab('advanced'), '/access?tab=advanced');
});

test('access deep links find the focused reachability service', () => {
  const services = [managedService, pinnedService];

  assert.equal(findAccessDeepLinkTarget(services, parseAccessDeepLink('?focus=managed:vaultwarden'))?.id, 'vaultwarden');
  assert.equal(findAccessDeepLinkTarget(services, parseAccessDeepLink('?focus=service:obs_router'))?.id, 'obs_router');
  assert.equal(findAccessDeepLinkTarget(services, parseAccessDeepLink('?focus=service:missing')), null);
});

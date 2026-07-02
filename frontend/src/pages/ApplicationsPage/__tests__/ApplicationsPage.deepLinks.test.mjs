import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationDeepLinkForManagedApp,
  applicationDeepLinkForObservedService,
  filterForApplicationDeepLinkTarget,
  findApplicationDeepLinkTarget,
  parseApplicationsDeepLink,
} from '../extensions/ApplicationsPage.deepLinks.js';

test('builds durable My Apps links for managed apps and observed services', () => {
  assert.equal(
    applicationDeepLinkForManagedApp('syncthing', { tab: 'settings' }),
    '/apps?focus=managed%3Asyncthing&tab=settings',
  );
  assert.equal(
    applicationDeepLinkForObservedService({ id: 'docker:homepage', catalogAppId: 'homepage' }),
    '/apps?focus=service%3Adocker%3Ahomepage',
  );
  assert.equal(
    applicationDeepLinkForObservedService({ id: '', catalogAppId: 'homepage' }),
    '/apps?focus=catalog%3Ahomepage',
  );
});

test('parses My Apps deep links into stable focus targets', () => {
  assert.deepEqual(parseApplicationsDeepLink('?focus=service%3Adocker%3Ahomepage&tab=recovery'), {
    id: 'docker:homepage',
    key: 'service:docker:homepage:recovery',
    kind: 'service',
    tab: 'recovery',
  });
  assert.deepEqual(parseApplicationsDeepLink('?focus=app%3Avaultwarden'), {
    id: 'vaultwarden',
    key: 'managed:vaultwarden:',
    kind: 'managed',
    tab: null,
  });
  assert.equal(parseApplicationsDeepLink('?focus=unknown%3Athing').kind, null);
});

test('parses legacy My Apps app and service query params as focus targets', () => {
  assert.deepEqual(parseApplicationsDeepLink('?service=docker%3Avaultwarden'), {
    id: 'docker:vaultwarden',
    key: 'service:docker:vaultwarden:',
    kind: 'service',
    tab: null,
  });
  assert.deepEqual(parseApplicationsDeepLink('?app=vaultwarden'), {
    id: 'vaultwarden',
    key: 'managed:vaultwarden:',
    kind: 'managed',
    tab: null,
  });
});

test('matches deep-link targets without falling back to another app', () => {
  const items = [
    {
      id: 'syncthing',
      sourceId: 'syncthing',
      catalogAppId: 'syncthing',
      managementState: 'managed',
    },
    {
      id: 'observed:docker:homepage',
      sourceId: 'docker:homepage',
      catalogAppId: 'homepage',
      managementState: 'found',
    },
    {
      id: 'observed:external-dashboard',
      sourceId: 'external-dashboard',
      catalogAppId: null,
      managementState: 'linked',
    },
  ];

  assert.equal(findApplicationDeepLinkTarget(items, parseApplicationsDeepLink('?focus=service%3Adocker%3Ahomepage'))?.id, 'observed:docker:homepage');
  assert.equal(findApplicationDeepLinkTarget(items, parseApplicationsDeepLink('?focus=catalog%3Ahomepage'))?.id, 'observed:docker:homepage');
  assert.equal(findApplicationDeepLinkTarget(items, parseApplicationsDeepLink('?focus=managed%3Asyncthing'))?.id, 'syncthing');
  assert.equal(findApplicationDeepLinkTarget(items, parseApplicationsDeepLink('?focus=service%3Amissing')), null);
});

test('selects the filter that keeps a deep-linked target visible', () => {
  assert.equal(filterForApplicationDeepLinkTarget({ managementState: 'managed' }), 'managed');
  assert.equal(filterForApplicationDeepLinkTarget({ managementState: 'linked' }), 'pinned');
  assert.equal(filterForApplicationDeepLinkTarget({ managementState: 'found' }), 'found');
});

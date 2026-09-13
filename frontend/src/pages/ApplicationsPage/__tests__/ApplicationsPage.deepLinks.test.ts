import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  applicationDeepLinkForManagedApp,
  applicationDeepLinkForSurfaceItem,
  applicationRouteWithManagementPanel,
  filterForApplicationDeepLinkTarget,
  findApplicationDeepLinkTarget,
  parseApplicationsDeepLink,
} from '../extensions/ApplicationsPage.deepLinks';

test('builds managed-app focus links', () => {
  assert.equal(
    applicationDeepLinkForManagedApp('syncthing', { panel: 'manage', tab: 'settings' }),
    '/apps?focus=managed%3Asyncthing&panel=manage&tab=settings',
  );
  assert.equal(
    applicationDeepLinkForSurfaceItem({ id: 'vaultwarden', sourceId: 'vaultwarden', managementState: 'managed' } as never),
    '/apps?focus=managed%3Avaultwarden',
  );
});

test('parses only managed My Apps deep links', () => {
  assert.deepEqual(parseApplicationsDeepLink('?focus=app%3Avaultwarden'), {
    id: 'vaultwarden',
    key: 'managed:vaultwarden::',
    kind: 'managed',
    panel: null,
    tab: null,
  });
  assert.equal(parseApplicationsDeepLink('?focus=service%3Adocker%3Ahomepage').kind, null);
  assert.equal(parseApplicationsDeepLink('?service=docker%3Avaultwarden').kind, null);
});

test('opens the management panel only for managed-app focus routes', () => {
  assert.equal(
    applicationRouteWithManagementPanel('/apps?focus=managed%3Avaultwarden'),
    '/apps?focus=managed%3Avaultwarden&panel=manage',
  );
  assert.equal(
    applicationRouteWithManagementPanel('/apps?focus=service%3Adocker%3Ahomepage'),
    '/apps?focus=service%3Adocker%3Ahomepage',
  );
  assert.equal(applicationRouteWithManagementPanel('/discover?app=vaultwarden'), '/discover?app=vaultwarden');
});

test('matches managed targets without falling back to another app', () => {
  const item = { id: 'syncthing', sourceId: 'syncthing', managementState: 'managed' as const };

  assert.equal(findApplicationDeepLinkTarget([item] as never, parseApplicationsDeepLink('?focus=managed:syncthing'))?.id, 'syncthing');
  assert.equal(findApplicationDeepLinkTarget([item] as never, parseApplicationsDeepLink('?focus=managed:missing')), null);
  assert.equal(filterForApplicationDeepLinkTarget(item as never), 'managed');
});

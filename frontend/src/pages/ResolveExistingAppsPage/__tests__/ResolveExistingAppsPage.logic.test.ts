import assert from 'node:assert/strict';
import { test } from 'vitest';
import { visibleResolveExistingServices } from '../ResolveExistingAppsPage.logic';

function service(overrides = {}) {
  return {
    id: 'obs_vaultwarden',
    displayName: 'Vaultwarden',
    managedByThisAutarkOs: false,
    userStatus: 'found_on_server',
    userStatusLabel: 'Found',
    userStatusDescription: 'Found on this server.',
    availableActions: [],
    ...overrides,
  };
}

test('visibleResolveExistingServices keeps only recoverable and blocking resources', () => {
  const services = [
    service({ id: 'managed', managedByThisAutarkOs: true, userStatus: 'installed_managed' }),
    service({ id: 'found' }),
    service({ id: 'recoverable', userStatus: 'recoverable' }),
    service({ id: 'blocked', userStatus: 'blocked' }),
  ];

  assert.deepEqual(visibleResolveExistingServices(services).map((item) => item.id), ['recoverable', 'blocked']);
});

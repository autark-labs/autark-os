import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  resolveExistingServiceActions,
  visibleResolveExistingServices,
} from '../ResolveExistingAppsPage.logic';

function service(overrides = {}) {
  return {
    id: 'obs_vaultwarden',
    displayName: 'Vaultwarden',
    managedByThisAutarkOs: false,
    pinned: false,
    userStatus: 'found_on_server',
    userStatusLabel: 'Found',
    userStatusDescription: 'Found on this server.',
    availableActions: [],
    ...overrides,
  };
}

test('visibleResolveExistingServices keeps observed services visible except current managed apps', () => {
  const services = [
    service({ id: 'managed', managedByThisAutarkOs: true, userStatus: 'installed_managed' }),
    service({ id: 'found' }),
    service({ id: 'pinned', pinned: true, userStatus: 'pinned_external' }),
  ];

  assert.deepEqual(visibleResolveExistingServices(services).map((item) => item.id), ['found', 'pinned']);
});

test('resolveExistingServiceActions expose review and pin routes without hide or delete controls', () => {
  const actions = resolveExistingServiceActions(service({
    url: 'http://localhost:8080',
    availableActions: [{ id: 'pin', disabled: false }],
  })).map((action) => action.id);

  assert.deepEqual(actions, ['open', 'review', 'pin']);
  assert.equal(actions.includes('ignore'), false);
  assert.equal(actions.includes('delete-data'), false);
});

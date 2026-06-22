import assert from 'node:assert/strict';
import test from 'node:test';
import { observedServicesWithoutOwnership, pinnedExternalViewsFromObservedServices, splitOwnershipViews } from './ApplicationsPage.ownershipModel.js';

test('splitOwnershipViews separates managed, pinned, and observed services', () => {
  const split = splitOwnershipViews([
    { catalogAppId: 'vaultwarden', state: 'installed_managed', installed: true, ownedByCurrentInstance: true },
    { catalogAppId: 'jellyfin', state: 'pinned_external', installed: false, ownedByCurrentInstance: false },
    { catalogAppId: 'homepage', state: 'recoverable', installed: false, ownedByCurrentInstance: false },
    { catalogAppId: 'foreign', state: 'managed_elsewhere', installed: false, ownedByCurrentInstance: false },
  ]);

  assert.deepEqual(split.managed.map((view) => view.catalogAppId), ['vaultwarden']);
  assert.deepEqual(split.pinned.map((view) => view.catalogAppId), ['jellyfin']);
  assert.deepEqual(split.main.map((view) => view.catalogAppId), ['vaultwarden', 'jellyfin']);
  assert.deepEqual(split.observed.map((view) => view.catalogAppId), ['jellyfin', 'homepage', 'foreign']);
});

test('observedServicesWithoutOwnership keeps unmatched observed services visible without adding them to the main grid', () => {
  const unmatched = observedServicesWithoutOwnership(
    [
      { id: 'obs_gitlab', displayName: 'gitlab', url: 'http://localhost:2224', category: 'External', accessScope: 'LAN', catalogAppId: null, userStatus: 'found_on_server', userStatusLabel: 'Found', userStatusDescription: 'Found on this server.', pinned: false, availableActions: [] },
      { id: 'obs_vaultwarden', displayName: 'homelab-vaultwarden', url: 'http://localhost:8081', category: 'External', accessScope: 'LAN', catalogAppId: null, userStatus: 'pinned_external', userStatusLabel: 'Pinned', userStatusDescription: 'Pinned to My Apps.', pinned: true, availableActions: [] },
    ],
    [
      { catalogAppId: 'vaultwarden', state: 'pinned_external', observedService: { id: 'obs_vaultwarden' } },
    ],
  );

  assert.deepEqual(unmatched.map((view) => [view.observedService.id, view.name, view.reviewExistingHref]), [
    ['obs_gitlab', 'gitlab', '/apps?service=obs_gitlab'],
  ]);
  assert.equal(unmatched[0].state, 'found_on_server');
  assert.equal(unmatched[0].installCopyWarningRequired, false);
});

test('pinnedExternalViewsFromObservedServices includes pinned services without catalog matches', () => {
  const pinned = pinnedExternalViewsFromObservedServices([
    { id: 'manual:gitlab', displayName: 'gitlab', url: 'http://localhost:2224', category: 'External', accessScope: 'LAN', catalogAppId: null, userStatus: 'pinned_external', userStatusLabel: 'Pinned', userStatusDescription: 'Pinned to My Apps.', availableActions: [] },
    { id: 'docker:uptime-kuma', displayName: 'uptime-kuma', url: 'http://localhost:3001', category: 'External', accessScope: 'LAN', catalogAppId: 'uptime-kuma', userStatus: 'pinned_external', userStatusLabel: 'Pinned', userStatusDescription: 'Pinned to My Apps.', availableActions: [] },
    { id: 'docker:vaultwarden', displayName: 'vaultwarden', catalogAppId: 'vaultwarden', userStatus: 'recoverable', userStatusLabel: 'Recoverable', userStatusDescription: 'Recoverable.', pinned: true, availableActions: [] },
  ]);

  assert.deepEqual(pinned.map((view) => [view.observedService.id, view.name, view.state]), [
    ['manual:gitlab', 'gitlab', 'pinned_external'],
    ['docker:uptime-kuma', 'uptime-kuma', 'pinned_external'],
    ['docker:vaultwarden', 'vaultwarden', 'recoverable'],
  ]);
});

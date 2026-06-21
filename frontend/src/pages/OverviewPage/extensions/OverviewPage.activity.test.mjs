import assert from 'node:assert/strict';
import test from 'node:test';
import { homeMajorActivity, isMajorHomeActivity } from './OverviewPage.activity.js';

function event(overrides = {}) {
  return {
    action: 'install_app',
    category: 'marketplace',
    outcome: 'completed',
    title: 'App installed',
    ...overrides,
  };
}

test('Home activity keeps major user actions and hides background noise', () => {
  const activity = homeMajorActivity([
    event({ action: 'health_poll', category: 'health', title: 'Health poll' }),
    event({ action: 'refresh', category: 'api', title: 'Refresh' }),
    event({ action: 'recover_found_app', category: 'host', title: 'Found app recovered' }),
    event({ action: 'backup_created', category: 'backup', title: 'Backup created' }),
    event({ action: 'status_sync', category: 'system', title: 'Status sync' }),
  ]);

  assert.deepEqual(activity.map((item) => item.action), ['recover_found_app', 'backup_created']);
});

test('Home activity accepts the expected MVP action vocabulary', () => {
  assert.equal(isMajorHomeActivity(event({ action: 'delete_found_data', category: 'host' })), true);
  assert.equal(isMajorHomeActivity(event({ action: 'tailscale_signed_in', category: 'access' })), true);
  assert.equal(isMajorHomeActivity(event({ action: 'diagnostic_refresh', category: 'diagnostics' })), false);
});

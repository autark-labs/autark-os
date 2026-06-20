import assert from 'node:assert/strict';
import test from 'node:test';
import { advancedNavigation, navigationGroups, primaryNavigation, routeAliases } from './navigationModel.js';

test('basic navigation exposes only seven MVP routes', () => {
  const items = navigationGroups('basic').flatMap((group) => group.items);

  assert.equal(items.length, 7);
  assert.deepEqual(items.map((item) => item.label), ['Home', 'My Apps', 'Discover', 'Access', 'Backups', 'Storage', 'Settings']);
  assert.equal(items.some((item) => ['Automation', 'Updates', 'Devices', 'Access Map'].includes(item.label)), false);
});

test('advanced navigation separates diagnostics and activity log', () => {
  const groups = navigationGroups('advanced');

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1].items.map((item) => item.label), ['Diagnostics', 'Activity Log']);
  assert.deepEqual(advancedNavigation.map((item) => item.to), ['/diagnostics', '/activity']);
});

test('old routes have intentional aliases to MVP routes', () => {
  assert.equal(routeAliases['/applications'], '/apps');
  assert.equal(routeAliases['/marketplace'], '/discover');
  assert.equal(routeAliases['/network'], '/access');
  assert.equal(routeAliases['/devices'], '/access');
  assert.equal(routeAliases['/updates'], '/apps');
});

test('primary navigation remains within MVP scope', () => {
  assert.equal(primaryNavigation.length <= 7, true);
  assert.equal(primaryNavigation.find((item) => item.id === 'access')?.to, '/access');
});

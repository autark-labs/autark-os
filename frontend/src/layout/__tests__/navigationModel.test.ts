import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { advancedNavigation, navigationGroups, primaryNavigation, routeAliases } from '../navigationModel';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('basic navigation focuses on the five core appliance routes', () => {
  const items = navigationGroups('basic').flatMap((group) => group.items);

  assert.deepEqual(items.map((item) => item.label), ['Home', 'My Apps', 'Discover', 'Access', 'Backups']);
  assert.equal(items.some((item) => ['Storage', 'Settings', 'Diagnostics', 'Activity Log'].includes(item.label)), false);
});

test('advanced navigation keeps operational pages reachable outside basic mode', () => {
  const groups = navigationGroups('advanced');

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map((item) => item.label), ['Home', 'My Apps', 'Discover', 'Access', 'Backups']);
  assert.deepEqual(groups[1].items.map((item) => item.label), ['Storage', 'Settings', 'Diagnostics', 'Activity Log']);
  assert.deepEqual(advancedNavigation.map((item) => item.to), ['/storage', '/settings', '/diagnostics', '/activity']);
});

test('old active concepts have intentional aliases to MVP routes', () => {
  assert.equal(routeAliases['/applications'], '/apps');
  assert.equal(routeAliases['/marketplace'], '/discover');
  assert.equal(routeAliases['/network'], '/access');
  assert.equal(routeAliases['/devices'], undefined);
  assert.equal(routeAliases['/updates'], undefined);
});

test('primary navigation remains within MVP scope', () => {
  assert.equal(primaryNavigation.length, 5);
  assert.equal(primaryNavigation.find((item) => item.id === 'access')?.to, '/access');
});

test('operational pages removed from basic nav remain reachable through contextual links', () => {
  assert.match(source('src/pages/BackupsPage/BackupsPage.tsx'), /to="\/storage"/);
  assert.match(source('src/layout/SystemStatusHeader.tsx'), /to="\/settings"/);
});

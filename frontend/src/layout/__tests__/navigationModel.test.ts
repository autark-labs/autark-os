import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { systemNavigation, navigationGroups, primaryNavigation, routeAliases } from '../navigationModel';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('system navigation keeps operational pages always reachable', () => {
  const groups = navigationGroups();

  assert.equal(groups.length, 2);
  assert.equal(groups[1].label, 'System');
  assert.deepEqual(groups[0].items.map((item) => item.label), ['Home', 'My Apps', 'Discover', 'Access', 'Backups']);
  assert.deepEqual(groups[1].items.map((item) => item.label), ['Storage', 'Activity Log', 'Diagnostics']);
  assert.deepEqual(systemNavigation.map((item) => item.to), ['/storage', '/activity', '/diagnostics']);
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
  assert.equal(primaryNavigation.some((item) => item.id === 'pro'), false);
});

test('system destinations retain explicit routes', () => {
  assert.equal(systemNavigation.some((item) => item.to === '/storage'), true);
  assert.match(source('src/layout/Sidebar.tsx'), /openSettings/);
});

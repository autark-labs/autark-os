import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { primaryNavigation, routeAliases } from '../navigationModel.js';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('unrouted legacy pages and route aliases stay deleted', () => {
  assert.equal(existsSync(resolve(root, 'src/pages/DevicesPage')), false);
  assert.equal(existsSync(resolve(root, 'src/pages/UpdatesPage')), false);
  assert.equal(existsSync(resolve(root, 'src/pages/PlaceholderPage')), false);

  assert.equal('/devices' in routeAliases, false);
  assert.equal('/updates' in routeAliases, false);
  assert.equal(primaryNavigation.some((item) => item.activePaths.includes('/devices')), false);

  assert.doesNotMatch(source('src/App.tsx'), /DevicesPage|UpdatesPage|PlaceholderPage|path="\/devices"|path="\/updates"/);
});

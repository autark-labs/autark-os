import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { appRoutes, directRoutePaths, routeAliases, specialRoutes } from '../appRouteManifest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('the shared manifest declares every active route and keeps Pro directly reloadable', () => {
  assert.deepEqual(Object.values(appRoutes), [
    '/home', '/apps', '/discover', '/access', '/storage', '/backups', '/pro', '/activity', '/settings', '/diagnostics',
  ]);
  assert.deepEqual(directRoutePaths, [
    '/', '/setup', '/apps/found', '/resolve-existing-apps',
    '/home', '/apps', '/discover', '/access', '/storage', '/backups', '/pro', '/activity', '/settings', '/diagnostics',
  ]);
  assert.equal(routeAliases['/overview'], appRoutes.home);
  assert.equal(routeAliases['/applications'], appRoutes.apps);
  assert.equal(specialRoutes.foundApps, '/apps/found');
});

test('the app renders a route from the manifest, preserves legacy query strings, and has an intentional wildcard route', () => {
  const app = source('src/App.tsx');

  for (const routeName of Object.keys(appRoutes)) {
    assert.match(app, new RegExp(`path=\\{appRoutes\\.${routeName}\\}`));
  }
  assert.match(app, /path=\{specialRoutes\.foundApps\}/);
  assert.match(app, /path="\*" element=\{<LazyRoute pageName="Page not found"><NotFoundPage/);
  assert.match(app, /hash: location\.hash, pathname: to, search: location\.search/);
  assert.match(app, /RouteLoadErrorBoundary/);
});

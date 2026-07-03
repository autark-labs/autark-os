import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Access page data loading is owned by the network repository', () => {
  const networkPage = source('src/pages/NetworkPage/NetworkPage.tsx');
  const networkRepository = source('src/repositories/networkRepository.ts');

  assert.doesNotMatch(networkPage, /setInterval|clearInterval|loadNetwork/);
  assert.doesNotMatch(networkPage, /NetworkAPIClient/);
  assert.match(networkPage, /useAccessNetworkRepository/);
  assert.match(networkPage, /useRemoveStalePrivateAccessMutation/);

  assert.match(networkRepository, /networkQueryKeys/);
  assert.match(networkRepository, /useAccessNetworkRepository/);
  assert.match(networkRepository, /invalidateNetworkQueries/);
  assert.match(networkRepository, /useRemoveStalePrivateAccessMutation/);
  assert.match(networkRepository, /refetchInterval:\s*10_000/);
});

test('Access page private access mutations consume action results without local access projection', () => {
  const networkPage = source('src/pages/NetworkPage/NetworkPage.tsx');

  assert.match(networkPage, /InstalledAppsAPIClient\.enablePrivateAccess\(app\.appId\)/);
  assert.match(networkPage, /InstalledAppsAPIClient\.disablePrivateAccess\(app\.appId\)/);
  assert.match(networkPage, /syncCanonicalAppMutationResult\(queryClient, result\)/);
  assert.match(networkPage, /invalidateNetworkQueries\(queryClient\)/);
  assert.doesNotMatch(networkPage, /setRuntimeAppInApplicationStateCache\(queryClient, result\.app\)/);
  assert.doesNotMatch(networkPage, /invalidateApplicationState\(queryClient\)/);
  assert.doesNotMatch(networkPage, /appWithOptimisticPrivateAccess/);
  assert.doesNotMatch(networkPage, /repairPrivateAccess\(app\.appId\)/);
  assert.doesNotMatch(networkPage, /queryClient\.setQueryData<ApplicationState/);
});

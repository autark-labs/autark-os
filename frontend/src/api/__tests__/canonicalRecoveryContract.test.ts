import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('frontend recovery flows do not use legacy ownership or host inventory clients', () => {
  assert.equal(existsSync(resolve(root, 'src/api/AppOwnershipAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/api/HostInventoryAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/api/ObservedServicesAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/components/autark-os/FoundResourcesBanner.tsx')), false);
  assert.equal(existsSync(resolve(root, 'src/types/host.ts')), false);

  const discoverTypes = source('src/types/discover.ts');
  const applicationStateLogic = source('src/repositories/applicationStateRepository.logic.ts');
  const recoveryClient = source('src/api/AppRecoveryAPIClient.ts');
  const recoverySheet = source('src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx');

  assert.equal(existsSync(resolve(root, 'src/types/appOwnership.ts')), false);
  assert.doesNotMatch(discoverTypes, /foundResource|HostInventoryResource/);
  assert.doesNotMatch(applicationStateLogic, /foundResource/);
  assert.match(recoveryClient, /GET|httpClient\.get<AppRecoveryPlan>/);
  assert.match(recoveryClient, /\/api\/app-recovery\/\$\{encodeURIComponent\(appId\)\}\/plan/);
  assert.match(recoveryClient, /\/api\/app-recovery\/\$\{encodeURIComponent\(appId\)\}\/apply/);
  assert.match(recoverySheet, /RecoveryChecks/);
  assert.doesNotMatch(recoverySheet, /adopt|adoption/i);
});

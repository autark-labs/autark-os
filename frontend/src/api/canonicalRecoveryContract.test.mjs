import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('frontend recovery flows do not use legacy ownership or host inventory clients', () => {
  assert.equal(existsSync(resolve(root, 'src/api/AppOwnershipAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/api/HostInventoryAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/components/autark-os/FoundResourcesBanner.tsx')), false);
  assert.equal(existsSync(resolve(root, 'src/types/host.ts')), false);

  const appOwnershipTypes = source('src/types/appOwnership.ts');
  const discoverTypes = source('src/types/discover.ts');
  const applicationStateLogic = source('src/repositories/applicationStateRepository.logic.js');

  assert.doesNotMatch(appOwnershipTypes, /foundResource|HostInventoryResource/);
  assert.doesNotMatch(discoverTypes, /foundResource|HostInventoryResource/);
  assert.doesNotMatch(applicationStateLogic, /foundResource/);
});

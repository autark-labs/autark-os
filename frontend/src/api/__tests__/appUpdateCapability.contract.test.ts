import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('the production frontend exposes planned managed app update and rollback actions', () => {
  const client = source('src/api/InstalledAppsAPIClient.ts');
  const repository = source('src/repositories/applicationStateRepository.ts');
  const appTypes = source('src/types/app.ts');

  assert.match(client, /\/api\/apps\/\$\{appId\}\/update-plan/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/rollback-plan/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/update/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/rollback/);
  assert.doesNotMatch(repository, /useAppUpdatesQuery|appUpdatesQueryKey|invalidateAppUpdates/);
  assert.match(appTypes, /AppUpdatePlan/);
  assert.equal(existsSync(resolve(root, 'src/pages/UpdatesPage')), false);
});

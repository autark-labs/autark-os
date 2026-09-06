import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('the production frontend keeps managed app updates behind beta scope while retaining recovery actions', () => {
  const client = source('src/api/InstalledAppsAPIClient.ts');
  const repository = source('src/repositories/applicationStateRepository.ts');
  const appTypes = source('src/types/app.ts');

  assert.match(client, /\/api\/apps\/\$\{appId\}\/update-plan/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/rollback-plan/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/update/);
  assert.match(client, /\/api\/apps\/\$\{appId\}\/rollback/);
  assert.match(client, /class AppUpdatePlanChangedError/);
  assert.match(client, /error\.response\?\.status === 409/);
  assert.doesNotMatch(repository, /useAppUpdatesQuery|appUpdatesQueryKey|invalidateAppUpdates/);
  assert.match(appTypes, /AppUpdatePlan/);
  const section = source('src/pages/ApplicationsPage/managementTabs/ApplicationUpdateSection.tsx');
  assert.match(section, /betaScope\.managedAppUpdatesAvailable && \(/);
  assert.match(section, /plan\.canApply && plan\.guardianAdvice\.state === 'ready'/);
  assert.match(section, /error instanceof AppUpdatePlanChangedError/);
  assert.equal(existsSync(resolve(root, 'src/pages/UpdatesPage')), false);
});

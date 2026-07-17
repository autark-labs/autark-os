import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('the production frontend has no app update client, query, or update action types', () => {
  const client = source('src/api/InstalledAppsAPIClient.ts');
  const repository = source('src/repositories/applicationStateRepository.ts');
  const appTypes = source('src/types/app.ts');

  assert.doesNotMatch(client, /\/api\/apps\/updates|updatePlan|updateApp|rollbackApp/);
  assert.doesNotMatch(repository, /useAppUpdatesQuery|appUpdatesQueryKey|invalidateAppUpdates/);
  assert.doesNotMatch(appTypes, /AppUpdateStatus|AppUpdatePlan|AppUpdateResult/);
  assert.equal(existsSync(resolve(root, 'src/pages/UpdatesPage')), false);
});

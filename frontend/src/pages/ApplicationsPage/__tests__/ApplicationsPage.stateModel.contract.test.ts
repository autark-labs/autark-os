import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('My Apps consumes relationship, runtime, operation, and issues without legacy status aliases', () => {
  const appTypes = source('src/types/applicationState.ts');
  const runtimeTypes = source('src/types/app.ts');
  const surfaceTypes = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.types.ts');
  const liveModel = source('src/pages/ApplicationsPage/extensions/ApplicationsPage.liveModel.ts');
  const repository = source('src/repositories/applicationStateRepository.logic.ts');

  assert.match(appTypes, /relationship: ApplicationRelationship/);
  assert.match(appTypes, /operation: BackendAppOperationState/);
  assert.match(appTypes, /issues: AutarkOsIssue\[\]/);
  assert.match(runtimeTypes, /state: ApplicationRuntimeState/);
  assert.match(surfaceTypes, /relationship: 'managed'/);
  assert.match(surfaceTypes, /state: ApplicationRuntimeState/);
  assert.match(surfaceTypes, /operation: AppOperationState/);
  assert.match(surfaceTypes, /issues: AutarkOsIssue\[\]/);
  for (const text of [appTypes, runtimeTypes, surfaceTypes, liveModel, repository]) {
    assert.doesNotMatch(text, /managementState|readinessState|attentionState|friendlyStatus|technicalStatus/);
  }
  assert.doesNotMatch(repository, /setAutarkOsJobInState|setRuntimeAppInState/);
});

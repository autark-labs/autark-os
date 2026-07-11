import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../../');

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home and My Apps consume the same canonical found-service collection', () => {
  const home = source('pages/OverviewPage/OverviewPage.tsx');
  const applications = source('pages/ApplicationsPage/ApplicationsPage.tsx');
  const repository = source('repositories/applicationStateRepository.ts');

  assert.match(repository, /foundServices: foundServices\(state\)/);
  assert.match(repository, /pinnedExternalServices: pinnedExternalServices\(state\)/);
  assert.match(home, /const pinnedServices = appState\.pinnedExternalServices/);
  assert.match(home, /const observedNeedingReview = appState\.foundServices/);
  assert.match(home, /<Link to="\/apps\/found">Review existing apps<\/Link>/);
  assert.match(applications, /const foundServices = appState\.foundServices/);
  assert.match(applications, /<Link to="\/apps\/found">Review existing apps<\/Link>/);
});

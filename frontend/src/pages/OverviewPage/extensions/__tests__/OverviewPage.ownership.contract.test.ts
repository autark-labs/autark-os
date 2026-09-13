import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../../');

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home is managed-only while My Apps links recovery-worthy resources to review', () => {
  const home = source('pages/OverviewPage/OverviewPage.tsx');
  const applications = source('pages/ApplicationsPage/ApplicationsPage.tsx');
  const repository = source('repositories/applicationStateRepository.ts');

  assert.match(repository, /foundServices: foundServices\(state\)/);
  assert.doesNotMatch(repository, /pinnedExternalServices/);
  assert.doesNotMatch(home, /foundServices|observedServices|pinnedExternalServices|Pinned services/);
  assert.match(applications, /appState\.foundServices\.filter/);
  assert.match(applications, /<FoundAppsPrompt/);
  assert.match(applications, /reviewHref: '\/apps\/found'/);
});

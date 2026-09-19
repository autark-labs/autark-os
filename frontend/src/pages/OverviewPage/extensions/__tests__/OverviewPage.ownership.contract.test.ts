import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../../');

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home is managed-only while My Apps prompts only for executable recovery', () => {
  const home = source('pages/OverviewPage/OverviewPage.tsx');
  const applications = source('pages/ApplicationsPage/ApplicationsPage.tsx');
  const repository = source('repositories/applicationStateRepository.ts');

  assert.match(repository, /applications: applications\(state\)/);
  assert.doesNotMatch(repository, /pinnedExternalServices/);
  assert.doesNotMatch(home, /foundServices|observedServices|pinnedExternalServices|Pinned services/);
  assert.match(applications, /reviewApplications = useMemo\([\s\S]*application\.relationship === 'recovery_required'/);
  assert.match(applications, /<ApplicationReviewPrompt/);
  assert.match(applications, /reviewApplications\[0\]\?\.primaryAction\.href/);
});

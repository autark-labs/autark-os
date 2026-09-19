import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../../');

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home uses the system summary without maintaining unused activity or recommendation queries', () => {
  const page = source('pages/OverviewPage/OverviewPage.tsx');

  assert.doesNotMatch(page, /ActivityAPIClient|SystemAPIClient/);
  assert.doesNotMatch(page, /setInterval|clearInterval|Promise\.allSettled|useEffect/);
  assert.match(page, /useSystemSummaryQuery/);
  assert.match(page, /useApplicationStateRepository/);
  assert.doesNotMatch(page, /useHomeRepository|useHomeActivityQuery|useRecommendedActionQuery/);

  const repository = source('repositories/systemRepository.ts');
  assert.match(repository, /systemQueryKeys/);
  assert.match(repository, /useSystemSummaryQuery/);
  assert.match(repository, /SystemAPIClient\.summary/);
  assert.match(repository, /refetchInterval:\s*30_000/);

  const recommendedActionRepository = source('repositories/recommendedActionRepository.ts');
  assert.match(recommendedActionRepository, /SystemAPIClient\.recommendedAction/);
  assert.match(recommendedActionRepository, /refetchInterval:\s*30_000/);
});

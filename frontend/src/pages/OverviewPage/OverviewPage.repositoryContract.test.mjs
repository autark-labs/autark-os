import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../');

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home remote data loading is owned by the home repository', () => {
  const page = source('pages/OverviewPage/OverviewPage.tsx');
  const repositoryPath = resolve(root, 'repositories/homeRepository.ts');

  assert.equal(existsSync(repositoryPath), true);
  assert.doesNotMatch(page, /ActivityAPIClient|SystemAPIClient/);
  assert.doesNotMatch(page, /setInterval|clearInterval|Promise\.allSettled|useEffect/);
  assert.match(page, /useHomeRepository/);
  assert.match(page, /useApplicationStateRepository/);

  const repository = source('repositories/homeRepository.ts');
  assert.match(repository, /homeQueryKeys/);
  assert.match(repository, /useHomeSummaryQuery/);
  assert.match(repository, /useHomeRecommendedActionQuery/);
  assert.match(repository, /useHomeActivityQuery/);
  assert.match(repository, /useHomeRepository/);
  assert.match(repository, /SystemAPIClient\.summary/);
  assert.match(repository, /useRecommendedActionQuery/);
  assert.match(repository, /ActivityAPIClient\.recent/);
  assert.match(repository, /refetchInterval:\s*30_000/);

  const recommendedActionRepository = source('repositories/recommendedActionRepository.ts');
  assert.match(recommendedActionRepository, /SystemAPIClient\.recommendedAction/);
  assert.match(recommendedActionRepository, /refetchInterval:\s*30_000/);
});

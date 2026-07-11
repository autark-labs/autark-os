import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../../../../');

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home metrics do not advertise clickability unless an action exists', () => {
  const cards = source('pages/OverviewPage/components/HomeCards.tsx');

  assert.match(cards, /interactive=\{Boolean\(action\)\}/);
  assert.doesNotMatch(cards, /className=\{cn\('grid gap-4', className\)\} interactive>/);
});

test('Home dismisses canonical recommendations through the shared persisted mutation', () => {
  const page = source('pages/OverviewPage/OverviewPage.tsx');
  const cards = source('pages/OverviewPage/components/HomeCards.tsx');
  const repository = source('repositories/recommendedActionRepository.ts');
  const client = source('api/SystemAPIClient.ts');

  assert.match(page, /useDismissRecommendedActionMutation/);
  assert.match(page, /dismissRecommendedAction\.mutate\(primaryAction\.id\)/);
  assert.match(cards, /aria-label="Dismiss recommendation"/);
  assert.match(repository, /invalidateQueries\(\{ queryKey: recommendedActionQueryKeys\.all \}\)/);
  assert.match(client, /recommended-action\/\$\{encodeURIComponent\(actionId\)\}\/dismiss/);
});

test('Home app shortcuts deep-link to the specific managed or linked service', () => {
  const page = source('pages/OverviewPage/OverviewPage.tsx');

  assert.match(page, /applicationDeepLinkForManagedApp\(app\.catalogAppId, \{ panel: 'manage' \}\)/);
  assert.match(page, /applicationDeepLinkForObservedService\(service, \{ panel: 'manage' \}\)/);
  assert.doesNotMatch(page, /secondaryTo="\/apps"/);
  assert.doesNotMatch(page, /secondaryTo="\/apps\/found"/);
});

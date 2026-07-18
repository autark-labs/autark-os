import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('the app shell owns canonical recommendations through the notification center', () => {
  const pages = [
    'src/pages/MarketplacePage/MarketplacePage.tsx',
    'src/pages/BackupsPage/BackupsPage.tsx',
    'src/pages/NetworkPage/NetworkPage.tsx',
  ];

  assert.equal(existsSync(resolve(root, 'src/components/autark-os/NotificationCenter.tsx')), true);
  assert.equal(existsSync(resolve(root, 'src/repositories/recommendedActionRepository.ts')), true);

  for (const pagePath of pages) {
    const page = source(pagePath);
    assert.doesNotMatch(page, /CanonicalRecommendedAction/);
    assert.doesNotMatch(page, /SystemAPIClient\.recommendedAction/);
  }

  const repository = source('src/repositories/recommendedActionRepository.ts');
  const component = source('src/components/autark-os/NotificationCenter.tsx');

  assert.match(repository, /recommendedActionQueryKeys/);
  assert.match(repository, /SystemAPIClient\.recommendedAction/);
  assert.doesNotMatch(repository, /dismissRecommendedAction/);
  assert.match(component, /useRecommendedActionQuery/);
  assert.match(component, /sessionStorage/);
  assert.match(component, /no-action-needed/);
  assert.match(component, /Dismiss current recommendation/);
});

test('recommended actions never render a generic unavailable button', () => {
  const component = source('src/components/autark-os/NotificationCenter.tsx');

  assert.doesNotMatch(component, /This action is not available yet/);
  assert.doesNotMatch(component, /DisabledAction/);
});

test('notification-center actions use their declared HTTP method instead of navigating to mutation URLs', () => {
  const component = source('src/components/autark-os/NotificationCenter.tsx');

  assert.match(component, /const method = action\.method\?\.toUpperCase\(\)/);
  assert.match(component, /httpClient\.request\(\{ method, url: action\.href \}\)/);
  assert.match(component, /syncCanonicalAppMutationResult/);
  assert.doesNotMatch(component, /<a[^>]*href=\{action\.href\}/);
});

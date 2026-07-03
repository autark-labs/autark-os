import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('primary pages render canonical recommended action through shared component', () => {
  const pages = [
    'src/pages/MarketplacePage/MarketplacePage.tsx',
    'src/pages/BackupsPage/BackupsPage.tsx',
    'src/pages/NetworkPage/NetworkPage.tsx',
  ];

  assert.equal(existsSync(resolve(root, 'src/components/project-os/CanonicalRecommendedAction.tsx')), true);
  assert.equal(existsSync(resolve(root, 'src/repositories/recommendedActionRepository.ts')), true);

  for (const pagePath of pages) {
    const page = source(pagePath);
    assert.match(page, /CanonicalRecommendedAction/);
    assert.doesNotMatch(page, /SystemAPIClient\.recommendedAction/);
  }

  const repository = source('src/repositories/recommendedActionRepository.ts');
  const component = source('src/components/project-os/CanonicalRecommendedAction.tsx');

  assert.match(repository, /recommendedActionQueryKeys/);
  assert.match(repository, /SystemAPIClient\.recommendedAction/);
  assert.match(component, /useRecommendedActionQuery/);
  assert.match(component, /PrimaryActionCard/);
  assert.match(component, /no-action-needed/);
});

test('recommended actions never render a generic unavailable button', () => {
  const component = source('src/components/project-os/CanonicalRecommendedAction.tsx');

  assert.doesNotMatch(component, /This action is not available yet/);
  assert.doesNotMatch(component, /DisabledAction/);
});

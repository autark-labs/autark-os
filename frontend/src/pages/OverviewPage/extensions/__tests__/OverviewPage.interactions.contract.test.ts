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

test('global notification center owns session-local recommendation dismissal', () => {
  const page = source('pages/OverviewPage/OverviewPage.tsx');
  const notificationCenter = source('components/autark-os/NotificationCenter.tsx');
  const repository = source('repositories/recommendedActionRepository.ts');
  const client = source('api/SystemAPIClient.ts');

  assert.doesNotMatch(page, /RecommendedActionCard/);
  assert.match(notificationCenter, /sessionStorage/);
  assert.match(notificationCenter, /Dismiss current recommendation/);
  assert.match(repository, /SystemAPIClient\.recommendedAction/);
  assert.doesNotMatch(client, /recommended-action\/\$\{encodeURIComponent\(actionId\)\}\/dismiss/);
});

test('Home app shortcuts deep-link to the specific managed or linked service', () => {
  const page = source('pages/OverviewPage/components/HomeDashboardPanels.tsx');

  assert.match(page, /applicationDeepLinkForManagedApp\(app\.catalogAppId, \{ panel: 'manage' \}\)/);
  assert.match(page, /href=\{openUrl \|\| detailRoute\}/);
  assert.doesNotMatch(page, /Open<\/.*button/);
});

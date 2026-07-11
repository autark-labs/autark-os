import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/ApplicationsPage.tsx'), 'utf8');
const advancedView = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/AdvancedApplicationsView.tsx'), 'utf8');
const card = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/ApplicationCard.tsx'), 'utf8');

test('My Apps renders canonical managed and linked collections without mixing in found services', () => {
  assert.match(page, /const managedItems = useMemo\(\(\) => items\.filter\(\(item\) => item\.managementState === 'managed'\)/);
  assert.match(page, /const linkedItems = useMemo\(\(\) => items\.filter\(\(item\) => item\.managementState === 'linked'\)/);
  assert.match(page, /if \(item\.managementState === 'found'\) \{\s+return false;/);
  assert.match(page, /<ApplicationCollectionFilterDropdown filters=\{collectionFilters\}/);
  assert.match(page, /Linked services/);
  assert.match(page, /<BasicApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(page, /<AdvancedApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(card, /<ManagementBadge item=\{item\} \/>/);
  assert.match(card, /line-clamp-2 min-h-11 max-w-full/);
  assert.match(card, /title=\{item\.name\}/);
  assert.match(advancedView, /<ManagementBadge item=\{item\} \/>/);
  assert.match(page, /title="My Apps"/);
});

test('My Apps sends non-managed services to the dedicated existing-app review flow', () => {
  assert.match(page, /const foundServices = appState\.foundServices/);
  assert.match(page, /FoundAppsPrompt/);
  assert.match(page, /reviewHref: '\/apps\/found'/);
  assert.match(page, /navigate\(`\/apps\/found\$\{serviceQuery\}`, \{ replace: true \}\)/);
});

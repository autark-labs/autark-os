import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/ApplicationsPage.tsx'), 'utf8');
const advancedView = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/AdvancedApplicationsView.tsx'), 'utf8');
const card = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/ApplicationCard.tsx'), 'utf8');
const header = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/AppsPageHeader.tsx'), 'utf8');
const stateBadges = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/AppStateBadges.tsx'), 'utf8');

test('My Apps renders canonical managed and linked collections without mixing in found services', () => {
  assert.match(page, /const managedItems = useMemo\(\(\) => items\.filter\(\(item\) => item\.managementState === 'managed'\)/);
  assert.match(page, /const linkedItems = useMemo\(\(\) => items\.filter\(\(item\) => item\.managementState === 'linked'\)/);
  assert.match(page, /if \(item\.managementState === 'found'\) \{\s+return false;/);
  assert.match(page, /<ApplicationCollectionFilterDropdown filters=\{collectionFilters\}/);
  assert.match(page, /Linked services/);
  assert.match(page, /<BasicApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(page, /<AdvancedApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(card, /<AppArtwork/);
  assert.match(card, /h-56 w-48/);
  assert.match(card, /card\.setAttribute\('inert', ''\)/);
  assert.match(card, /<AppCardName/);
  assert.match(advancedView, /<AppCardName/);
  assert.match(advancedView, /table-fixed/);
  assert.match(advancedView, /sticky left-0/);
  assert.match(advancedView, /h-16/);
  assert.match(advancedView, /min-w-\[41rem\]/);
  assert.match(advancedView, /<col className="w-36" \/>[\s\S]*<col className="w-28" \/>[\s\S]*<col className="w-24" \/>[\s\S]*<col className="w-20" \/>/);
  assert.doesNotMatch(advancedView, /min-w-\[74rem\]/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_19rem\]/);
  assert.doesNotMatch(advancedView, /Recent activity/);
  assert.match(advancedView, /<ManagementBadge item=\{item\} \/>/);
  assert.match(header, /title="My Apps"/);
  assert.match(header, /<AppWindow aria-hidden="true" className="size-5" \/>/);
});

test('My Apps uses quiet status dots and compact action affordances on dark app cards', () => {
  assert.match(stateBadges, /<StatusBadge\s+appearance="solid"/);
  assert.match(stateBadges, /<MetadataBadge appearance="solid" tone="neutral">/);
  assert.match(card, /labelForManagementState\(item\.managementState\)/);
  assert.match(card, /statusLabel\(item\)/);
  assert.match(card, /DropdownMenuContent/);
  assert.match(card, /aria-label=\{`Open \$\{item\.name\}`\}/);
});

test('My Apps sends non-managed services to the dedicated existing-app review flow', () => {
  assert.match(page, /const foundServices = appState\.foundServices/);
  assert.match(page, /FoundAppsPrompt/);
  assert.match(page, /reviewHref: '\/apps\/found'/);
  assert.match(page, /navigate\(`\/apps\/found\$\{serviceQuery\}`, \{ replace: true \}\)/);
});

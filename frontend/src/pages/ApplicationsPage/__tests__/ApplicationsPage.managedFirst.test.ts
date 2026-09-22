import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/ApplicationsPage.tsx'), 'utf8');
const advancedView = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/AdvancedApplicationsView.tsx'), 'utf8');
const card = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/ApplicationCard.tsx'), 'utf8');
const stateBadges = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/components/AppStateBadges.tsx'), 'utf8');

test('My Apps renders only canonical managed applications', () => {
  assert.match(page, /const managedItems = items/);
  assert.match(page, /<ApplicationCollectionFilterDropdown filters=\{collectionFilters\}/);
  assert.doesNotMatch(page, /Linked services|linkedItems|pinned_external/);
  assert.match(page, /<BasicApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(page, /<AdvancedApplicationsView[\s\S]*items=\{visibleItems\}/);
  assert.match(card, /<AppArtwork/);
  assert.match(card, /h-56 w-48/);
  assert.match(card, /<AppCardName/);
  assert.match(advancedView, /<AppCardName/);
  assert.match(advancedView, /table-fixed/);
  assert.match(advancedView, /sticky left-0/);
  assert.match(advancedView, /h-16/);
  assert.match(advancedView, /min-w-\[41rem\]/);
  assert.match(advancedView, /<col className="w-36" \/>[\s\S]*<col className="w-28" \/>[\s\S]*<col className="w-24" \/>[\s\S]*<col className="w-20" \/>/);
  assert.doesNotMatch(advancedView, /min-w-\[74rem\]/);
  assert.doesNotMatch(advancedView, /Recent activity/);
  assert.match(advancedView, /<RelationshipBadge \/>/);
});

test('My Apps uses quiet status dots and compact action affordances on dark app cards', () => {
  assert.match(stateBadges, /<StatusBadge\s+appearance="solid"/);
  assert.match(stateBadges, /<MetadataBadge appearance="solid" tone="neutral">/);
  assert.match(card, /labelForRelationship\(item\.relationship\)/);
  assert.match(card, /statusLabel\(item\)/);
  assert.match(card, /DropdownMenuContent/);
  assert.match(card, /aria-label=\{`Open \$\{item\.name\}`\}/);
});

test('My Apps prompts only for preflighted recovery while retaining direct conflict review', () => {
  assert.match(page, /<JobProgress compact job=\{job\}/);
  assert.match(page, /reviewApplications = useMemo\([\s\S]*application\.relationship === 'recovery_required'/);
  assert.match(page, /reviewedApplication = appState\.applications\.find[\s\S]*application\.relationship === 'blocked'/);
  assert.match(page, /<ApplicationReviewDialog/);
  assert.doesNotMatch(page, /focus=service|deepLinkTarget\.kind === 'service'/);
});

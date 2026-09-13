import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('active product copy distinguishes managed apps, recovery, and conflicts', () => {
  const firstRunGuide = source('../docs/first-run.md');
  const applicationsHeader = source('src/pages/ApplicationsPage/components/AppsPageHeader.tsx');
  const foundServiceDetails = source('src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx');
  const installer = source('../scripts/autark-os-gui-installer.sh');

  assert.match(firstRunGuide, /\*\*Managed app\*\*/);
  assert.match(firstRunGuide, /\*\*Recovery required\*\*/);
  assert.match(firstRunGuide, /\*\*Blocked\*\*/);
  assert.doesNotMatch(firstRunGuide, /Linked service/);
  assert.match(applicationsHeader, /Open, manage, and monitor apps installed by Autark-OS\./);
  assert.match(foundServiceDetails, /Catalog match/);
  assert.match(installer, /Discover app installs/);
  assert.doesNotMatch(installer, /Marketplace app installs/);
});

test('the product only describes backup protection after a restore point exists', () => {
  const firstRunGuide = source('../docs/first-run.md');
  const settingsPanels = source('src/pages/SettingsPage/SettingsPage.panels.tsx');

  assert.match(firstRunGuide, /\*\*Protected by a restore point\*\*/);
  assert.match(settingsPanels, /Installed apps with at least one completed restore point\./);
});

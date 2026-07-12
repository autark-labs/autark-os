import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('active product copy distinguishes Discover, managed apps, found services, and linked services', () => {
  const terminology = source('../docs/product-terminology.md');
  const applications = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const foundServiceDetails = source('src/pages/ResolveExistingAppsPage/ObservedServiceDetailsSheet.tsx');
  const installer = source('../scripts/autark-os-gui-installer.sh');

  assert.match(terminology, /\| App catalog \| Discover \|/);
  assert.match(terminology, /\| Host-detected resource \| Found on this server \|/);
  assert.match(terminology, /\| External shortcut \| Linked service \|/);
  assert.match(applications, /Open managed apps and keep the linked services on this server in view\./);
  assert.match(foundServiceDetails, /Discover warnings/);
  assert.match(installer, /Discover app installs/);
  assert.doesNotMatch(installer, /Marketplace app installs/);
});

test('the product only describes backup protection after a restore point exists', () => {
  const terminology = source('../docs/product-terminology.md');
  const settings = source('src/pages/SettingsPage/SettingsPage.tsx');

  assert.match(terminology, /Protected by a restore point/);
  assert.match(settings, /Installed apps with at least one completed restore point\./);
});

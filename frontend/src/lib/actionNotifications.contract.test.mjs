import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('story 9 pages route mutation feedback through shared action notification helper', () => {
  const mutationPages = [
    'src/pages/ApplicationsPage/ApplicationsPage.tsx',
    'src/pages/NetworkPage/NetworkPage.tsx',
    'src/pages/SettingsPage/SettingsPage.tsx',
    'src/pages/StoragePage/StoragePage.tsx',
    'src/pages/SupportPage/SupportPage.tsx',
    'src/pages/ResolveExistingAppsPage/ResolveExistingAppsPage.tsx',
  ];

  for (const relativePath of mutationPages) {
    const fileSource = source(relativePath);
    assert.match(fileSource, /showActionNotification/, `${relativePath} should use showActionNotification`);
    assert.doesNotMatch(fileSource, /from 'sonner'/, `${relativePath} should not directly import sonner`);
    assert.doesNotMatch(fileSource, /toast\.(success|info|warning|error)\(/, `${relativePath} should not call sonner directly`);
  }
});

test('story 9 removes duplicate local success banners for settings and cleanup mutations', () => {
  const settingsPage = source('src/pages/SettingsPage/SettingsPage.tsx');
  const storagePage = source('src/pages/StoragePage/StoragePage.tsx');

  assert.doesNotMatch(settingsPage, /setMessage\(/);
  assert.doesNotMatch(settingsPage, /Settings saved\./);
  assert.doesNotMatch(storagePage, /setMessage\(/);
  assert.doesNotMatch(storagePage, /Safety checkpoint:/);
});

test('story 9 exposes reusable error notification handling', () => {
  const helper = source('src/lib/actionNotifications.ts');
  const logic = source('src/lib/actionNotifications.logic.js');

  assert.match(helper, /showActionErrorNotification/);
  assert.match(logic, /actionNotificationFromError/);
});

test('story 9 keeps sonner usage behind the shared notification boundary', () => {
  const allowed = new Set([
    'src/components/ui/sonner.tsx',
    'src/lib/actionNotifications.ts',
  ]);

  for (const relativePath of sourceFiles('src')) {
    if (allowed.has(relativePath)) {
      continue;
    }
    const fileSource = source(relativePath);
    assert.doesNotMatch(fileSource, /from 'sonner'/, `${relativePath} should not import sonner directly`);
    assert.doesNotMatch(fileSource, /toast\.(success|info|warning|error)\(/, `${relativePath} should not call sonner directly`);
  }
});

function sourceFiles(relativeDirectory) {
  const directory = resolve(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      return sourceFiles(relativePath);
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      return [relativePath];
    }
    return [];
  });
}

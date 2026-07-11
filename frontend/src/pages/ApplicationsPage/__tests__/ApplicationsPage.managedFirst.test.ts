import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/ApplicationsPage/ApplicationsPage.tsx'), 'utf8');

test('My Apps renders only the canonical managed collection by default', () => {
  assert.match(page, /const managedItems = useMemo\(\(\) => items\.filter\(\(item\) => item\.managementState === 'managed'\)/);
  assert.match(page, /return managedItems\.filter\(\(item\) => \{/);
  assert.match(page, /title="My Apps"/);
  assert.doesNotMatch(page, /label: 'All', value: 'all'/);
  assert.doesNotMatch(page, /label: 'Found', value: 'found'/);
});

test('My Apps sends non-managed services to the dedicated existing-app review flow', () => {
  assert.match(page, /const foundServices = appState\.foundServices/);
  assert.match(page, /Found on this server/);
  assert.match(page, /Review existing apps/);
  assert.match(page, /navigate\(`\/apps\/found\$\{serviceQuery\}`, \{ replace: true \}\)/);
});

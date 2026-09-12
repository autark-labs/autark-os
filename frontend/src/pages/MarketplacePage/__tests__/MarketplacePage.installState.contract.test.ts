import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/MarketplacePage/MarketplacePage.tsx'), 'utf8');
const repository = readFileSync(resolve(process.cwd(), 'src/repositories/discoverRepository.ts'), 'utf8');

test('catalog refreshes do not own or reset an active install review', () => {
  assert.match(repository, /queryKey: discoverQueryKeys\.apps/);
  assert.doesNotMatch(repository, /applicationStateUpdatedAt/);
  assert.match(page, /setInstallReviewOpen\(false\);\s*\}, \[selectedAppId\]\);/);
  assert.match(page, /if \(!view \|\| setupAnswersAppId === selectedAppId\) \{\s*return;/);
  assert.match(page, /\}, \[apps, selectedAppId, setupAnswersAppId\]\);/);
});

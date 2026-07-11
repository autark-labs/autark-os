import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('unused storage inventory can expand without clearing the selected cleanup target', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');

  assert.match(page, /showAllCleanupCandidates/);
  assert.match(page, /allCleanupCandidates\.slice\(0, 4\)/);
  assert.match(page, /Show all \$\{allCleanupCandidates\.length\} folders/);
  assert.match(page, /Show less/);
  assert.match(page, /setCleanupTarget\(null\)/);
  assert.doesNotMatch(page, /setShowAllCleanupCandidates\([^\n]+setCleanupTarget/);
});

test('cleanup refreshes storage, application state, and activity surfaces after a checkpointed cleanup', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');

  assert.match(page, /Safety checkpoint saved/);
  assert.match(page, /invalidateApplicationState\(queryClient\)/);
  assert.match(page, /homeQueryKeys\.all/);
  assert.match(page, /queryKey: \['monitoring'\]/);
  assert.match(page, /Type `\{target\.name\}` to confirm/);
});

test('advanced technical paths use readable, selectable text', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');

  assert.match(page, /select-text truncate font-mono text-xs text-slate-300/);
  assert.match(page, /select-text break-all font-mono text-xs text-orange-100\/85/);
});

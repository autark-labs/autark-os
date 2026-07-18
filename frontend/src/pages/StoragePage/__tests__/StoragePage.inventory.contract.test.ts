import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('unused storage inventory is progressively disclosed without clearing the selected cleanup target', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');
  const workspace = source('src/pages/StoragePage/StorageCapacityRibbonWorkspace.tsx');

  assert.match(page, /onReviewOrphan=\{setCleanupTarget\}/);
  assert.match(workspace, /setDetailsOpen\(false\);/);
  assert.match(workspace, /report\.orphanedData\.map/);
  assert.match(workspace, /onReview=\{\(\) => onReviewOrphan\(orphan\)\}/);
  assert.match(page, /setCleanupTarget\(null\)/);
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
  const workspace = source('src/pages/StoragePage/StorageCapacityRibbonWorkspace.tsx');

  assert.match(workspace, /select-text truncate font-mono text-xs text-slate-300/);
  assert.match(workspace, /select-text break-all font-mono text-xs text-amber-100\/85/);
});

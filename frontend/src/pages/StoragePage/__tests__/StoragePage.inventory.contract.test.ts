import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('storage details stay in the workspace while cleanup keeps its selected target', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');
  const workspace = source('src/pages/StoragePage/StorageCapacityRibbonWorkspace.tsx');

  assert.match(page, /onReviewOrphan=\{setCleanupTarget\}/);
  assert.match(workspace, /<Tabs className="min-h-0 flex-1 gap-0"/);
  assert.doesNotMatch(workspace, /StorageDetailsSheet/);
  assert.match(workspace, /value="cleanup"/);
  assert.match(workspace, /orphans\.map/);
  assert.match(workspace, /onReview=\{\(\) => onReviewOrphan\(orphan\)\}/);
  assert.match(page, /setCleanupTarget\(null\)/);
});

test('storage app rows use live application artwork with a safe fallback', () => {
  const page = source('src/pages/StoragePage/StoragePage.tsx');
  const workspace = source('src/pages/StoragePage/StorageCapacityRibbonWorkspace.tsx');

  assert.match(page, /storageAppIconUrls/);
  assert.match(page, /catalogAppIconUrl/);
  assert.match(workspace, /function StorageAppIcon/);
  assert.match(workspace, /appIconUrlById/);
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

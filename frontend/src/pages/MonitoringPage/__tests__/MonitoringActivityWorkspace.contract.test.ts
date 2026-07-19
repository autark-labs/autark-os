import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Activity Log uses a bounded A1 workspace while retaining event, attention, and metrics paths', () => {
  const page = source('src/pages/MonitoringPage/MonitoringPage.tsx');
  const workspace = source('src/pages/MonitoringPage/MonitoringActivitySections.tsx');

  assert.match(page, /<PageShell\s+className="xl:h-\[calc\(100dvh-7\.25rem\)\] xl:min-h-0"/);
  assert.match(page, /contained/);
  assert.match(page, /<MonitoringActivityWorkspace/);
  assert.match(page, /advancedMetrics=/);
  assert.match(page, /<MonitoringChartsSection/);

  assert.match(workspace, /ActivityWorkspaceTab = 'all' \| 'attention' \| 'repairs' \| 'apps' \| 'metrics'/);
  assert.match(workspace, /System metrics/);
  assert.match(workspace, /Needs attention/);
  assert.match(workspace, /ActivityFilterBar/);
  assert.match(workspace, /SelectTrigger aria-label="Filter activity by category"/);
  assert.match(workspace, /Selected activity/);
  assert.match(workspace, /Technical detail/);
  assert.match(workspace, /overflow-y-auto/);
});

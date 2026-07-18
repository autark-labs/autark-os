import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();
const page = readFileSync(resolve(root, 'src/pages/SupportPage/SupportPage.tsx'), 'utf8');

test('Diagnostics keeps every support workflow inside the notebook workspace', () => {
  assert.match(page, /function DiagnosticsNotebook/);
  assert.match(page, /orientation="vertical"/);
  assert.match(page, /label: 'Health checks'/);
  assert.match(page, /label: 'Support report'/);
  assert.match(page, /label: 'Technical logs'/);
  assert.match(page, /label: 'Redaction rules'/);
  assert.match(page, /label: 'System details'/);
  assert.match(page, /Diagnostics tools/);
});

test('Diagnostics notebook preserves report, recovery, logs, and advanced detail access', () => {
  assert.match(page, /Copy report/);
  assert.match(page, /Download report/);
  assert.match(page, /Recover existing apps/);
  assert.match(page, /open=\{logsOpen\}/);
  assert.match(page, /onOpenChange=\{setLogsOpen\}/);
  assert.match(page, /title="App ownership details"/);
  assert.match(page, /title="App repair details"/);
  assert.match(page, /title="Docker resources"/);
  assert.match(page, /title="Tailscale details"/);
  assert.match(page, /label="Profiles"/);
  assert.match(page, /label="Build"/);
  assert.match(page, /label="Updates"/);
});

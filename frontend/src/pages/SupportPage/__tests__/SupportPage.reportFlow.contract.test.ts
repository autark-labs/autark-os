import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('support report generation, copy, and download are separate actions', () => {
  const page = source('src/pages/SupportPage/SupportPage.tsx');

  assert.match(page, /function copyBundle/);
  assert.match(page, /function downloadBundle/);
  assert.match(page, /Download report/);
  assert.match(page, /Copy report/);
  assert.match(page, /Support report ready/);
  assert.doesNotMatch(page, /await copyText\(bundle\.bundleText\)/);
});

test('viewing logs controls the disclosure and moves focus to its content', () => {
  const page = source('src/pages/SupportPage/SupportPage.tsx');

  assert.match(page, /open=\{logsOpen\}/);
  assert.match(page, /onOpenChange=\{setLogsOpen\}/);
  assert.match(page, /logsContentRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(page, /defaultOpen=\{logsOpen\}/);
});

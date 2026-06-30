import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Home page uses the tempered Project OS theme instead of the old dark manuscript palette', () => {
  const overviewPage = source('src/pages/OverviewPage/OverviewPage.tsx');

  assert.match(overviewPage, /border-po-warning-border bg-po-warning-soft/);
  assert.match(overviewPage, /text-po-brand/);
  assert.match(overviewPage, /border-po-border bg-po-sidebar\/70/);
  assert.match(overviewPage, /bg-po-surface-inset/);

  assert.doesNotMatch(overviewPage, /violet|purple/i);
  assert.doesNotMatch(overviewPage, /border-white\/10|bg-black\/25|bg-slate|border-slate|text-slate|text-white/);
  assert.doesNotMatch(overviewPage, /amber-\d|red-\d|emerald-\d|sky-\d/);
});

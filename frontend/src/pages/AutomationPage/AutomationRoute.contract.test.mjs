import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('automation preview route and client are removed until automation is productized', () => {
  const app = source('src/App.tsx');

  assert.doesNotMatch(app, /AutomationPreviewPage|path="\/automation"/);
  assert.equal(existsSync(resolve(root, 'src/pages/AutomationPage/AutomationPreviewPage.tsx')), false);
  assert.equal(existsSync(resolve(root, 'src/api/AutomationAPIClient.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/types/automation.ts')), false);
});

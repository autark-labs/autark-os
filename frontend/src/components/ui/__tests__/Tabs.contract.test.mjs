import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('TabsTrigger uses readable Autark-OS tab text on hover and active states', () => {
  const tabs = source('src/components/ui/tabs.tsx');

  assert.match(tabs, /text-sky-100\/70/);
  assert.match(tabs, /hover:text-white/);
  assert.match(tabs, /data-active:text-white/);
  assert.doesNotMatch(tabs, /hover:text-foreground/);
  assert.doesNotMatch(tabs, /data-active:text-foreground/);
});

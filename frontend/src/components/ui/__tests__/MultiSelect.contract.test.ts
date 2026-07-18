import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('MultiSelect keeps its clear-filter action visible without changing the option layout', () => {
  const multiSelect = source('src/components/ui/multi-select.tsx');

  assert.match(multiSelect, /disabled=\{selectedOptions\.length === 0\}/);
  assert.match(multiSelect, /forceMount/);
  assert.match(multiSelect, /value="Clear filters"/);
  assert.doesNotMatch(multiSelect, /\{selectedOptions\.length > 0 && \(/);
});

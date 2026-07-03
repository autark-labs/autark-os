import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Card forwards its DOM ref for outside-click and focus-boundary logic', () => {
  const card = source('src/components/ui/card.tsx');

  assert.match(card, /const Card = React\.forwardRef<HTMLDivElement/);
  assert.match(card, /ref=\{ref\}/);
  assert.match(card, /Card\.displayName = 'Card'/);
});

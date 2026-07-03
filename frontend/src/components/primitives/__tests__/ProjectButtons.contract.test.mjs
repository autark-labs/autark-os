import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('project button primitives forward refs for Radix asChild triggers', () => {
  const buttons = source('src/components/primitives/ProjectButtons.tsx');

  for (const name of [
    'ProjectPrimaryButton',
    'ProjectOpenButton',
    'ProjectLightControlButton',
    'ProjectDarkControlButton',
    'ProjectWarningButton',
  ]) {
    assert.match(buttons, new RegExp(`export const ${name} = forwardRef`));
  }

  assert.match(buttons, /import \{ forwardRef, type ComponentProps \} from 'react';/);
  assert.match(buttons, /ref=\{ref\}/);
  assert.match(buttons, /displayName = 'ProjectDarkControlButton'/);
});

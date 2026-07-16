import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('all blocking surfaces share a low-cost overlay without backdrop filters', () => {
  const overlay = source('src/components/ui/blocking-overlay.ts');
  const blockingSurfaces = [
    'src/components/ui/dialog.tsx',
    'src/components/ui/alert-dialog.tsx',
    'src/components/ui/sheet.tsx',
    'src/components/ui/drawer.tsx',
  ];

  assert.match(overlay, /bg-slate-950\/70/);
  assert.match(overlay, /motion-reduce:animate-none/);
  assert.doesNotMatch(overlay, /backdrop-(?:blur|filter)/);

  for (const surfacePath of blockingSurfaces) {
    const surface = source(surfacePath);
    assert.match(surface, /blockingOverlayClassName/);
    assert.match(surface, /blockingSurfaceMotionClassName/);
    assert.doesNotMatch(surface, /backdrop-(?:blur|filter)/);
  }
});

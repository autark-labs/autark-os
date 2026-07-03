import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('theme selector is app-wide and lives in the system top bar', () => {
  const app = source('src/App.tsx');
  const header = source('src/layout/SystemStatusHeader.tsx');
  const selector = source('src/components/autark-os/ThemeSelectorPopover.tsx');
  const styles = source('src/styles.css');

  assert.match(app, /ThemeProvider/);
  assert.match(header, /ThemeSelectorPopover/);
  assert.match(selector, /useTheme/);
  assert.match(selector, /autarkOsThemes/);
  assert.match(styles, /data-theme="project-slate"/);
  assert.match(styles, /data-theme="harbor"/);
  assert.match(styles, /data-theme="forest"/);
  assert.match(styles, /data-theme="ember"/);
});

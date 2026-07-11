import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

test('Pro route is a noninteractive standalone-app advertisement', () => {
  const page = readFileSync(resolve(root, 'src/pages/ProPage/ProPage.tsx'), 'utf8');

  assert.match(page, /standalone app/);
  assert.match(page, /does not register this server, accept license codes, send heartbeats, or connect to a Pro service/);
  assert.match(page, /to="\/discover"/);
  assert.doesNotMatch(page, /ProAPIClient|api\/pro|licenseCode|registerInstall/);
  assert.equal(existsSync(resolve(root, 'src/api/proApi.ts')), false);
  assert.equal(existsSync(resolve(root, 'src/types/pro.ts')), false);
});

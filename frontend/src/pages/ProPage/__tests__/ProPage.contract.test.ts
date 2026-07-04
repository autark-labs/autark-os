import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { primaryNavigation } from '@/layout/navigationModel';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Pro page has a local route, navigation entry, typed API client, and no hosted frontend coupling', () => {
  assert.equal(existsSync(resolve(root, 'src/types/pro.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/api/proApi.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/pages/ProPage/ProPage.tsx')), true);

  const app = source('src/App.tsx');
  assert.match(app, /const ProPage = lazy/);
  assert.match(app, /path="\/pro"/);

  const proNav = primaryNavigation.find((item) => item.id === 'pro');
  assert.equal(proNav?.label, 'Autark Pro');
  assert.equal(proNav?.to, '/pro');

  const api = source('src/api/proApi.ts');
  assert.match(api, /get<ProStatus>\('\/api\/pro\/status'\)/);
  assert.doesNotMatch(api, /supabase/i);

  const page = source('src/pages/ProPage/ProPage.tsx');
  assert.match(page, /PageShell/);
  assert.match(page, /ProjectPanel/);
  assert.match(page, /ProjectInset/);
  assert.match(page, /ProjectPrimaryButton/);
  assert.match(page, /ProjectDarkControlButton/);
  assert.match(page, /Loading Autark Pro/);
  assert.match(page, /Autark Pro could not load/);
  assert.match(page, /Account linking is coming later\./);
});

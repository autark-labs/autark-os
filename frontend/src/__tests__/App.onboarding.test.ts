import assert from 'node:assert/strict';
import { test } from 'vitest';
import { safePostSetupPath, setupRedirectTarget } from '../App.onboarding';

test('preserves an in-app destination while setup is incomplete', () => {
  assert.equal(setupRedirectTarget('/discover', '?app=vaultwarden', '#details'), '/setup?returnTo=%2Fdiscover%3Fapp%3Dvaultwarden%23details');
});

test('only returns to safe same-app destinations after setup', () => {
  assert.equal(safePostSetupPath('/discover?app=vaultwarden'), '/discover?app=vaultwarden');
  assert.equal(safePostSetupPath('/setup?returnTo=%2Fapps'), '/home');
  assert.equal(safePostSetupPath('//example.com'), '/home');
  assert.equal(safePostSetupPath('https://example.com'), '/home');
  assert.equal(safePostSetupPath(null), '/home');
});

test('a setup return target cannot create a setup redirect loop', () => {
  assert.equal(setupRedirectTarget('/setup', '?returnTo=%2Fapps'), '/setup?returnTo=%2Fsetup%3FreturnTo%3D%252Fapps');
  assert.equal(safePostSetupPath('/setup?returnTo=%2Fapps'), '/home');
});

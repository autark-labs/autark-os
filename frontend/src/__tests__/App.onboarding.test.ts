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

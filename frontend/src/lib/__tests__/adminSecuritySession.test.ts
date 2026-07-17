import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { ADMIN_SESSION_EXPIRED_EVENT, clearLegacyAdminToken, markAdminSessionActive, notifyAdminSessionExpired } from '../adminSecuritySession';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

afterEach(() => markAdminSessionActive());

test('removes the legacy plaintext browser token', () => {
  const storage = memoryStorage();
  storage.setItem('autark-os-admin-token', 'abc123');

  clearLegacyAdminToken(storage);
  assert.equal(storage.values.has('autark-os-admin-token'), false);
});

test('emits only one expired-session event for a burst of unauthorized requests', () => {
  let eventCount = 0;
  const previousDispatch = globalThis.dispatchEvent;
  Object.defineProperty(globalThis, 'dispatchEvent', {
    configurable: true,
    value: (event: Event) => {
      if (event.type === ADMIN_SESSION_EXPIRED_EVENT) eventCount += 1;
      return true;
    },
  });

  notifyAdminSessionExpired();
  notifyAdminSessionExpired();
  assert.equal(eventCount, 1);

  Object.defineProperty(globalThis, 'dispatchEvent', { configurable: true, value: previousDispatch });
});

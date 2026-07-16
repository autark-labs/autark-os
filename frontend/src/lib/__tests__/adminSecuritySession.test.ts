import assert from 'node:assert/strict';
import { test } from 'vitest';
import { applyAdminAuthHeader, clearAdminToken, readAdminToken, writeAdminToken } from '../adminSecuritySession';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('stores and clears the admin session token', () => {
  const storage = memoryStorage();

  writeAdminToken('abc123', storage);
  assert.equal(readAdminToken(storage), 'abc123');

  clearAdminToken(storage);
  assert.equal(readAdminToken(storage), '');
});

test('adds the bearer token to read and mutating requests', () => {
  const storage = memoryStorage();
  writeAdminToken('abc123', storage);

  assert.equal(applyAdminAuthHeader({ method: 'get', headers: {} }, storage).headers.Authorization, 'Bearer abc123');
  assert.equal(applyAdminAuthHeader({ method: 'post', headers: {} }, storage).headers.Authorization, 'Bearer abc123');
});

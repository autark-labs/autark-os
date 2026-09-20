import assert from 'node:assert/strict';
import { test } from 'vitest';
import { productionConflictSummary } from '../SupportPage.logic';

test('Diagnostics copy separates production conflicts from allowed development instances', () => {
  assert.equal(productionConflictSummary({ existingInstall: { conflict: false } }), null);
  assert.equal(productionConflictSummary({ devMode: false, existingInstall: { conflict: true, summary: 'Another install exists.' } }).title, 'Existing Autark-OS install found');
  assert.equal(productionConflictSummary({ devMode: true, existingInstall: { conflict: false, developmentInstanceAllowed: true, resources: [{ id: 'docker:other' }] } }).title, 'Development instance detected');
});

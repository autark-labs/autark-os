import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscoverInstallRequest } from '../DiscoverAPIClient.logic.js';

test('buildDiscoverInstallRequest sends duplicate acknowledgement only when explicitly approved', () => {
  const answers = { hostPort: 8080 };

  assert.deepEqual(buildDiscoverInstallRequest(answers), { answers });
  assert.deepEqual(buildDiscoverInstallRequest(answers, { reinstall: true }), { answers, reinstall: true });
  assert.deepEqual(buildDiscoverInstallRequest(answers, { duplicateAcknowledged: true }), { answers, duplicateAcknowledged: true });
});

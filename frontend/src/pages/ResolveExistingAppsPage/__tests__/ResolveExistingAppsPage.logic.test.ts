import assert from 'node:assert/strict';
import { test } from 'vitest';
import { visibleRecoveryApplications } from '../ResolveExistingAppsPage.logic';

function application(overrides = {}) {
  return {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    relationship: 'available',
    evidence: { id: 'obs_vaultwarden' },
    ...overrides,
  };
}

test('visibleRecoveryApplications uses the canonical relationship and requires evidence', () => {
  const applications = [
    application({ id: 'managed', relationship: 'managed' }),
    application({ id: 'available', relationship: 'available' }),
    application({ id: 'missing-evidence', relationship: 'blocked', evidence: null }),
    application({ id: 'recoverable', relationship: 'recovery_required' }),
    application({ id: 'blocked', relationship: 'blocked' }),
  ];

  assert.deepEqual(visibleRecoveryApplications(applications).map((item) => item.id), ['recoverable', 'blocked']);
});

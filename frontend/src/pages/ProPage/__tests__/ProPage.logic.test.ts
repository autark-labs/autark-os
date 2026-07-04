import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { normalizeLicenseCode, proStatusViewModel } from '../ProPage.logic';
import type { ProStatus } from '@/types/pro';

function status(overrides: Partial<ProStatus> = {}): ProStatus {
  return {
    accountEmail: null,
    accountLinked: false,
    alertsEnabled: true,
    configSnapshotEnabled: false,
    enabled: false,
    entitlementExpiresAt: null,
    entitlementStatus: 'none',
    healthReportingEnabled: true,
    installId: null,
    lastEntitlementCheckAt: null,
    lastFeedSyncAt: null,
    lastHeartbeatAt: null,
    lastHeartbeatResult: null,
    mode: 'free',
    plan: null,
    proFeedEnabled: true,
    registered: false,
    remoteApiConfigured: false,
    remoteApiHealthy: null,
    ...overrides,
  };
}

describe('proStatusViewModel', () => {
  test('describes a fresh install as free and unregistered', () => {
    const view = proStatusViewModel(status());

    assert.equal(view.badge, 'Free');
    assert.equal(view.heading, 'Autark Pro is not registered');
    assert.equal(view.tone, 'muted');
    assert.equal(view.primaryDetail, 'This install is running locally without Pro registration.');
  });

  test('distinguishes registered, active, and disabled Pro states', () => {
    assert.equal(proStatusViewModel(status({ registered: true, installId: 'install_local_123' })).badge, 'Registered');
    assert.equal(proStatusViewModel(status({ enabled: true, registered: true, mode: 'accountless', entitlementStatus: 'active', plan: 'Pro' })).badge, 'Active');
    assert.equal(proStatusViewModel(status({ enabled: false, registered: true, mode: 'accountless', entitlementStatus: 'active' })).badge, 'Disabled');
  });
});

describe('normalizeLicenseCode', () => {
  test('trims license codes before submit and rejects empty input locally', () => {
    assert.equal(normalizeLicenseCode(' AUTARK-PRO-TEST-0001 '), 'AUTARK-PRO-TEST-0001');
    assert.equal(normalizeLicenseCode('   '), '');
  });
});

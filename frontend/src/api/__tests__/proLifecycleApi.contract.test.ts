import { describe, expect, it } from 'vitest';
import { parseProStatusResponse } from '../pro';

function statusFixture() {
  return {
    schemaVersion: '1',
    entitlement: {
      schemaVersion: '1',
      state: 'ACTIVE',
      plan: 'pro_home',
      features: ['autark-pro.extension'],
      updatesThrough: '2029-07-21T12:00:00Z',
      serviceLeaseExpiresAt: '2026-07-22T12:00:00Z',
      lastVerifiedServerTime: '2026-07-21T12:00:00Z',
      localUseAllowed: true,
      updatesAllowed: true,
      hostedServicesAllowed: true,
      grantFingerprint: 'grant_fingerprint',
      reasonCode: 'active',
    },
    device: {
      deviceId: 'device',
      installationId: 'installation',
      publicKeyFingerprint: 'fingerprint',
      registered: true,
    },
    activation: {
      state: 'idle',
      activationId: null,
      expiresAt: null,
    },
    module: {
      state: 'ACTIVE',
      componentVersion: '1.2.3',
      activeDigest: `sha256:${'a'.repeat(64)}`,
      previousDigest: null,
      health: 'healthy',
      jobId: null,
      errorCode: null,
    },
    refresh: {
      inProgress: false,
      lastAttemptAt: null,
      lastSuccessAt: '2026-07-21T12:00:00Z',
      nextAttemptAt: null,
      lastFailureCategory: null,
      consecutiveFailures: 0,
    },
  };
}

describe('public Pro lifecycle status boundary', () => {
  it('accepts an opaque extension grant and complete lifecycle state', () => {
    expect(parseProStatusResponse(statusFixture()).module.health).toBe('healthy');
  });

  it('rejects partial, feature-invalid, and duplicate status payloads', () => {
    expect(() => parseProStatusResponse({ schemaVersion: '1' })).toThrow(TypeError);

    const invalidFeature = statusFixture();
    invalidFeature.entitlement.features = ['Private Feature Label'];
    expect(() => parseProStatusResponse(invalidFeature)).toThrow(TypeError);

    const duplicateFeature = statusFixture();
    duplicateFeature.entitlement.features = [
      'autark-pro.extension',
      'autark-pro.extension',
    ];
    expect(() => parseProStatusResponse(duplicateFeature)).toThrow(TypeError);
  });
});

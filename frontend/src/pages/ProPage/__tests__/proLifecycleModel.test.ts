import { describe, expect, it } from 'vitest';
import type { ProStatusResponse } from '@/api/pro';
import type { ProEntitlementState, ProModuleState } from '@/types/pro';
import { proLifecycleModel } from '../proLifecycleModel';

function status(
  entitlementState: ProEntitlementState,
  moduleState: ProModuleState,
): ProStatusResponse {
  return {
    schemaVersion: '1',
    entitlement: {
      schemaVersion: '1',
      state: entitlementState,
      plan: 'pro_home',
      features: ['autark-pro.extension'],
      updatesThrough: '2029-07-21T12:00:00Z',
      serviceLeaseExpiresAt: '2027-07-21T12:00:00Z',
      lastVerifiedServerTime: '2026-07-21T12:00:00Z',
      localUseAllowed: ['ACTIVE', 'ONLINE_GRACE', 'RETAINED_USE'].includes(entitlementState),
      updatesAllowed: ['ACTIVE', 'ONLINE_GRACE'].includes(entitlementState),
      hostedServicesAllowed: entitlementState === 'ACTIVE',
      grantFingerprint: 'grant',
      reasonCode: entitlementState === 'ACTIVE' ? 'active' : 'safe_fallback',
    },
    device: {
      deviceId: 'device', installationId: 'installation', publicKeyFingerprint: 'fingerprint', registered: entitlementState !== 'NOT_ACTIVATED',
    },
    activation: { state: 'idle', activationId: null, expiresAt: null },
    module: {
      state: moduleState,
      componentVersion: '1.2.3', activeDigest: `sha256:${'a'.repeat(64)}`, previousDigest: null,
      previousComponentVersion: null, candidateVersion: null, health: 'healthy', jobId: null,
      errorCode: null, lastSuccessfulTransitionAt: null, lastTransitionAt: null,
    },
    refresh: { inProgress: false, lastAttemptAt: null, lastSuccessAt: null, nextAttemptAt: null, lastFailureCategory: null, consecutiveFailures: 0 },
  };
}

describe('Pro lifecycle model', () => {
  it('covers every entitlement and module state with user-safe copy', () => {
    const entitlements: ProEntitlementState[] = ['NOT_ACTIVATED', 'ACTIVATING', 'ACTIVE', 'ONLINE_GRACE', 'RETAINED_USE', 'SUSPENDED_ONLINE', 'REVOKED', 'INVALID', 'ERROR'];
    const modules: ProModuleState[] = ['NOT_INSTALLED', 'RELEASE_AVAILABLE', 'DOWNLOADING', 'VERIFYING', 'STARTING_CANDIDATE', 'HEALTH_CHECKING', 'ACTIVE', 'DEGRADED', 'ROLLING_BACK', 'RETAINED_USE', 'UPDATE_INELIGIBLE', 'REMOVING', 'ERROR'];

    for (const entitlementState of entitlements) {
      for (const moduleState of modules) {
        const model = proLifecycleModel(status(entitlementState, moduleState));
        expect(model.title).not.toBe('');
        expect(model.description).not.toMatch(/undefined|null|sha256/i);
      }
    }
  });

  it('separates retained local use from updates and hosted services', () => {
    const model = proLifecycleModel(status('RETAINED_USE', 'RETAINED_USE'));
    expect(model.title).toContain('locally');
    expect(model.primaryAction).toBe('none');
    expect(model.canRefreshEntitlement).toBe(true);
  });

  it('offers only a real signed lifecycle action for active module states', () => {
    expect(proLifecycleModel(status('ACTIVE', 'RELEASE_AVAILABLE')).primaryAction).toBe('install-release');
    expect(proLifecycleModel(status('ACTIVE', 'ACTIVE')).primaryAction).toBe('check-release');
    expect(proLifecycleModel(status('REVOKED', 'ACTIVE')).primaryAction).toBe('none');
  });
});

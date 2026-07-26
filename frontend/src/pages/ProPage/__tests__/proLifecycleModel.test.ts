import { describe, expect, it } from 'vitest';
import type { ProStatusResponse } from '@/api/pro';
import type { ProProductState } from '@/api/proProductState';
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

function product(
  entitlementState: ProEntitlementState,
  moduleState: ProModuleState,
  action = 'none',
): ProProductState {
  const softwareStates: Record<ProEntitlementState, ProProductState['softwareEntitlement']['state']> = {
    NOT_ACTIVATED: 'absent', ACTIVATING: 'activating', ACTIVE: 'active', ONLINE_GRACE: 'grace',
    RETAINED_USE: 'retained_use', SUSPENDED_ONLINE: 'suspended', REVOKED: 'revoked', INVALID: 'invalid', ERROR: 'error',
  };
  const agentStates: Record<ProModuleState, ProProductState['agent']['state']> = {
    NOT_INSTALLED: 'not_installed', RELEASE_AVAILABLE: 'release_available', DOWNLOADING: 'installing',
    VERIFYING: 'installing', STARTING_CANDIDATE: 'installing', HEALTH_CHECKING: 'installing',
    ACTIVE: 'active', DEGRADED: 'degraded', ROLLING_BACK: 'installing', RETAINED_USE: 'retained_use',
    UPDATE_INELIGIBLE: 'update_ineligible', REMOVING: 'removing', ERROR: 'error',
  };
  const localUseAllowed = ['ACTIVE', 'ONLINE_GRACE', 'RETAINED_USE'].includes(entitlementState);
  return {
    schemaVersion: '1',
    overallStatus: localUseAllowed ? 'partial' : 'unavailable',
    softwareEntitlement: { state: softwareStates[entitlementState], localUseAllowed, updatesAllowed: entitlementState === 'ACTIVE', updatesThrough: null, reasonCode: 'fixture' },
    hostedServices: { state: entitlementState === 'ACTIVE' ? 'active' : 'unavailable', allowed: entitlementState === 'ACTIVE', servicesThrough: null, lastVerifiedAt: null, reasonCode: 'fixture' },
    agent: { state: agentStates[moduleState], health: 'healthy', compatibility: moduleState === 'UPDATE_INELIGIBLE' ? 'incompatible' : 'compatible', componentVersion: '1.2.3', digestPrefix: `sha256:${'a'.repeat(12)}`, lastTransitionAt: null, reasonCode: moduleState.toLowerCase() },
    guardian: { state: 'unavailable', schedulerState: 'unavailable', latestAnalysisHealth: 'unavailable', latestAnalysisAt: null, nextAnalysisAt: null, reasonCode: 'not_implemented' },
    localMobile: { state: 'unavailable', pairedDeviceCount: 0, reasonCode: 'not_implemented' },
    hostedMobile: { state: 'unavailable', linkedDeviceCount: 0, relayState: 'unavailable', lastRelayAt: null, reasonCode: 'not_implemented' },
    localCapabilities: [], hostedCapabilities: [],
    recommendedAction: { id: action, reasonCode: 'fixture' },
    checkedAt: '2026-07-26T18:00:00Z',
  };
}

describe('Pro lifecycle model', () => {
  it('covers every entitlement and module state with user-safe copy', () => {
    const entitlements: ProEntitlementState[] = ['NOT_ACTIVATED', 'ACTIVATING', 'ACTIVE', 'ONLINE_GRACE', 'RETAINED_USE', 'SUSPENDED_ONLINE', 'REVOKED', 'INVALID', 'ERROR'];
    const modules: ProModuleState[] = ['NOT_INSTALLED', 'RELEASE_AVAILABLE', 'DOWNLOADING', 'VERIFYING', 'STARTING_CANDIDATE', 'HEALTH_CHECKING', 'ACTIVE', 'DEGRADED', 'ROLLING_BACK', 'RETAINED_USE', 'UPDATE_INELIGIBLE', 'REMOVING', 'ERROR'];

    for (const entitlementState of entitlements) {
      for (const moduleState of modules) {
        const model = proLifecycleModel(
          status(entitlementState, moduleState),
          product(entitlementState, moduleState),
        );
        expect(model.title).not.toBe('');
        expect(model.description).not.toMatch(/undefined|null|sha256/i);
      }
    }
  });

  it('separates retained local use from updates and hosted services', () => {
    const model = proLifecycleModel(
      status('RETAINED_USE', 'RETAINED_USE'),
      product('RETAINED_USE', 'RETAINED_USE'),
    );
    expect(model.title).toContain('locally');
    expect(model.primaryAction).toBe('none');
    expect(model.canRefreshEntitlement).toBe(true);
  });

  it('offers only a real signed lifecycle action for active module states', () => {
    expect(proLifecycleModel(status('ACTIVE', 'RELEASE_AVAILABLE'), product('ACTIVE', 'RELEASE_AVAILABLE', 'install_release')).primaryAction).toBe('install-release');
    expect(proLifecycleModel(status('ACTIVE', 'ACTIVE'), product('ACTIVE', 'ACTIVE', 'check_release')).primaryAction).toBe('check-release');
    expect(proLifecycleModel(status('REVOKED', 'ACTIVE'), product('REVOKED', 'ACTIVE', 'review_entitlement')).primaryAction).toBe('none');
  });
});

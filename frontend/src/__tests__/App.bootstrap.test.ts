import assert from 'node:assert/strict';
import { test } from 'vitest';
import { loadApplicationBootstrap, resolveBootstrapAuthentication } from '../App.bootstrap';
import type { AdminSecurityStatus } from '../api/AdminSecurityAPIClient';
import type { OnboardingState } from '../types/system';

const unclaimedStatus: AdminSecurityStatus = {
  devMode: false,
  claimed: false,
  authRequired: true,
  message: 'Set up an administrator password.',
  setupCodeCommand: 'sudo autark-os admin setup-code',
  passwordResetCommand: 'sudo autark-os admin reset-password',
};

function onboarding(status: OnboardingState['status']): OnboardingState {
  return { status } as OnboardingState;
}

test('does not request protected onboarding state before authentication', async () => {
  let onboardingRequested = false;
  let legacyCleared = false;
  const result = await loadApplicationBootstrap({
    getSecurityStatus: async () => unclaimedStatus,
    getOnboardingState: async () => {
      onboardingRequested = true;
      return onboarding('complete');
    },
    validateAdminSession: async () => false,
    clearLegacyAdminToken: () => { legacyCleared = true; },
  });

  assert.deepEqual(result, {
    securityStatus: unclaimedStatus,
    onboardingComplete: false,
    authenticated: false,
  });
  assert.equal(onboardingRequested, false);
  assert.equal(legacyCleared, true);
});

test('validates the protected cookie session instead of trusting browser state', async () => {
  assert.equal(await resolveBootstrapAuthentication({ ...unclaimedStatus, authRequired: false }, async () => false), true);
  assert.equal(await resolveBootstrapAuthentication({ ...unclaimedStatus, devMode: true }, async () => false), true);
  assert.equal(await resolveBootstrapAuthentication(unclaimedStatus, async () => true), true);
  assert.equal(await resolveBootstrapAuthentication(unclaimedStatus, async () => false), false);
});

test('loads protected onboarding state after the cookie session is authenticated', async () => {
  const result = await loadApplicationBootstrap({
    getSecurityStatus: async () => ({ ...unclaimedStatus, claimed: true }),
    getOnboardingState: async () => onboarding('complete'),
    validateAdminSession: async () => true,
    clearLegacyAdminToken: () => undefined,
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.onboardingComplete, true);
});

test('does not request onboarding when security bootstrap fails', async () => {
  let onboardingRequested = false;

  await assert.rejects(
    loadApplicationBootstrap({
      getSecurityStatus: async () => {
        throw new Error('Backend unavailable');
      },
      getOnboardingState: async () => {
        onboardingRequested = true;
        return onboarding('complete');
      },
      validateAdminSession: async () => false,
      clearLegacyAdminToken: () => undefined,
    }),
    /Backend unavailable/,
  );

  assert.equal(onboardingRequested, false);
});

test('surfaces onboarding bootstrap failures after authentication', async () => {
  await assert.rejects(
    loadApplicationBootstrap({
      getSecurityStatus: async () => unclaimedStatus,
      getOnboardingState: async () => {
        throw new Error('Onboarding unavailable');
      },
      validateAdminSession: async () => true,
      clearLegacyAdminToken: () => undefined,
    }),
    /Onboarding unavailable/,
  );
});

test('can retry bootstrap and recover after a transient failure', async () => {
  let attempts = 0;
  const dependencies = {
    getSecurityStatus: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Backend starting');
      }
      return unclaimedStatus;
    },
    getOnboardingState: async () => onboarding('in_progress'),
    validateAdminSession: async () => false,
    clearLegacyAdminToken: () => undefined,
  };

  await assert.rejects(loadApplicationBootstrap(dependencies), /Backend starting/);

  const recovered = await loadApplicationBootstrap(dependencies);
  assert.equal(recovered.onboardingComplete, false);
  assert.equal(recovered.authenticated, false);
  assert.equal(attempts, 2);
});

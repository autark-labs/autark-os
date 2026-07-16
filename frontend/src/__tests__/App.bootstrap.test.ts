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
  setupCode: 'ABCD-EFGH',
};

function onboarding(status: OnboardingState['status']): OnboardingState {
  return { status } as OnboardingState;
}

test('loads security and onboarding state into one ready bootstrap result', async () => {
  const result = await loadApplicationBootstrap({
    getSecurityStatus: async () => unclaimedStatus,
    getOnboardingState: async () => onboarding('complete'),
    validateAdminToken: async () => false,
    readAdminToken: () => '',
    clearAdminToken: () => undefined,
  });

  assert.deepEqual(result, {
    securityStatus: unclaimedStatus,
    onboardingComplete: true,
    authenticated: false,
  });
});

test('validates stored authentication instead of trusting stale browser state', async () => {
  let cleared = false;
  assert.equal(await resolveBootstrapAuthentication({ ...unclaimedStatus, authRequired: false }, '', async () => false, () => undefined), true);
  assert.equal(await resolveBootstrapAuthentication({ ...unclaimedStatus, devMode: true }, '', async () => false, () => undefined), true);
  assert.equal(await resolveBootstrapAuthentication(unclaimedStatus, 'active-token', async () => true, () => undefined), true);
  assert.equal(await resolveBootstrapAuthentication(unclaimedStatus, '', async () => true, () => undefined), false);
  assert.equal(await resolveBootstrapAuthentication(unclaimedStatus, 'expired-token', async () => false, () => { cleared = true; }), false);
  assert.equal(cleared, true);
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
      validateAdminToken: async () => false,
      readAdminToken: () => '',
      clearAdminToken: () => undefined,
    }),
    /Backend unavailable/,
  );

  assert.equal(onboardingRequested, false);
});

test('surfaces onboarding bootstrap failures without fabricating a ready result', async () => {
  await assert.rejects(
    loadApplicationBootstrap({
      getSecurityStatus: async () => unclaimedStatus,
      getOnboardingState: async () => {
        throw new Error('Onboarding unavailable');
      },
      validateAdminToken: async () => false,
      readAdminToken: () => '',
      clearAdminToken: () => undefined,
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
    validateAdminToken: async () => false,
    readAdminToken: () => '',
    clearAdminToken: () => undefined,
  };

  await assert.rejects(loadApplicationBootstrap(dependencies), /Backend starting/);

  const recovered = await loadApplicationBootstrap(dependencies);
  assert.equal(recovered.onboardingComplete, false);
  assert.equal(recovered.authenticated, false);
  assert.equal(attempts, 2);
});

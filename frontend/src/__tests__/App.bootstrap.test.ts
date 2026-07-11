import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isBootstrapAuthenticated, loadApplicationBootstrap } from '../App.bootstrap';
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
    readAdminToken: () => '',
  });

  assert.deepEqual(result, {
    securityStatus: unclaimedStatus,
    onboardingComplete: true,
    authenticated: false,
  });
});

test('preserves the existing bootstrap authentication mapping', () => {
  assert.equal(isBootstrapAuthenticated({ ...unclaimedStatus, authRequired: false }, ''), true);
  assert.equal(isBootstrapAuthenticated({ ...unclaimedStatus, devMode: true }, ''), true);
  assert.equal(isBootstrapAuthenticated(unclaimedStatus, 'stored-token'), true);
  assert.equal(isBootstrapAuthenticated(unclaimedStatus, ''), false);
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
      readAdminToken: () => '',
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
      readAdminToken: () => '',
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
    readAdminToken: () => '',
  };

  await assert.rejects(loadApplicationBootstrap(dependencies), /Backend starting/);

  const recovered = await loadApplicationBootstrap(dependencies);
  assert.equal(recovered.onboardingComplete, false);
  assert.equal(recovered.authenticated, false);
  assert.equal(attempts, 2);
});

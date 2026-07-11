import type { AdminSecurityStatus } from './api/AdminSecurityAPIClient';
import type { OnboardingState } from './types/system';

export type ApplicationBootstrap = {
  securityStatus: AdminSecurityStatus;
  onboardingComplete: boolean;
  authenticated: boolean;
};

export type ApplicationBootstrapDependencies = {
  getSecurityStatus: () => Promise<AdminSecurityStatus>;
  getOnboardingState: () => Promise<OnboardingState>;
  readAdminToken: () => string;
};

export async function loadApplicationBootstrap({ getSecurityStatus, getOnboardingState, readAdminToken }: ApplicationBootstrapDependencies): Promise<ApplicationBootstrap> {
  const securityStatus = await getSecurityStatus();
  const onboarding = await getOnboardingState();

  return {
    securityStatus,
    onboardingComplete: onboarding.status === 'complete',
    authenticated: isBootstrapAuthenticated(securityStatus, readAdminToken()),
  };
}

export function isBootstrapAuthenticated(status: AdminSecurityStatus, adminToken: string): boolean {
  return !status.authRequired || status.devMode || Boolean(adminToken);
}

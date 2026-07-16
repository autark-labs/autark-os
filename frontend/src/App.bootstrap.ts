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
  validateAdminToken: (token: string) => Promise<boolean>;
  readAdminToken: () => string;
  clearAdminToken: () => void;
};

export async function loadApplicationBootstrap({ getSecurityStatus, getOnboardingState, validateAdminToken, readAdminToken, clearAdminToken }: ApplicationBootstrapDependencies): Promise<ApplicationBootstrap> {
  const securityStatus = await getSecurityStatus();
  const adminToken = readAdminToken();
  const authenticated = await resolveBootstrapAuthentication(securityStatus, adminToken, validateAdminToken, clearAdminToken);
  const onboarding = await getOnboardingState();

  return {
    securityStatus,
    onboardingComplete: onboarding.status === 'complete',
    authenticated,
  };
}

export async function resolveBootstrapAuthentication(
  status: AdminSecurityStatus,
  adminToken: string,
  validateAdminToken: (token: string) => Promise<boolean>,
  clearAdminToken: () => void,
): Promise<boolean> {
  if (!status.authRequired || status.devMode) return true;
  if (!adminToken) return false;
  const authenticated = await validateAdminToken(adminToken);
  if (!authenticated) clearAdminToken();
  return authenticated;
}

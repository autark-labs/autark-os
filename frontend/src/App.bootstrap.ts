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
  validateAdminSession: () => Promise<boolean>;
  clearLegacyAdminToken: () => void;
};

export async function loadApplicationBootstrap({ getSecurityStatus, getOnboardingState, validateAdminSession, clearLegacyAdminToken }: ApplicationBootstrapDependencies): Promise<ApplicationBootstrap> {
  const securityStatus = await getSecurityStatus();
  clearLegacyAdminToken();
  const authenticated = await resolveBootstrapAuthentication(securityStatus, validateAdminSession);
  const onboarding = authenticated ? await getOnboardingState() : null;

  return {
    securityStatus,
    onboardingComplete: onboarding?.status === 'complete',
    authenticated,
  };
}

export async function resolveBootstrapAuthentication(
  status: AdminSecurityStatus,
  validateAdminSession: () => Promise<boolean>,
): Promise<boolean> {
  if (!status.authRequired || status.devMode) return true;
  return validateAdminSession();
}

import type { AppRecoveryPlan } from '@/types/appRecovery';
import type { AutarkOsJob } from '@/types/jobs';
import { httpClient } from './httpClient';

export const AppRecoveryAPIClient = {
  async plan(appId: string) {
    const response = await httpClient.get<AppRecoveryPlan>(`/api/app-recovery/${encodeURIComponent(appId)}/plan`);
    return response.data;
  },

  async apply(appId: string, planId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/app-recovery/${encodeURIComponent(appId)}/apply`, {
      planId,
    });
    return response.data;
  },
};

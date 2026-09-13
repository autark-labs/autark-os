import type { AppRecoveryPlan, AppRecoveryResult } from '@/types/appRecovery';
import { httpClient } from './httpClient';

export const AppRecoveryAPIClient = {
  async plan(appId: string) {
    const response = await httpClient.get<AppRecoveryPlan>(`/api/app-recovery/${encodeURIComponent(appId)}/plan`);
    return response.data;
  },

  async apply(appId: string, confirmation: string) {
    const response = await httpClient.post<AppRecoveryResult>(`/api/app-recovery/${encodeURIComponent(appId)}/apply`, { confirmation });
    return response.data;
  },
};

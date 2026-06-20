import { httpClient } from './httpClient';
import type { InstallOptions, InstallPlan, InstallResult } from '@/types/marketplace';

export const MarketplaceInstallClient = {
  async plan(appId: string, options: InstallOptions | Record<string, never> = {}) {
    const response = await httpClient.post<InstallPlan>(`/api/marketplace/apps/${appId}/plan`, options);
    return response.data;
  },

  async install(appId: string, options: InstallOptions | Record<string, never> = {}) {
    const response = await httpClient.post<InstallResult>(`/api/marketplace/apps/${appId}/install`, options);
    return response.data;
  },
};

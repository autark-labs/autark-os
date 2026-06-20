import { httpClient } from './httpClient';
import type { MarketplaceApp } from '@/types/marketplace';

export const MarketplaceAPIClient = {
  async listApps() {
    const response = await httpClient.get<MarketplaceApp[]>('/api/marketplace/apps');
    return response.data;
  },

  async getApp(id: string) {
    const response = await httpClient.get<MarketplaceApp>(`/api/marketplace/apps/${id}`);
    return response.data;
  },
};

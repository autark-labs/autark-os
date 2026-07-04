import { httpClient } from './httpClient';
import type { ProStatus } from '@/types/pro';

export const ProAPIClient = {
  async status() {
    const response = await httpClient.get<ProStatus>('/api/pro/status');
    return response.data;
  },

  async register() {
    const response = await httpClient.post<ProStatus>('/api/pro/register');
    return response.data;
  },

  async redeemLicense(licenseCode: string) {
    const response = await httpClient.post<ProStatus>('/api/pro/redeem-license', { licenseCode });
    return response.data;
  },
};

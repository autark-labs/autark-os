import { httpClient } from './httpClient';
import type { ProPrivacyPayloadPreview, ProStatus } from '@/types/pro';

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

  async privacyPayloadPreview() {
    const response = await httpClient.get<ProPrivacyPayloadPreview>('/api/pro/privacy/payload-preview');
    return response.data;
  },

  async sendHeartbeatNow() {
    const response = await httpClient.post<ProStatus>('/api/pro/heartbeat/send-now');
    return response.data;
  },

  async syncProFeed() {
    const response = await httpClient.post<ProStatus>('/api/pro/feed/sync');
    return response.data;
  },

  async disableLocally() {
    const response = await httpClient.post<ProStatus>('/api/pro/disable');
    return response.data;
  },
};

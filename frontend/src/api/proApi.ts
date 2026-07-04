import { httpClient } from './httpClient';
import type { ProStatus } from '@/types/pro';

export const ProAPIClient = {
  async status() {
    const response = await httpClient.get<ProStatus>('/api/pro/status');
    return response.data;
  },
};

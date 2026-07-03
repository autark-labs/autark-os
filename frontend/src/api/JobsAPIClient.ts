import { httpClient } from './httpClient';
import type { AutarkOsJob } from '@/types/jobs';

export const JobsAPIClient = {
  async list() {
    const response = await httpClient.get<AutarkOsJob[]>('/api/jobs');
    return response.data;
  },

  async get(jobId: string) {
    const response = await httpClient.get<AutarkOsJob>(`/api/jobs/${jobId}`);
    return response.data;
  },

  async cancel(jobId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/jobs/${jobId}/cancel`);
    return response.data;
  },
};

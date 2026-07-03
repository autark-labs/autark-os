import { httpClient } from './httpClient';
import type { AutarkOsJob } from '@/types/jobs';
import type { DiscoverAppView, DiscoverInstallPreview, DiscoverInstallRequestOptions, DiscoverSetupSchema } from '@/types/discover';
import { buildDiscoverInstallRequest } from './DiscoverAPIClient.logic';

export const DiscoverAPIClient = {
  async listApps() {
    const response = await httpClient.get<DiscoverAppView[]>('/api/discover/apps');
    return response.data;
  },

  async getApp(appId: string) {
    const response = await httpClient.get<DiscoverAppView>(`/api/discover/apps/${appId}`);
    return response.data;
  },

  async setupSchema(appId: string) {
    const response = await httpClient.get<DiscoverSetupSchema>(`/api/discover/apps/${appId}/setup-schema`);
    return response.data;
  },

  async installPreview(appId: string, answers: Record<string, unknown>) {
    const response = await httpClient.post<DiscoverInstallPreview>(`/api/discover/apps/${appId}/install-preview`, { answers });
    return response.data;
  },

  async install(appId: string, answers: Record<string, unknown>, options: DiscoverInstallRequestOptions = {}) {
    const response = await httpClient.post<AutarkOsJob>(`/api/discover/apps/${appId}/install`, buildDiscoverInstallRequest(answers, options));
    return response.data;
  },
};

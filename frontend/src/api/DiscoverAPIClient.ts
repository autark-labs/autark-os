import { httpClient } from './httpClient';
import type { ProjectOsJob } from '@/types/jobs';
import type { DiscoverAppView, DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';

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

  async install(appId: string, answers: Record<string, unknown>, reinstall = false) {
    const response = await httpClient.post<ProjectOsJob>(`/api/discover/apps/${appId}/install`, { answers, reinstall });
    return response.data;
  },
};

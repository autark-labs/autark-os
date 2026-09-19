import { httpClient } from './httpClient';
import type { AppActionResult, AppReliabilitySummary, AppSettingsChangePlan, AppTelemetry, InstallSettings, UninstallPlan } from '@/types/app';
import type { AutarkOsJob } from '@/types/jobs';

export type InstalledAppLifecycleAction = 'start' | 'stop' | 'restart';
export type InstalledAppAction = InstalledAppLifecycleAction | 'repair';

export const InstalledAppsAPIClient = {
  async reliabilitySummary() {
    const response = await httpClient.get<AppReliabilitySummary>('/api/apps/reliability');
    return response.data;
  },

  async appTelemetry(appId: string) {
    const response = await httpClient.get<AppTelemetry>(`/api/apps/${appId}/telemetry`);
    return response.data;
  },

  async uninstallPlan(appId: string) {
    const response = await httpClient.get<UninstallPlan>(`/api/apps/${appId}/uninstall-plan`);
    return response.data;
  },

  async runAction(appId: string, action: InstalledAppLifecycleAction) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/${action}`);
    return response.data;
  },

  async repair(appId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/repair`);
    return response.data;
  },

  async enablePrivateAccess(appId: string) {
    const response = await httpClient.post<AppActionResult>(`/api/apps/${appId}/private-access/enable`);
    return response.data;
  },

  async disablePrivateAccess(appId: string) {
    const response = await httpClient.post<AppActionResult>(`/api/apps/${appId}/private-access/disable`);
    return response.data;
  },

  async updateSettings(appId: string, settings: InstallSettings) {
    const response = await httpClient.put<AutarkOsJob>(`/api/apps/${appId}/settings`, settings);
    return response.data;
  },

  async settingsChangePlan(appId: string, settings: InstallSettings) {
    const response = await httpClient.post<AppSettingsChangePlan>(`/api/apps/${appId}/settings-plan`, settings);
    return response.data;
  },

  async uninstall(appId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/uninstall`);
    return response.data;
  },
};
